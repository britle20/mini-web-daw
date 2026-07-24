import { BUNDLED_SAMPLES } from "./bundled-samples";
import SignalsmithStretch from "signalsmith-stretch";
import { decodeAudioBuffer } from "./audio-buffer-decoder";
import { expandClipInstancesForPlayback } from "./arrangement-events";
import { connectMixerEffectGraph } from "./mixer-effects";
import {
  resolveSamplerPlaybackPlan,
} from "./sampler-sustain";
import {
  encodePcm16WavBlob,
} from "./wav-encoder";
import type {
  BundledSampleMeta,
  NoteLoopEvent,
  SampleId,
  SampleLoopEvent,
} from "./types";
import {
  DEFAULT_SYNTH_PRESET,
  decibelsToLinearGain,
  getArrangementLengthTicks,
  isAudioClip,
  isValidImportedAudioSourceBpm,
  getPitchedInstrument,
  getSampleZoneForMidiNote,
  getSynthPresetForInstrument,
  getTrackEffectiveGain,
  getTrackMixerState,
  normalizeTrackMixerState,
  type Clip,
  type ClipInstance,
  type MasterMixerState,
  type SampleMeta,
  type SampleZone,
  type SynthFilterEnvelopeMeta,
  type SynthFilterMeta,
  type SynthPresetMeta,
  type TrackMixerState,
} from "../model";
import {
  clampTempoBpm,
  ticksToSeconds,
} from "../utils";

export interface ArrangementWavExportOptions {
  arrangementLengthBars: number;
  clipInstances: readonly ClipInstance[];
  clips: readonly Clip[];
  importedSampleBlobs?: ReadonlyMap<SampleId, Blob>;
  masterMixerState: MasterMixerState;
  sampleMetas?: readonly SampleMeta[];
  sampleRate?: number;
  samples?: readonly BundledSampleMeta[];
  tempoBpm: number;
  trackMixerStates: readonly TrackMixerState[];
}

export interface ArrangementWavExportResult {
  blob: Blob;
  durationSeconds: number;
  format: {
    bitDepth: 16;
    channelCount: 2;
    sampleRate: number;
  };
}

const DEFAULT_EXPORT_SAMPLE_RATE = 44100;
const EXPORT_CHANNEL_COUNT = 2;
const DEFAULT_SAMPLE_GAIN = 0.9;
const DEFAULT_SYNTH_GAIN = 0.22;
const DEFAULT_SAMPLER_GAIN = 0.72;

export async function renderArrangementToWav({
  arrangementLengthBars,
  clipInstances,
  clips,
  importedSampleBlobs = new Map(),
  masterMixerState,
  sampleMetas = [],
  sampleRate = DEFAULT_EXPORT_SAMPLE_RATE,
  samples = BUNDLED_SAMPLES,
  tempoBpm,
  trackMixerStates,
}: ArrangementWavExportOptions): Promise<ArrangementWavExportResult> {
  const normalizedTempoBpm = clampTempoBpm(tempoBpm);
  const arrangementLengthTicks = getArrangementLengthTicks(arrangementLengthBars);
  const durationSeconds = ticksToSeconds(arrangementLengthTicks, {
    tempoBpm: normalizedTempoBpm,
  });
  const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  const offlineAudioContext = createOfflineAudioContext({
    channelCount: EXPORT_CHANNEL_COUNT,
    frameCount,
    sampleRate,
  });
  const missingSourceBpmClipNames = getMissingImportedAudioSourceBpmClipNamesForExport({
    clipInstances,
    clips,
    sampleMetas,
  });

  if (missingSourceBpmClipNames.length > 0) {
    throw new Error(
      `Source BPM is missing for imported audio clips: ${missingSourceBpmClipNames.join(
        ", ",
      )}. Re-import the WAV with a source BPM before exporting.`,
    );
  }

  const playbackEvents = expandClipInstancesForPlayback({
    clipInstances,
    clips,
    projectBpm: normalizedTempoBpm,
    sampleMetas,
  });

  if (playbackEvents.missingClipIds.length > 0) {
    throw new Error(
      `Arrangement contains missing source clips: ${playbackEvents.missingClipIds.join(
        ", ",
      )}.`,
    );
  }

  const sampleBuffers = await loadSamplesForOfflineRender({
    audioContext: offlineAudioContext,
    importedSampleBlobs,
    noteEvents: playbackEvents.noteEvents,
    sampleEvents: playbackEvents.sampleEvents,
    samples,
  });
  const stretchedSampleBuffers = await renderStretchedSampleBuffersForOfflineRender({
    sampleBuffers,
    sampleEvents: playbackEvents.sampleEvents,
  });
  const mixerOptions = {
    masterMixerState,
    trackMixerStates,
  };

  for (const event of playbackEvents.sampleEvents) {
    scheduleOfflineSampleEvent({
      arrangementLengthTicks,
      audioContext: offlineAudioContext,
      event,
      mixerOptions,
      sampleBuffers,
      stretchedSampleBuffers,
      tempoBpm: normalizedTempoBpm,
    });
  }

  for (const event of playbackEvents.noteEvents) {
    scheduleOfflineNoteEvent({
      arrangementLengthTicks,
      audioContext: offlineAudioContext,
      event,
      mixerOptions,
      sampleBuffers,
      tempoBpm: normalizedTempoBpm,
    });
  }

  const renderedBuffer = await offlineAudioContext.startRendering();
  const channelData = Array.from(
    { length: EXPORT_CHANNEL_COUNT },
    (_, channelIndex) =>
      renderedBuffer.getChannelData(
        Math.min(channelIndex, renderedBuffer.numberOfChannels - 1),
      ),
  );

  return {
    blob: encodePcm16WavBlob({
      channelData,
      sampleRate: renderedBuffer.sampleRate,
    }),
    durationSeconds: renderedBuffer.duration,
    format: {
      bitDepth: 16,
      channelCount: EXPORT_CHANNEL_COUNT,
      sampleRate: renderedBuffer.sampleRate,
    },
  };
}

