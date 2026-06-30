import { BUNDLED_SAMPLES } from "./bundled-samples";
import { decodeAudioBuffer } from "./audio-buffer-decoder";
import { LookaheadScheduler } from "./lookahead-scheduler";
import { connectMixerEffectGraph } from "./mixer-effects";
import {
  resolveSamplerPlaybackPlan,
  resolveSamplerVoiceRelease,
} from "./sampler-sustain";
import type {
  AudioEngine,
  AudioEngineSnapshot,
  BundledSampleMeta,
  MixerLevelSnapshot,
  NoteLoopEvent,
  PlaySampleOptions,
  SampleId,
  SampleLoopEvent,
  StartClipLoopOptions,
  StartSampleLoopOptions,
  TransportSnapshot,
} from "./types";
import {
  getPitchedInstrument,
  getSampleZoneForMidiNote,
  createDefaultMasterMixerState,
  decibelsToLinearGain,
  getTrackEffectiveGain,
  getTrackMixerState,
  normalizeTrackMixerState,
  type MasterMixerState,
  type SampleZone,
  type TrackId,
  type TrackMixerState,
} from "../model";
import {
  DEFAULT_TEMPO_BPM,
  TICKS_PER_4_4_BAR,
  clampTempoBpm,
  ticksToSeconds,
} from "../utils";

const DEFAULT_SAMPLE_GAIN = 0.9;
const DEFAULT_SYNTH_GAIN = 0.22;
const DEFAULT_SAMPLER_GAIN = 0.72;

type AudioContextConstructor = new () => AudioContext;

type ClipLoopEvent =
  | ({ kind: "note" } & NoteLoopEvent)
  | ({ kind: "sample" } & SampleLoopEvent);

interface ActiveNoteVoice {
  gainNode: GainNode;
  isReleasing: boolean;
  releaseSeconds: number;
  sourceNode: AudioScheduledSourceNode;
  startTime: number;
}

interface ActiveSamplePreview {
  gainNode: GainNode;
  sourceNode: AudioBufferSourceNode;
}

interface MixerRoute {
  analyserNode: AnalyserNode;
  effectNodes: AudioNode[];
  gainNode: GainNode;
  inputNode: GainNode;
  meterBuffer: Uint8Array<ArrayBuffer>;
}

export function createAudioEngine(
  samples: readonly BundledSampleMeta[] = BUNDLED_SAMPLES,
): AudioEngine {
  return new BrowserAudioEngine(samples);
}

export class BrowserAudioEngine implements AudioEngine {
  private readonly samplesById: Map<SampleId, BundledSampleMeta>;
  private readonly sampleCache = new Map<SampleId, AudioBuffer>();
  private readonly loadingSamples = new Map<SampleId, Promise<AudioBuffer>>();
  private readonly activeNoteVoices = new Set<ActiveNoteVoice>();
  private readonly activeSampleVoices = new Set<ActiveSamplePreview>();
  private activeSamplePreview: ActiveSamplePreview | null = null;
  private audioContext: AudioContext | null = null;
  private sampleLoopUpdateToken = 0;
  private clipLoopScheduler: LookaheadScheduler<ClipLoopEvent> | null = null;
  private masterMixerState: MasterMixerState = createDefaultMasterMixerState();
  private masterRoute: MixerRoute | null = null;
  private tempoBpm = DEFAULT_TEMPO_BPM;
  private readonly trackMixerStatesById = new Map<TrackId, TrackMixerState>();
  private readonly trackRoutes = new Map<TrackId, MixerRoute>();

  constructor(samples: readonly BundledSampleMeta[]) {
    this.samplesById = new Map(samples.map((sample) => [sample.id, sample]));
  }

  getSnapshot(): AudioEngineSnapshot {
    return {
      contextState: this.audioContext?.state ?? "not-created",
      loadedSampleIds: Array.from(this.sampleCache.keys()),
      transport: this.getTransportSnapshot(),
    };
  }

