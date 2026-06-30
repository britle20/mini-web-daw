import { BUNDLED_SAMPLES } from "./bundled-samples";
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
  decibelsToLinearGain,
  getArrangementLengthTicks,
  getPitchedInstrument,
  getSampleZoneForMidiNote,
  getTrackEffectiveGain,
  getTrackMixerState,
  normalizeTrackMixerState,
  type Clip,
  type ClipInstance,
  type MasterMixerState,
  type SampleZone,
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
  const playbackEvents = expandClipInstancesForPlayback({
    clipInstances,
    clips,
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

function scheduleOfflineSampleEvent({
  arrangementLengthTicks,
  audioContext,
  event,
  mixerOptions,
  sampleBuffers,
  tempoBpm,
}: {
  arrangementLengthTicks: number;
  audioContext: OfflineAudioContext;
  event: SampleLoopEvent;
  mixerOptions: MixerGainOptions;
  sampleBuffers: ReadonlyMap<SampleId, AudioBuffer>;
  tempoBpm: number;
}): void {
  if (event.startTick >= arrangementLengthTicks) {
    return;
  }

  const audioBuffer = sampleBuffers.get(event.sampleId);

  if (!audioBuffer) {
    throw new Error(`Sample "${event.sampleId}" must be loaded before rendering.`);
  }

  const startSeconds = ticksToSeconds(event.startTick, { tempoBpm });
  const sourceOffsetSeconds = Math.max(event.sourceOffsetSeconds ?? 0, 0);
  const mixerGain = getMixerGain({
    ...mixerOptions,
    trackId: event.trackId,
  });
  const gainValue = DEFAULT_SAMPLE_GAIN * (event.gain ?? 1);

  if (gainValue <= 0 || mixerGain <= 0 || sourceOffsetSeconds >= audioBuffer.duration) {
    return;
  }

  const sourceNode = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  const eventDurationSeconds =
    event.durationTicks === undefined
      ? undefined
      : ticksToSeconds(
          Math.min(event.durationTicks, arrangementLengthTicks - event.startTick),
          { tempoBpm },
        );
  const bufferDurationSeconds = audioBuffer.duration - sourceOffsetSeconds;
  const durationSeconds =
    eventDurationSeconds === undefined
      ? bufferDurationSeconds
      : Math.min(eventDurationSeconds, bufferDurationSeconds);

  if (durationSeconds <= 0) {
    return;
  }

  sourceNode.buffer = audioBuffer;
  gainNode.gain.value = gainValue;
  sourceNode.connect(gainNode);
  connectOfflineMixerRoute({
    audioContext,
    mixerGain,
    mixerOptions,
    sourceOutputNode: gainNode,
    trackId: event.trackId,
  });

  if (event.durationTicks === undefined) {
    sourceNode.start(startSeconds, sourceOffsetSeconds);
  } else {
    sourceNode.start(startSeconds, sourceOffsetSeconds, durationSeconds);
  }
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
  tempoBpm,
}: {
  audioContext: OfflineAudioContext;
  durationTicks: number;
  event: NoteLoopEvent;
  mixerOptions: MixerGainOptions;
  tempoBpm: number;
}): void {
  const startTime = ticksToSeconds(event.startTick, { tempoBpm });
  const durationSeconds = Math.max(ticksToSeconds(durationTicks, { tempoBpm }), 0.01);
  const stopTime = startTime + durationSeconds;
  const attackSeconds = Math.min(0.01, durationSeconds / 4);
  const releaseSeconds = Math.min(0.04, durationSeconds / 3);
  const sustainEndTime = Math.max(
    startTime + attackSeconds,
    stopTime - releaseSeconds,
  );
  const gainValue =
    DEFAULT_SYNTH_GAIN *
    (event.gain ?? 1);
  const mixerGain = getMixerGain({
    ...mixerOptions,
    trackId: event.trackId,
  });

  if (gainValue <= 0 || mixerGain <= 0) {
    return;
  }

  const sourceNode = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

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

function midiNoteToFrequency(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

function midiNoteToPlaybackRate(midiNote: number, rootMidiNote: number): number {
  return 2 ** ((midiNote - rootMidiNote) / 12);
}