async function loadSamplesForOfflineRender({
  audioContext,
  importedSampleBlobs,
  noteEvents,
  sampleEvents,
  samples,
}: {
  audioContext: BaseAudioContext;
  importedSampleBlobs: ReadonlyMap<SampleId, Blob>;
  noteEvents: readonly NoteLoopEvent[];
  sampleEvents: readonly SampleLoopEvent[];
  samples: readonly BundledSampleMeta[];
}): Promise<ReadonlyMap<SampleId, AudioBuffer>> {
  const sampleIds = new Set<SampleId>();

  for (const event of sampleEvents) {
    sampleIds.add(event.sampleId);
  }

  for (const event of noteEvents) {
    const sampleZone = getSampleZoneForNoteEvent(event);

    if (sampleZone) {
      sampleIds.add(sampleZone.sampleId);
    }
  }

  const sampleBuffers = new Map<SampleId, AudioBuffer>();

  await Promise.all(
    Array.from(sampleIds, async (sampleId) => {
      sampleBuffers.set(
        sampleId,
        await loadOfflineSampleBuffer({
          audioContext,
          importedSampleBlobs,
          sampleId,
          samples,
        }),
      );
    }),
  );

  return sampleBuffers;
}

async function loadOfflineSampleBuffer({
  audioContext,
  importedSampleBlobs,
  sampleId,
  samples,
}: {
  audioContext: BaseAudioContext;
  importedSampleBlobs: ReadonlyMap<SampleId, Blob>;
  sampleId: SampleId;
  samples: readonly BundledSampleMeta[];
}): Promise<AudioBuffer> {
  const bundledSample = samples.find((sample) => sample.id === sampleId);

  if (bundledSample) {
    const response = await fetch(bundledSample.path);

    if (!response.ok) {
      throw new Error(
        `Failed to load sample "${sampleId}" from ${bundledSample.path}.`,
      );
    }

    return decodeAudioBuffer({
      arrayBuffer: await response.arrayBuffer(),
      audioContext,
      errorMessage: `Failed to decode bundled sample "${sampleId}".`,
    });
  }

  const importedSampleBlob = importedSampleBlobs.get(sampleId);

  if (!importedSampleBlob) {
    throw new Error(
      `Sample data is missing for "${sampleId}". Re-import the file before exporting.`,
    );
  }

  return decodeAudioBuffer({
    arrayBuffer: await importedSampleBlob.arrayBuffer(),
    audioContext,
    errorMessage: `Failed to decode imported sample "${sampleId}".`,
  });
}