  getTransportSnapshot(): TransportSnapshot {
    if (this.clipLoopScheduler) {
      return this.clipLoopScheduler.getSnapshot();
    }

    return {
      audioStartTime: null,
      currentTick: 0,
      loopEndTick: TICKS_PER_4_4_BAR,
      loopStartTick: 0,
      nextScheduleTick: 0,
      status: "stopped",
      tempoBpm: this.tempoBpm,
    };
  }

  getMixerLevels(trackIds: readonly TrackId[] = []): MixerLevelSnapshot {
    const trackLevels: Record<TrackId, number> = {};

    for (const trackId of trackIds) {
      const route = this.trackRoutes.get(trackId);

      trackLevels[trackId] = route ? getAnalyserLevel(route) : 0;
    }

    return {
      masterLevel: this.masterRoute ? getAnalyserLevel(this.masterRoute) : 0,
      trackLevels,
    };
  }

  async resume(): Promise<AudioEngineSnapshot> {
    const audioContext = this.getOrCreateAudioContext();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    return this.getSnapshot();
  }

  async suspend(): Promise<AudioEngineSnapshot> {
    this.stopLoop();

    if (this.audioContext && this.audioContext.state === "running") {
      await this.audioContext.suspend();
    }

    return this.getSnapshot();
  }

  setMasterMixerState(state: MasterMixerState): void {
    this.masterMixerState = {
      volumeDb: state.volumeDb,
    };
    this.applyMasterMixerGain();
  }

  setTrackMixerStates(states: readonly TrackMixerState[]): void {
    this.trackMixerStatesById.clear();

    for (const state of states) {
      const normalizedState = normalizeTrackMixerState(state);

      this.trackMixerStatesById.set(normalizedState.trackId, normalizedState);
    }

    this.applyTrackMixerGains();
    this.applyTrackMixerEffects();
  }

  async loadSample(sampleId: SampleId): Promise<AudioBuffer> {
    const cachedBuffer = this.sampleCache.get(sampleId);

    if (cachedBuffer) {
      return cachedBuffer;
    }

    const pendingLoad = this.loadingSamples.get(sampleId);

    if (pendingLoad) {
      return pendingLoad;
    }

    const sample = this.getSample(sampleId);
    const loadPromise = this.fetchAndDecodeSample(sample)
      .then((audioBuffer) => {
        this.sampleCache.set(sampleId, audioBuffer);
        return audioBuffer;
      })
      .finally(() => {
        this.loadingSamples.delete(sampleId);
      });

    this.loadingSamples.set(sampleId, loadPromise);
    return loadPromise;
  }

  async loadAllSamples(): Promise<AudioEngineSnapshot> {
    await Promise.all(
      Array.from(this.samplesById.keys(), (sampleId) => this.loadSample(sampleId)),
    );

    return this.getSnapshot();
  }

  async importSampleFile(sampleId: SampleId, file: File): Promise<AudioBuffer> {
    return this.importSampleBlob(sampleId, file, file.name);
  }

  async importSampleBlob(
    sampleId: SampleId,
    blob: Blob,
    fileName = "imported sample",
  ): Promise<AudioBuffer> {
    await this.resume();

    const audioContext = this.getOrCreateAudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await decodeAudioBuffer({
      arrayBuffer,
      audioContext,
      errorMessage: `Failed to decode imported WAV file "${fileName}".`,
    });

    this.loadingSamples.delete(sampleId);
    this.sampleCache.set(sampleId, audioBuffer);
    return audioBuffer;
  }

  async playSample(
    sampleId: SampleId,
    options: PlaySampleOptions = {},
  ): Promise<void> {
    await this.resume();
    await this.loadSample(sampleId);

    this.scheduleLoadedSample(sampleId, options);
  }

  async playCachedSample(
    sampleId: SampleId,
    options: PlaySampleOptions = {},
  ): Promise<void> {
    await this.resume();
    this.stopCachedSamplePreview();
    this.activeSamplePreview = this.scheduleLoadedSample(sampleId, options);
  }

  async startSampleLoop({
    events,
    loopEndTick = TICKS_PER_4_4_BAR,
    loopStartTick = 0,
    lookaheadMs,
    ppq,
    scheduleAheadTime,
    startTick,
    tempoBpm,
  }: StartSampleLoopOptions): Promise<TransportSnapshot> {
    return this.startClipLoop({
      loopEndTick,
      loopStartTick,
      lookaheadMs,
      noteEvents: [],
      ppq,
      sampleEvents: events,
      scheduleAheadTime,
      startTick,
      tempoBpm,
    });
  }

