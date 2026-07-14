import type { SchedulerSnapshot } from "./lookahead-scheduler";
import type {
  MasterMixerState,
  PitchedInstrumentId,
  TrackId,
  TrackMixerState,
} from "../model";
import type { Tick } from "../utils";

export type SampleId = string;

export interface BundledSampleMeta {
  id: SampleId;
  name: string;
  path: string;
}

export interface PlaySampleOptions {
  gain?: number;
  loop?: boolean;
  when?: number;
}

export interface SampleLoopEvent {
  durationTicks?: Tick;
  id: string;
  playbackDurationSeconds?: number;
  sampleId: SampleId;
  scheduleWhenOverlappingStart?: boolean;
  sourceOffsetSeconds?: number;
  sourceBpm?: number;
  startTick: Tick;
  stretchRate?: number;
  gain?: number;
  trackId?: TrackId;
}

export interface NoteLoopEvent {
  durationTicks: Tick;
  gain?: number;
  id: string;
  instrumentId: PitchedInstrumentId;
  midiNote: number;
  startTick: Tick;
  trackId?: TrackId;
}

export type StretchedSampleDebugStatus =
  | "error"
  | "prepared"
  | "preparing"
  | "queued"
  | "scheduled"
  | "stopped";

export interface StretchedSampleDebugSnapshot {
  currentAudioTime?: number;
  errorMessage?: string;
  eventId: string;
  inputTimeSeconds?: number;
  latencySeconds?: number;
  playbackDurationSeconds?: number;
  sampleId: SampleId;
  scheduledStartTime?: number;
  scheduledStopTime?: number;
  status: StretchedSampleDebugStatus;
  stretchRate?: number;
  updatedAt: number;
}

export interface StartSampleLoopOptions {
  events: readonly SampleLoopEvent[];
  loopEndTick?: Tick;
  loopStartTick?: Tick;
  lookaheadMs?: number;
  ppq?: number;
  scheduleAheadTime?: number;
  startTick?: Tick;
  tempoBpm: number;
}

export interface StartClipLoopOptions {
  noteEvents: readonly NoteLoopEvent[];
  sampleEvents: readonly SampleLoopEvent[];
  loopEndTick?: Tick;
  loopStartTick?: Tick;
  lookaheadMs?: number;
  ppq?: number;
  scheduleAheadTime?: number;
  startTick?: Tick;
  tempoBpm: number;
}

export type TransportSnapshot = SchedulerSnapshot;

export interface AudioEngineSnapshot {
  contextState: AudioContextState | "not-created";
  loadedSampleIds: SampleId[];
  stretchedSamples: StretchedSampleDebugSnapshot[];
  transport: TransportSnapshot;
}

export interface MixerLevelSnapshot {
  masterLevel: number;
  trackLevels: Record<TrackId, number>;
}

export interface AudioEngine {
  getSnapshot(): AudioEngineSnapshot;
  getTransportSnapshot(): TransportSnapshot;
  getMixerLevels(trackIds?: readonly TrackId[]): MixerLevelSnapshot;
  importSampleBlob(sampleId: SampleId, blob: Blob, fileName?: string): Promise<AudioBuffer>;
  importSampleFile(sampleId: SampleId, file: File): Promise<AudioBuffer>;
  resume(): Promise<AudioEngineSnapshot>;
  setMasterMixerState(state: MasterMixerState): void;
  setTrackMixerStates(states: readonly TrackMixerState[]): void;
  suspend(): Promise<AudioEngineSnapshot>;
  loadSample(sampleId: SampleId): Promise<AudioBuffer>;
  loadAllSamples(): Promise<AudioEngineSnapshot>;
  playCachedSample(sampleId: SampleId, options?: PlaySampleOptions): Promise<void>;
  playSample(sampleId: SampleId, options?: PlaySampleOptions): Promise<void>;
  pauseLoop(): TransportSnapshot;
  setTempoBpm(tempoBpm: number): TransportSnapshot;
  startClipLoop(options: StartClipLoopOptions): Promise<TransportSnapshot>;
  startSampleLoop(options: StartSampleLoopOptions): Promise<TransportSnapshot>;
  stopCachedSamplePreview(): void;
  stopLoop(): TransportSnapshot;
  updateClipLoopEvents(options: {
    noteEvents: readonly NoteLoopEvent[];
    sampleEvents: readonly SampleLoopEvent[];
  }): Promise<TransportSnapshot>;
  updateSampleLoopEvents(
    events: readonly SampleLoopEvent[],
  ): Promise<TransportSnapshot>;
}