export function getMissingImportedAudioSourceBpmClipNamesForExport({
  clipInstances,
  clips,
  sampleMetas,
}: {
  clipInstances: readonly ClipInstance[];
  clips: readonly Clip[];
  sampleMetas: readonly SampleMeta[];
}): string[] {
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const sampleMetasById = new Map(
    sampleMetas.map((sampleMeta) => [sampleMeta.id, sampleMeta]),
  );
  const missingClipNames: string[] = [];

  for (const instance of clipInstances) {
    const clip = clipsById.get(instance.clipId);

    if (!clip || !isAudioClip(clip)) {
      continue;
    }

    const sourceBpm = sampleMetasById.get(clip.sampleId)?.source.sourceBpm;

    if (!isValidImportedAudioSourceBpm(sourceBpm)) {
      missingClipNames.push(clip.name);
    }
  }

  return Array.from(new Set(missingClipNames));
}

interface OfflineStretchedSampleRenderOptions {
  sampleBuffers: ReadonlyMap<SampleId, AudioBuffer>;
  sampleEvents: readonly SampleLoopEvent[];
}

async function renderStretchedSampleBuffersForOfflineRender({
  sampleBuffers,
  sampleEvents,
}: OfflineStretchedSampleRenderOptions): Promise<ReadonlyMap<string, AudioBuffer>> {
  const stretchedSampleBuffers = new Map<string, AudioBuffer>();

  for (const event of sampleEvents) {
    const stretchRate = getSampleEventStretchRate(event);

    if (stretchRate === 1) {
      continue;
    }

    const cacheKey = getOfflineStretchedSampleBufferKey({
      sampleId: event.sampleId,
      stretchRate,
    });

    if (stretchedSampleBuffers.has(cacheKey)) {
      continue;
    }

    const audioBuffer = sampleBuffers.get(event.sampleId);

    if (!audioBuffer) {
      throw new Error(`Sample "${event.sampleId}" must be loaded before rendering.`);
    }

    stretchedSampleBuffers.set(
      cacheKey,
      await renderOfflineStretchedAudioBuffer({
        audioBuffer,
        sampleId: event.sampleId,
        stretchRate,
      }),
    );
  }

  return stretchedSampleBuffers;
}

async function renderOfflineStretchedAudioBuffer({
  audioBuffer,
  sampleId,
  stretchRate,
}: {
  audioBuffer: AudioBuffer;
  sampleId: SampleId;
  stretchRate: number;
}): Promise<AudioBuffer> {
  const renderedDurationSeconds = Math.max(0.01, audioBuffer.duration / stretchRate);
  const renderPaddingSeconds = 0.25;
  const offlineContext = createOfflineAudioContext({
    channelCount: EXPORT_CHANNEL_COUNT,
    frameCount: Math.max(
      1,
      Math.ceil(
        (renderedDurationSeconds + renderPaddingSeconds) * audioBuffer.sampleRate,
      ),
    ),
    sampleRate: audioBuffer.sampleRate,
  });

  try {
    const stretchNode = await SignalsmithStretch(offlineContext, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [EXPORT_CHANNEL_COUNT],
    });

    await stretchNode.configure({ preset: "default" });
    await stretchNode.addBuffers(createStretchChannelBuffers(audioBuffer));
    stretchNode.connect(offlineContext.destination);
    await stretchNode.schedule({
      active: true,
      input: 0,
      output: 0,
      outputTime: 0,
      rate: stretchRate,
      semitones: 0,
    });

    const renderedBuffer = await offlineContext.startRendering();

    try {
      stretchNode.disconnect();
    } catch {
      // Offline rendering may already have torn down the graph.
    }

    return trimAudioBufferDuration({
      audioBuffer: renderedBuffer,
      durationSeconds: renderedDurationSeconds,
    });
  } catch (error) {
    throw new Error(
      `Pitch-preserving imported audio export failed for "${sampleId}" at ${stretchRate.toFixed(
        6,
      )}x. ${
        error instanceof Error
          ? error.message
          : "The stretch runtime is unavailable in the offline export path."
      }`,
      { cause: error },
    );
  }
}

export interface OfflineSampleRenderPlan {
  durationSeconds: number;
  renderedOffsetSeconds: number;
  sourceOffsetSeconds: number;
  stretchRate: number;
}