  async startClipLoop({
    loopEndTick = TICKS_PER_4_4_BAR,
    loopStartTick = 0,
    lookaheadMs,
    noteEvents,
    ppq,
    sampleEvents,
    scheduleAheadTime,
    startTick,
    tempoBpm,
  }: StartClipLoopOptions): Promise<TransportSnapshot> {
    const normalizedTempoBpm = clampTempoBpm(tempoBpm);

    await this.resume();

    await Promise.all([
      this.loadSamplesForLoopEvents(sampleEvents),
      this.loadSamplesForNoteLoopEvents(noteEvents),
    ]);

    this.stopLoop();

    const audioContext = this.getOrCreateAudioContext();
    this.clipLoopScheduler = new LookaheadScheduler<ClipLoopEvent>({
      events: createClipLoopEvents({ noteEvents, sampleEvents }),
      getAudioTime: () => audioContext.currentTime,
      lookaheadMs,
      loopEndTick,
      loopStartTick,
      ppq,
      scheduleAheadTime,
      scheduleEvent: ({ audioTime, event, tempoBpm: scheduledTempoBpm }) => {
        if (event.kind === "sample") {
          this.scheduleLoadedSample(event.sampleId, {
            gain: event.gain,
            trackId: event.trackId,
            when: audioTime,
          });
          return;
        }

        this.schedulePitchedNote(event, {
          tempoBpm: scheduledTempoBpm,
          when: audioTime,
        });
      },
      tempoBpm: normalizedTempoBpm,
    });
    this.tempoBpm = normalizedTempoBpm;

    return this.clipLoopScheduler.start({ startTick });
  }

  pauseLoop(): TransportSnapshot {
    this.sampleLoopUpdateToken += 1;
    this.stopActiveSampleVoices();
    this.stopActiveNoteVoices();

    if (!this.clipLoopScheduler) {
      return this.getTransportSnapshot();
    }

    return this.clipLoopScheduler.pause();
  }

  stopLoop(): TransportSnapshot {
    this.sampleLoopUpdateToken += 1;
    this.stopActiveSampleVoices();
    this.stopActiveNoteVoices();

    if (!this.clipLoopScheduler) {
      return this.getTransportSnapshot();
    }

    const snapshot = this.clipLoopScheduler.stop();
    this.tempoBpm = snapshot.tempoBpm;
    this.clipLoopScheduler = null;
    return snapshot;
  }

  setTempoBpm(tempoBpm: number): TransportSnapshot {
    const normalizedTempoBpm = clampTempoBpm(tempoBpm);

    this.tempoBpm = normalizedTempoBpm;

    if (!this.clipLoopScheduler) {
      return this.getTransportSnapshot();
    }

    return this.clipLoopScheduler.setTempoBpm(normalizedTempoBpm);
  }

  async updateSampleLoopEvents(
    events: readonly SampleLoopEvent[],
  ): Promise<TransportSnapshot> {
    return this.updateClipLoopEvents({
      noteEvents: [],
      sampleEvents: events,
    });
  }

  async updateClipLoopEvents({
    noteEvents,
    sampleEvents,
  }: {
    noteEvents: readonly NoteLoopEvent[];
    sampleEvents: readonly SampleLoopEvent[];
  }): Promise<TransportSnapshot> {
    if (!this.clipLoopScheduler) {
      return this.getTransportSnapshot();
    }

    const updateToken = (this.sampleLoopUpdateToken += 1);

    await Promise.all([
      this.loadSamplesForLoopEvents(sampleEvents),
      this.loadSamplesForNoteLoopEvents(noteEvents),
    ]);

    if (updateToken !== this.sampleLoopUpdateToken || !this.clipLoopScheduler) {
      return this.getTransportSnapshot();
    }

    this.clipLoopScheduler.setEvents(
      createClipLoopEvents({ noteEvents, sampleEvents }),
    );
    return this.clipLoopScheduler.getSnapshot();
  }