export function resolveOfflineSampleRenderPlan({
  arrangementLengthTicks,
  event,
  renderedBufferDurationSeconds,
  sourceBufferDurationSeconds,
  tempoBpm,
}: {
  arrangementLengthTicks: number;
  event: SampleLoopEvent;
  renderedBufferDurationSeconds: number;
  sourceBufferDurationSeconds: number;
  tempoBpm: number;
}): OfflineSampleRenderPlan | null {
  if (event.startTick >= arrangementLengthTicks) {
    return null;
  }

  const stretchRate = getSampleEventStretchRate(event);
  const sourceOffsetSeconds = Math.max(event.sourceOffsetSeconds ?? 0, 0);

  if (sourceOffsetSeconds >= sourceBufferDurationSeconds) {
    return null;
  }

  const renderedOffsetSeconds = sourceOffsetSeconds / stretchRate;

  if (renderedOffsetSeconds >= renderedBufferDurationSeconds) {
    return null;
  }

  const arrangementRemainingSeconds = ticksToSeconds(
    arrangementLengthTicks - event.startTick,
    { tempoBpm },
  );
  const eventDurationSeconds =
    event.playbackDurationSeconds ??
    (typeof event.durationTicks === "number"
      ? ticksToSeconds(
          Math.min(event.durationTicks, arrangementLengthTicks - event.startTick),
          { tempoBpm },
        )
      : arrangementRemainingSeconds);
  const durationSeconds = Math.min(
    eventDurationSeconds,
    arrangementRemainingSeconds,
    renderedBufferDurationSeconds - renderedOffsetSeconds,
  );

  if (durationSeconds <= 0) {
    return null;
  }

  return {
    durationSeconds,
    renderedOffsetSeconds,
    sourceOffsetSeconds,
    stretchRate,
  };
}

function scheduleOfflineSampleEvent({
  arrangementLengthTicks,
  audioContext,
  event,
  mixerOptions,
  sampleBuffers,
  stretchedSampleBuffers,
  tempoBpm,
}: {
  arrangementLengthTicks: number;
  audioContext: OfflineAudioContext;
  event: SampleLoopEvent;
  mixerOptions: MixerGainOptions;
  sampleBuffers: ReadonlyMap<SampleId, AudioBuffer>;
  stretchedSampleBuffers: ReadonlyMap<string, AudioBuffer>;
  tempoBpm: number;
}): void {
  const audioBuffer = sampleBuffers.get(event.sampleId);

  if (!audioBuffer) {
    throw new Error(`Sample "${event.sampleId}" must be loaded before rendering.`);
  }

  const stretchRate = getSampleEventStretchRate(event);
  const renderBuffer =
    stretchRate === 1
      ? audioBuffer
      : stretchedSampleBuffers.get(
          getOfflineStretchedSampleBufferKey({
            sampleId: event.sampleId,
            stretchRate,
          }),
        );

  if (!renderBuffer) {
    throw new Error(
      `Stretched sample data is missing for "${event.sampleId}" at ${stretchRate.toFixed(
        6,
      )}x.`,
    );
  }

  const startSeconds = ticksToSeconds(event.startTick, { tempoBpm });
  const mixerGain = getMixerGain({
    ...mixerOptions,
    trackId: event.trackId,
  });
  const gainValue = DEFAULT_SAMPLE_GAIN * (event.gain ?? 1);

  if (gainValue <= 0 || mixerGain <= 0) {
    return;
  }

  const renderPlan = resolveOfflineSampleRenderPlan({
    arrangementLengthTicks,
    event,
    renderedBufferDurationSeconds: renderBuffer.duration,
    sourceBufferDurationSeconds: audioBuffer.duration,
    tempoBpm,
  });

  if (!renderPlan) {
    return;
  }

  const sourceNode = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

  sourceNode.buffer = renderBuffer;
  gainNode.gain.value = gainValue;
  sourceNode.connect(gainNode);
  connectOfflineMixerRoute({
    audioContext,
    mixerGain,
    mixerOptions,
    sourceOutputNode: gainNode,
    trackId: event.trackId,
  });

  sourceNode.start(
    startSeconds,
    renderPlan.renderedOffsetSeconds,
    renderPlan.durationSeconds,
  );
}