  stopCachedSamplePreview(): void {
    if (!this.activeSamplePreview) {
      return;
    }

    const activeSamplePreview = this.activeSamplePreview;
    this.activeSamplePreview = null;

    this.stopAndDisconnectSampleVoice(
      activeSamplePreview,
      this.audioContext?.currentTime ?? 0,
    );
  }

  private scheduleLoadedSample(
    sampleId: SampleId,
    options: PlaySampleOptions & { trackId?: TrackId } = {},
  ): ActiveSamplePreview {
    const audioContext = this.getOrCreateAudioContext();
    const audioBuffer = this.sampleCache.get(sampleId);

    if (!audioBuffer) {
      throw new Error(`Sample "${sampleId}" must be loaded before scheduling.`);
    }

    const sourceNode = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    sourceNode.buffer = audioBuffer;
    sourceNode.loop = options.loop ?? false;
    gainNode.gain.value = options.gain ?? DEFAULT_SAMPLE_GAIN;
    sourceNode.connect(gainNode);
    this.connectSourceGain(gainNode, options.trackId);
    const sampleVoice = {
      gainNode,
      sourceNode,
    };

    this.activeSampleVoices.add(sampleVoice);
    sourceNode.addEventListener(
      "ended",
      () => {
        if (this.activeSamplePreview?.sourceNode === sourceNode) {
          this.activeSamplePreview = null;
        }

        this.activeSampleVoices.delete(sampleVoice);
        disconnectAudioNode(sourceNode);
        disconnectAudioNode(gainNode);
      },
      { once: true },
    );
    sourceNode.start(
      Math.max(options.when ?? audioContext.currentTime, audioContext.currentTime),
    );

    return sampleVoice;
  }

  private schedulePitchedNote(
    event: NoteLoopEvent,
    {
      tempoBpm,
      when,
    }: {
      tempoBpm: number;
      when: number;
    },
  ): void {
    const instrument = getPitchedInstrument(event.instrumentId);

    if (instrument.kind !== "sample") {
      this.scheduleSynthNote(event, { tempoBpm, when });
      return;
    }

    const sampleZone = getSampleZoneForMidiNote({
      instrument,
      midiNote: event.midiNote,
    });

    if (!sampleZone) {
      this.scheduleSynthNote(event, { tempoBpm, when });
      return;
    }

    this.scheduleSampledPitchedNote(event, {
      sampleZone,
      tempoBpm,
      when,
    });
  }

  private scheduleSynthNote(
    event: NoteLoopEvent,
    {
      tempoBpm,
      when,
    }: {
      tempoBpm: number;
      when: number;
    },
  ): void {
    const audioContext = this.getOrCreateAudioContext();
    const sourceNode = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const startTime = Math.max(when, audioContext.currentTime);
    const durationSeconds = Math.max(
      ticksToSeconds(event.durationTicks, { tempoBpm }),
      0.01,
    );
    const stopTime = startTime + durationSeconds;
    const attackSeconds = Math.min(0.01, durationSeconds / 4);
    const releaseSeconds = Math.min(0.04, durationSeconds / 3);
    const sustainEndTime = Math.max(
      startTime + attackSeconds,
      stopTime - releaseSeconds,
    );
    const gainValue = DEFAULT_SYNTH_GAIN * (event.gain ?? 1);
    const synthVoice: ActiveNoteVoice = {
      gainNode,
      isReleasing: false,
      releaseSeconds,
      sourceNode,
      startTime,
    };

    sourceNode.type = "triangle";
    sourceNode.frequency.setValueAtTime(
      midiNoteToFrequency(event.midiNote),
      startTime,
    );

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(gainValue, startTime + attackSeconds);
    gainNode.gain.setValueAtTime(gainValue, sustainEndTime);
    gainNode.gain.linearRampToValueAtTime(0, stopTime);

    sourceNode.connect(gainNode);
    this.connectSourceGain(gainNode, event.trackId);
    this.activeNoteVoices.add(synthVoice);
    sourceNode.addEventListener(
      "ended",
      () => {
        this.activeNoteVoices.delete(synthVoice);
        disconnectAudioNode(sourceNode);
        disconnectAudioNode(gainNode);
      },
      { once: true },
    );

    sourceNode.start(startTime);
    sourceNode.stop(stopTime);
  }