function scheduleOfflineNoteEvent({
  arrangementLengthTicks,
  audioContext,
  event,
  mixerOptions,
  sampleBuffers,
  tempoBpm,
}: {
  arrangementLengthTicks: number;
  audioContext: OfflineAudioContext;
  event: NoteLoopEvent;
  mixerOptions: MixerGainOptions;
  sampleBuffers: ReadonlyMap<SampleId, AudioBuffer>;
  tempoBpm: number;
}): void {
  if (event.startTick >= arrangementLengthTicks) {
    return;
  }

  const durationTicks = Math.min(
    event.durationTicks,
    arrangementLengthTicks - event.startTick,
  );

  if (durationTicks <= 0) {
    return;
  }

  const instrument = getPitchedInstrument(event.instrumentId);

  if (instrument.kind !== "sample") {
    scheduleOfflineSynthNote({
      audioContext,
      durationTicks,
      event,
      mixerOptions,
      synthPreset: getSynthPresetForInstrument(instrument),
      tempoBpm,
    });
    return;
  }

  const sampleZone = getSampleZoneForMidiNote({
    instrument,
    midiNote: event.midiNote,
  });

  if (!sampleZone) {
    scheduleOfflineSynthNote({
      audioContext,
      durationTicks,
      event,
      mixerOptions,
      synthPreset: DEFAULT_SYNTH_PRESET,
      tempoBpm,
    });
    return;
  }

  scheduleOfflineSampledNote({
    audioContext,
    durationTicks,
    event,
    mixerOptions,
    sampleBuffers,
    sampleZone,
    tempoBpm,
  });
}

function scheduleOfflineSynthNote({
  audioContext,
  durationTicks,
  event,
  mixerOptions,
  synthPreset = DEFAULT_SYNTH_PRESET,
  tempoBpm,
}: {
  audioContext: OfflineAudioContext;
  durationTicks: number;
  event: NoteLoopEvent;
  mixerOptions: MixerGainOptions;
  synthPreset?: SynthPresetMeta;
  tempoBpm: number;
}): void {
  const startTime = ticksToSeconds(event.startTick, { tempoBpm });
  const durationSeconds = Math.max(ticksToSeconds(durationTicks, { tempoBpm }), 0.01);
  const stopTime = startTime + durationSeconds;
  const attackSeconds = Math.min(
    synthPreset.envelope.attackSeconds,
    durationSeconds / 4,
  );
  const releaseSeconds = Math.min(
    synthPreset.envelope.releaseSeconds,
    durationSeconds / 3,
  );
  const attackEndTime = startTime + attackSeconds;
  const sustainEndTime = Math.max(
    attackEndTime,
    stopTime - releaseSeconds,
  );
  const peakGainValue =
    DEFAULT_SYNTH_GAIN *
    (synthPreset.oscillator.gain ?? 1) *
    (event.gain ?? 1);
  const sustainGainValue =
    peakGainValue * (synthPreset.envelope.sustainGain ?? 1);
  const mixerGain = getMixerGain({
    ...mixerOptions,
    trackId: event.trackId,
  });

  if (peakGainValue <= 0 || mixerGain <= 0) {
    return;
  }

  const sourceNode = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const filterNode = createSynthFilterNode({
    audioContext,
    filter: synthPreset.filter,
    filterEnvelope: synthPreset.filterEnvelope,
    durationSeconds,
    startTime,
  });

  sourceNode.type = synthPreset.oscillator.type;
  sourceNode.frequency.setValueAtTime(
    midiNoteToFrequency(event.midiNote),
    startTime,
  );
  sourceNode.detune.setValueAtTime(
    synthPreset.oscillator.detuneCents ?? 0,
    startTime,
  );
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peakGainValue, attackEndTime);
  gainNode.gain.linearRampToValueAtTime(sustainGainValue, sustainEndTime);
  gainNode.gain.linearRampToValueAtTime(0, stopTime);

  if (filterNode) {
    sourceNode.connect(filterNode);
    filterNode.connect(gainNode);
  } else {
    sourceNode.connect(gainNode);
  }

  connectOfflineMixerRoute({
    audioContext,
    mixerGain,
    mixerOptions,
    sourceOutputNode: gainNode,
    trackId: event.trackId,
  });
  sourceNode.start(startTime);
  sourceNode.stop(stopTime);
}