  private scheduleSampledPitchedNote(
    event: NoteLoopEvent,
    {
      sampleZone,
      tempoBpm,
      when,
    }: {
      sampleZone: SampleZone;
      tempoBpm: number;
      when: number;
    },
  ): void {
    const audioContext = this.getOrCreateAudioContext();
    const { sampleId } = sampleZone;
    const audioBuffer = this.sampleCache.get(sampleId);

    if (!audioBuffer) {
      throw new Error(`Sample "${sampleId}" must be loaded before scheduling.`);
    }

    const sourceNode = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    const startTime = Math.max(when, audioContext.currentTime);
    const durationSeconds = Math.max(
      ticksToSeconds(event.durationTicks, { tempoBpm }),
      0.01,
    );
    const playbackRate = midiNoteToPlaybackRate(
      event.midiNote,
      sampleZone.rootMidiNote,
    );
    const playbackPlan = resolveSamplerPlaybackPlan({
      bufferDurationSeconds: audioBuffer.duration,
      noteDurationSeconds: durationSeconds,
      playbackRate,
      sampleZone,
    });
    const noteStopTime = startTime + durationSeconds;
    const unloopedSampleStopTime =
      startTime + playbackPlan.unloopedPlaybackDurationSeconds;
    const stopTime = playbackPlan.sustainLoopRegion
      ? noteStopTime
      : Math.min(noteStopTime, unloopedSampleStopTime);
    const voiceDurationSeconds = Math.max(stopTime - startTime, 0.01);
    const attackSeconds = Math.min(
      playbackPlan.envelope.attackSeconds,
      voiceDurationSeconds / 4,
    );
    const releaseSeconds = Math.min(
      playbackPlan.envelope.releaseSeconds,
      voiceDurationSeconds / 2,
      Math.max(voiceDurationSeconds - attackSeconds, 0),
    );
    const sustainEndTime = Math.max(
      startTime + attackSeconds,
      stopTime - releaseSeconds,
    );
    const gainValue = DEFAULT_SAMPLER_GAIN * (event.gain ?? 1);
    const sampleVoice: ActiveNoteVoice = {
      gainNode,
      isReleasing: false,
      releaseSeconds,
      sourceNode,
      startTime,
    };

    sourceNode.buffer = audioBuffer;
    sourceNode.playbackRate.setValueAtTime(playbackRate, startTime);

    if (playbackPlan.sustainLoopRegion) {
      sourceNode.loop = true;
      sourceNode.loopStart = playbackPlan.sustainLoopRegion.loopStartSeconds;
      sourceNode.loopEnd = playbackPlan.sustainLoopRegion.loopEndSeconds;
    }

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(gainValue, startTime + attackSeconds);
    gainNode.gain.setValueAtTime(gainValue, sustainEndTime);
    gainNode.gain.linearRampToValueAtTime(0, stopTime);

    sourceNode.connect(gainNode);
    this.connectSourceGain(gainNode, event.trackId);
    this.activeNoteVoices.add(sampleVoice);
    sourceNode.addEventListener(
      "ended",
      () => {
        this.activeNoteVoices.delete(sampleVoice);
        disconnectAudioNode(sourceNode);
        disconnectAudioNode(gainNode);
      },
      { once: true },
    );

    sourceNode.start(startTime, playbackPlan.sampleOffsetSeconds);
    sourceNode.stop(stopTime);
  }

  private stopActiveNoteVoices(): void {
    const currentTime = this.audioContext?.currentTime ?? 0;

    for (const noteVoice of this.activeNoteVoices) {
      if (noteVoice.isReleasing) {
        continue;
      }

      noteVoice.isReleasing = true;

      if (currentTime < noteVoice.startTime) {
        this.stopAndDisconnectVoice(noteVoice, currentTime);
        continue;
      }

      const release = resolveSamplerVoiceRelease({
        currentTime,
        releaseSeconds: noteVoice.releaseSeconds,
      });

      try {
        noteVoice.gainNode.gain.cancelScheduledValues(release.releaseStartTime);
        noteVoice.gainNode.gain.setValueAtTime(
          Math.max(noteVoice.gainNode.gain.value, 0),
          release.releaseStartTime,
        );
        noteVoice.gainNode.gain.linearRampToValueAtTime(0, release.stopTime);
        noteVoice.sourceNode.stop(release.stopTime);
      } catch {
        this.stopAndDisconnectVoice(noteVoice, currentTime);
      }
    }
  }