function scheduleOfflineSampledNote({
  audioContext,
  durationTicks,
  event,
  mixerOptions,
  sampleBuffers,
  sampleZone,
  tempoBpm,
}: {
  audioContext: OfflineAudioContext;
  durationTicks: number;
  event: NoteLoopEvent;
  mixerOptions: MixerGainOptions;
  sampleBuffers: ReadonlyMap<SampleId, AudioBuffer>;
  sampleZone: SampleZone;
  tempoBpm: number;
}): void {
  const audioBuffer = sampleBuffers.get(sampleZone.sampleId);

  if (!audioBuffer) {
    throw new Error(
      `Sample "${sampleZone.sampleId}" must be loaded before rendering.`,
    );
  }

  const startTime = ticksToSeconds(event.startTick, { tempoBpm });
  const durationSeconds = Math.max(ticksToSeconds(durationTicks, { tempoBpm }), 0.01);
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
  const gainValue =
    DEFAULT_SAMPLER_GAIN *
    (event.gain ?? 1);
  const mixerGain = getMixerGain({
    ...mixerOptions,
    trackId: event.trackId,
  });

  if (gainValue <= 0 || mixerGain <= 0) {
    return;
  }

  const sourceNode = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

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
  connectOfflineMixerRoute({
    audioContext,
    mixerGain,
    mixerOptions,
    sourceOutputNode: gainNode,
    trackId: event.trackId,
  });
  sourceNode.start(startTime, playbackPlan.sampleOffsetSeconds);
  sourceNode.stop(stopTime);
}

interface MixerGainOptions {
  masterMixerState: MasterMixerState;
  trackMixerStates: readonly TrackMixerState[];
}

function getMixerGain({
  masterMixerState,
  trackId,
  trackMixerStates,
}: MixerGainOptions & {
  trackId?: string;
}): number {
  const masterGain = decibelsToLinearGain(masterMixerState.volumeDb);

  if (!trackId) {
    return masterGain;
  }

  const trackState = getTrackMixerState(trackMixerStates, trackId);

  return (
    masterGain *
    getTrackEffectiveGain({
      allTrackStates: trackMixerStates,
      trackState,
    })
  );
}

function connectOfflineMixerRoute({
  audioContext,
  mixerGain,
  mixerOptions,
  sourceOutputNode,
  trackId,
}: {
  audioContext: OfflineAudioContext;
  mixerGain: number;
  mixerOptions: MixerGainOptions;
  sourceOutputNode: AudioNode;
  trackId?: string;
}): void {
  if (mixerGain <= 0) {
    return;
  }

  const mixerGainNode = audioContext.createGain();

  mixerGainNode.gain.value = mixerGain;

  if (!trackId) {
    sourceOutputNode.connect(mixerGainNode);
    mixerGainNode.connect(audioContext.destination);
    return;
  }

  const trackState = normalizeTrackMixerState(
    getTrackMixerState(mixerOptions.trackMixerStates, trackId),
    trackId,
  );
  const effectInputNode = audioContext.createGain();

  sourceOutputNode.connect(effectInputNode);
  connectMixerEffectGraph({
    audioContext,
    effectSlot: trackState.effectSlot,
    inputNode: effectInputNode,
    outputNode: mixerGainNode,
  });
  mixerGainNode.connect(audioContext.destination);
}

function getSampleZoneForNoteEvent(event: NoteLoopEvent): SampleZone | null {
  const instrument = getPitchedInstrument(event.instrumentId);

  if (instrument.kind !== "sample") {
    return null;
  }

  return getSampleZoneForMidiNote({
    instrument,
    midiNote: event.midiNote,
  }) ?? null;
}

function createOfflineAudioContext({
  channelCount,
  frameCount,
  sampleRate,
}: {
  channelCount: number;
  frameCount: number;
  sampleRate: number;
}): OfflineAudioContext {
  if (!globalThis.OfflineAudioContext) {
    throw new Error("Offline audio rendering is not supported in this browser.");
  }

  return new OfflineAudioContext(channelCount, frameCount, sampleRate);
}

function getSampleEventStretchRate(event: SampleLoopEvent): number {
  if (typeof event.stretchRate !== "number") {
    return 1;
  }

  if (!Number.isFinite(event.stretchRate) || event.stretchRate <= 0) {
    throw new Error(
      `Invalid stretch rate for sample "${event.sampleId}": ${event.stretchRate}.`,
    );
  }

  return Math.abs(event.stretchRate - 1) < 0.000001 ? 1 : event.stretchRate;
}

function getOfflineStretchedSampleBufferKey({
  sampleId,
  stretchRate,
}: {
  sampleId: SampleId;
  stretchRate: number;
}): string {
  return `${sampleId}\u0000${stretchRate.toFixed(6)}`;
}

function trimAudioBufferDuration({
  audioBuffer,
  durationSeconds,
}: {
  audioBuffer: AudioBuffer;
  durationSeconds: number;
}): AudioBuffer {
  const targetLength = Math.min(
    audioBuffer.length,
    Math.max(1, Math.ceil(durationSeconds * audioBuffer.sampleRate)),
  );

  if (targetLength === audioBuffer.length) {
    return audioBuffer;
  }

  const trimmedBuffer = new AudioBuffer({
    length: targetLength,
    numberOfChannels: audioBuffer.numberOfChannels,
    sampleRate: audioBuffer.sampleRate,
  });

  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    trimmedBuffer
      .getChannelData(channelIndex)
      .set(audioBuffer.getChannelData(channelIndex).subarray(0, targetLength));
  }

  return trimmedBuffer;
}

function createStretchChannelBuffers(
  audioBuffer: AudioBuffer,
): [Float32Array, Float32Array] {
  const left = new Float32Array(audioBuffer.getChannelData(0));
  const right =
    audioBuffer.numberOfChannels > 1
      ? new Float32Array(audioBuffer.getChannelData(1))
      : new Float32Array(left);

  return [left, right];
}

function createSynthFilterNode({
  audioContext,
  filter,
  filterEnvelope,
  durationSeconds,
  startTime,
}: {
  audioContext: BaseAudioContext;
  filter?: SynthFilterMeta;
  filterEnvelope?: SynthFilterEnvelopeMeta;
  durationSeconds: number;
  startTime: number;
}): BiquadFilterNode | null {
  if (!filter) {
    return null;
  }

  const filterNode = audioContext.createBiquadFilter();
  const baseFrequencyHz = getSafeSynthFilterFrequency({
    frequencyHz: filter.frequencyHz,
    sampleRate: audioContext.sampleRate,
  });

  filterNode.type = filter.type;
  filterNode.frequency.setValueAtTime(baseFrequencyHz, startTime);
  filterNode.Q.setValueAtTime(filter.q ?? 0, startTime);

  if (filterEnvelope) {
    scheduleSynthFilterEnvelope({
      durationSeconds,
      filterEnvelope,
      frequencyParam: filterNode.frequency,
      sampleRate: audioContext.sampleRate,
      startTime,
      sustainFrequencyHz: filterEnvelope.sustainFrequencyHz ?? baseFrequencyHz,
    });
  }

  return filterNode;
}

function scheduleSynthFilterEnvelope({
  durationSeconds,
  filterEnvelope,
  frequencyParam,
  sampleRate,
  startTime,
  sustainFrequencyHz,
}: {
  durationSeconds: number;
  filterEnvelope: SynthFilterEnvelopeMeta;
  frequencyParam: AudioParam;
  sampleRate: number;
  startTime: number;
  sustainFrequencyHz: number;
}): void {
  const attackSeconds = Math.min(
    filterEnvelope.attackSeconds ?? 0,
    durationSeconds,
  );
  const decaySeconds = Math.min(
    filterEnvelope.decaySeconds,
    Math.max(durationSeconds - attackSeconds, 0),
  );
  const peakFrequencyHz = getSafeSynthFilterFrequency({
    frequencyHz: filterEnvelope.peakFrequencyHz,
    sampleRate,
  });
  const targetSustainFrequencyHz = getSafeSynthFilterFrequency({
    frequencyHz: sustainFrequencyHz,
    sampleRate,
  });
  const peakTime = startTime + attackSeconds;
  const decayEndTime = peakTime + decaySeconds;

  if (attackSeconds > 0) {
    frequencyParam.linearRampToValueAtTime(peakFrequencyHz, peakTime);
  } else {
    frequencyParam.setValueAtTime(peakFrequencyHz, startTime);
  }

  if (decaySeconds > 0) {
    frequencyParam.exponentialRampToValueAtTime(
      targetSustainFrequencyHz,
      decayEndTime,
    );
  } else {
    frequencyParam.setValueAtTime(targetSustainFrequencyHz, peakTime);
  }
}

function getSafeSynthFilterFrequency({
  frequencyHz,
  sampleRate,
}: {
  frequencyHz: number;
  sampleRate: number;
}): number {
  const nyquistLimitHz = Math.max(20, sampleRate / 2 - 1);

  return Math.min(Math.max(frequencyHz, 20), nyquistLimitHz);
}

function midiNoteToFrequency(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

function midiNoteToPlaybackRate(midiNote: number, rootMidiNote: number): number {
  return 2 ** ((midiNote - rootMidiNote) / 12);
}