  private stopActiveSampleVoices(): void {
    const currentTime = this.audioContext?.currentTime ?? 0;

    this.activeSamplePreview = null;

    for (const sampleVoice of this.activeSampleVoices) {
      this.stopAndDisconnectSampleVoice(sampleVoice, currentTime);
    }
  }

  private stopAndDisconnectSampleVoice(
    sampleVoice: ActiveSamplePreview,
    when: number,
  ): void {
    try {
      sampleVoice.sourceNode.stop(when);
    } catch {
      // The source may already have ended. Disconnecting below is enough.
    }

    this.activeSampleVoices.delete(sampleVoice);
    disconnectAudioNode(sampleVoice.sourceNode);
    disconnectAudioNode(sampleVoice.gainNode);
  }

  private stopAndDisconnectVoice(noteVoice: ActiveNoteVoice, when: number): void {
    try {
      noteVoice.sourceNode.stop(when);
    } catch {
      // The source may already have a scheduled stop. Disconnecting below is enough.
    }

    this.activeNoteVoices.delete(noteVoice);
    disconnectAudioNode(noteVoice.sourceNode);
    disconnectAudioNode(noteVoice.gainNode);
  }

  private async loadSamplesForLoopEvents(
    events: readonly SampleLoopEvent[],
  ): Promise<void> {
    await Promise.all(
      Array.from(
        new Set(events.map((event) => event.sampleId)),
        (sampleId) => this.loadSample(sampleId),
      ),
    );
  }

  private async loadSamplesForNoteLoopEvents(
    events: readonly NoteLoopEvent[],
  ): Promise<void> {
    await Promise.all(
      Array.from(
        new Set(events.flatMap((event) => this.getSampleIdsForNoteEvent(event))),
        (sampleId) => this.loadSample(sampleId),
      ),
    );
  }

  private getSampleIdsForNoteEvent(event: NoteLoopEvent): SampleId[] {
    const instrument = getPitchedInstrument(event.instrumentId);

    if (instrument.kind !== "sample") {
      return [];
    }

    const sampleZone = getSampleZoneForMidiNote({
      instrument,
      midiNote: event.midiNote,
    });

    return sampleZone ? [sampleZone.sampleId] : [];
  }

  private async fetchAndDecodeSample(
    sample: BundledSampleMeta,
  ): Promise<AudioBuffer> {
    const audioContext = this.getOrCreateAudioContext();
    const response = await fetch(sample.path);

    if (!response.ok) {
      throw new Error(`Failed to load sample "${sample.id}" from ${sample.path}.`);
    }

    const arrayBuffer = await response.arrayBuffer();

    return decodeAudioBuffer({
      arrayBuffer,
      audioContext,
      errorMessage: `Failed to decode bundled sample "${sample.id}".`,
    });
  }

  private getSample(sampleId: SampleId): BundledSampleMeta {
    const sample = this.samplesById.get(sampleId);

    if (!sample) {
      throw new Error(`Unknown bundled sample ID: ${sampleId}`);
    }

    return sample;
  }

  private getOrCreateAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      const AudioContextClass = getAudioContextConstructor();
      this.audioContext = new AudioContextClass();
      this.masterRoute = null;
      this.trackRoutes.clear();
    }

    return this.audioContext;
  }

  private connectSourceGain(gainNode: GainNode, trackId?: TrackId): void {
    if (!trackId) {
      gainNode.connect(this.getOrCreateAudioContext().destination);
      return;
    }

    gainNode.connect(this.getOrCreateTrackRoute(trackId).inputNode);
  }

  private getOrCreateTrackRoute(trackId: TrackId): MixerRoute {
    const existingRoute = this.trackRoutes.get(trackId);

    if (existingRoute) {
      return existingRoute;
    }

    const audioContext = this.getOrCreateAudioContext();
    const route = createMixerRoute(audioContext);

    route.analyserNode.connect(this.getOrCreateMasterRoute().gainNode);
    this.trackRoutes.set(trackId, route);
    this.applyTrackMixerGains();
    this.applyTrackMixerEffect(trackId, route);

    return route;
  }

  private getOrCreateMasterRoute(): MixerRoute {
    if (this.masterRoute) {
      return this.masterRoute;
    }

    const audioContext = this.getOrCreateAudioContext();
    const route = createMixerRoute(audioContext);

    route.analyserNode.connect(audioContext.destination);
    this.masterRoute = route;
    this.applyMasterMixerGain();

    return route;
  }

  private applyMasterMixerGain(): void {
    if (!this.masterRoute) {
      return;
    }

    this.masterRoute.gainNode.gain.value = decibelsToLinearGain(
      this.masterMixerState.volumeDb,
    );
  }

  private applyTrackMixerGains(): void {
    const trackStates = Array.from(this.trackMixerStatesById.values());

    for (const [trackId, route] of this.trackRoutes) {
      const trackState = getTrackMixerState(trackStates, trackId);

      route.gainNode.gain.value = getTrackEffectiveGain({
        allTrackStates: trackStates,
        trackState,
      });
    }
  }

  private applyTrackMixerEffects(): void {
    for (const [trackId, route] of this.trackRoutes) {
      this.applyTrackMixerEffect(trackId, route);
    }
  }

  private applyTrackMixerEffect(trackId: TrackId, route: MixerRoute): void {
    const audioContext = this.getOrCreateAudioContext();
    const trackState = getTrackMixerState(
      Array.from(this.trackMixerStatesById.values()),
      trackId,
    );

    disconnectAudioNode(route.inputNode);
    for (const effectNode of route.effectNodes) {
      disconnectAudioNode(effectNode);
    }

    route.effectNodes = connectMixerEffectGraph({
      audioContext,
      effectSlot: trackState.effectSlot,
      inputNode: route.inputNode,
      outputNode: route.gainNode,
    });
  }
}

function createClipLoopEvents({
  noteEvents,
  sampleEvents,
}: {
  noteEvents: readonly NoteLoopEvent[];
  sampleEvents: readonly SampleLoopEvent[];
}): ClipLoopEvent[] {
  return [
    ...sampleEvents.map((event) => ({
      ...event,
      kind: "sample" as const,
    })),
    ...noteEvents.map((event) => ({
      ...event,
      kind: "note" as const,
    })),
  ];
}

function midiNoteToFrequency(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

function midiNoteToPlaybackRate(midiNote: number, rootMidiNote: number): number {
  return 2 ** ((midiNote - rootMidiNote) / 12);
}

function disconnectAudioNode(audioNode: AudioNode): void {
  try {
    audioNode.disconnect();
  } catch {
    // Nodes may already be disconnected after stop or suspend.
  }
}

function createMixerRoute(audioContext: AudioContext): MixerRoute {
  const inputNode = audioContext.createGain();
  const gainNode = audioContext.createGain();
  const analyserNode = audioContext.createAnalyser();

  analyserNode.fftSize = 256;
  inputNode.connect(gainNode);
  gainNode.connect(analyserNode);

  return {
    analyserNode,
    effectNodes: [],
    gainNode,
    inputNode,
    meterBuffer: new Uint8Array(new ArrayBuffer(analyserNode.fftSize)),
  };
}

function getAnalyserLevel(route: MixerRoute): number {
  route.analyserNode.getByteTimeDomainData(route.meterBuffer);

  let sumSquares = 0;

  for (const value of route.meterBuffer) {
    const centeredValue = (value - 128) / 128;

    sumSquares += centeredValue * centeredValue;
  }

  const rms = Math.sqrt(sumSquares / route.meterBuffer.length);

  return Math.min(1, rms * 3);
}

function getAudioContextConstructor(): AudioContextConstructor {
  const audioWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: AudioContextConstructor;
    };
  const AudioContextClass =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this browser.");
  }

  return AudioContextClass;
}
