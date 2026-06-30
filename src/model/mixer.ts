import type { ArrangementTrack, TrackId } from "./arrangement";

export interface TrackMixerState {
  effectSlot: TrackEffectState;
  trackId: TrackId;
  volumeDb: number;
  muted: boolean;
  solo: boolean;
}

export interface MasterMixerState {
  volumeDb: number;
}

export type TrackEffectKind = "delay" | "distortion" | "filter" | "none";
export type FilterEffectType = "highpass" | "lowpass";

export interface FilterEffectParameters {
  frequencyHz: number;
  q: number;
  type: FilterEffectType;
}

export interface DelayEffectParameters {
  delayTimeSeconds: number;
  feedback: number;
  wetMix: number;
}

export interface DistortionEffectParameters {
  drive: number;
  wetMix: number;
}

export interface TrackEffectState {
  enabled: boolean;
  id: typeof TRACK_EFFECT_SLOT_ID;
  kind: TrackEffectKind;
  parameters:
    | DelayEffectParameters
    | DistortionEffectParameters
    | FilterEffectParameters
    | null;
}

export const MIXER_MIN_VOLUME_DB = -60;
export const MIXER_MAX_VOLUME_DB = 6;
export const MIXER_DEFAULT_VOLUME_DB = 0;
export const TRACK_EFFECT_SLOT_ID = "track-insert-1";
export const FILTER_MIN_FREQUENCY_HZ = 80;
export const FILTER_MAX_FREQUENCY_HZ = 12_000;
export const FILTER_DEFAULT_FREQUENCY_HZ = 2_400;
export const FILTER_MIN_Q = 0.1;
export const FILTER_MAX_Q = 12;
export const FILTER_DEFAULT_Q = 0.7;
export const DELAY_MIN_TIME_SECONDS = 0.05;
export const DELAY_MAX_TIME_SECONDS = 1;
export const DELAY_DEFAULT_TIME_SECONDS = 0.25;
export const DELAY_MIN_FEEDBACK = 0;
export const DELAY_MAX_FEEDBACK = 0.72;
export const DELAY_DEFAULT_FEEDBACK = 0.28;
export const EFFECT_MIN_WET_MIX = 0;
export const EFFECT_MAX_WET_MIX = 1;
export const DELAY_DEFAULT_WET_MIX = 0.35;
export const DISTORTION_MIN_DRIVE = 1;
export const DISTORTION_MAX_DRIVE = 20;
export const DISTORTION_DEFAULT_DRIVE = 4;
export const DISTORTION_DEFAULT_WET_MIX = 0.45;

export function createDefaultTrackMixerState(trackId: TrackId): TrackMixerState {
  return {
    effectSlot: createTrackEffectState("none"),
    muted: false,
    solo: false,
    trackId,
    volumeDb: MIXER_DEFAULT_VOLUME_DB,
  };
}

export function createDefaultTrackMixerStates(
  tracks: readonly ArrangementTrack[],
): TrackMixerState[] {
  return tracks.map((track) => createDefaultTrackMixerState(track.id));
}

export function createDefaultMasterMixerState(): MasterMixerState {
  return {
    volumeDb: MIXER_DEFAULT_VOLUME_DB,
  };
}

export function getTrackMixerState(
  states: readonly TrackMixerState[],
  trackId: TrackId,
): TrackMixerState {
  return normalizeTrackMixerState(
    states.find((state) => state.trackId === trackId) ??
      createDefaultTrackMixerState(trackId),
    trackId,
  );
}

export function updateTrackMixerState(
  states: readonly TrackMixerState[],
  trackId: TrackId,
  patch: Partial<Omit<TrackMixerState, "trackId">>,
): TrackMixerState[] {
  const normalizedPatch = {
    ...patch,
    effectSlot:
      patch.effectSlot === undefined
        ? undefined
        : normalizeTrackEffectState(patch.effectSlot),
  };
  const hasExistingState = states.some((state) => state.trackId === trackId);
  const nextStates = hasExistingState
    ? states
    : [...states, createDefaultTrackMixerState(trackId)];

  return nextStates.map((state) => {
    if (state.trackId !== trackId) {
      return normalizeTrackMixerState(state);
    }

    return normalizeTrackMixerState({
      ...state,
      ...normalizedPatch,
      trackId,
      volumeDb:
        normalizedPatch.volumeDb === undefined
          ? state.volumeDb
          : clampMixerVolumeDb(normalizedPatch.volumeDb),
    });
  });
}

export function updateMasterMixerState(
  state: MasterMixerState,
  patch: Partial<MasterMixerState>,
): MasterMixerState {
  return {
    ...state,
    ...patch,
    volumeDb:
      patch.volumeDb === undefined
        ? state.volumeDb
        : clampMixerVolumeDb(patch.volumeDb),
  };
}

export function isTrackMixerAudible({
  allTrackStates,
  trackState,
}: {
  allTrackStates: readonly TrackMixerState[];
  trackState: TrackMixerState;
}): boolean {
  const hasSoloedTrack = allTrackStates.some((state) => state.solo);

  return !trackState.muted && (!hasSoloedTrack || trackState.solo);
}

export function getTrackEffectiveGain({
  allTrackStates,
  trackState,
}: {
  allTrackStates: readonly TrackMixerState[];
  trackState: TrackMixerState;
}): number {
  if (!isTrackMixerAudible({ allTrackStates, trackState })) {
    return 0;
  }

  return decibelsToLinearGain(trackState.volumeDb);
}

export function decibelsToLinearGain(volumeDb: number): number {
  const clampedVolumeDb = clampMixerVolumeDb(volumeDb);

  if (clampedVolumeDb <= MIXER_MIN_VOLUME_DB) {
    return 0;
  }

  return 10 ** (clampedVolumeDb / 20);
}

export function clampMixerVolumeDb(volumeDb: number): number {
  if (!Number.isFinite(volumeDb)) {
    return MIXER_DEFAULT_VOLUME_DB;
  }

  return Math.min(
    MIXER_MAX_VOLUME_DB,
    Math.max(MIXER_MIN_VOLUME_DB, volumeDb),
  );
}

export function createTrackEffectState(
  kind: TrackEffectKind,
): TrackEffectState {
  if (kind === "filter") {
    return {
      enabled: true,
      id: TRACK_EFFECT_SLOT_ID,
      kind,
      parameters: createDefaultFilterEffectParameters(),
    };
  }

  if (kind === "delay") {
    return {
      enabled: true,
      id: TRACK_EFFECT_SLOT_ID,
      kind,
      parameters: createDefaultDelayEffectParameters(),
    };
  }

  if (kind === "distortion") {
    return {
      enabled: true,
      id: TRACK_EFFECT_SLOT_ID,
      kind,
      parameters: createDefaultDistortionEffectParameters(),
    };
  }

  return {
    enabled: false,
    id: TRACK_EFFECT_SLOT_ID,
    kind: "none",
    parameters: null,
  };
}

function createDefaultFilterEffectParameters(): FilterEffectParameters {
  return {
    frequencyHz: FILTER_DEFAULT_FREQUENCY_HZ,
    q: FILTER_DEFAULT_Q,
    type: "lowpass",
  };
}

function createDefaultDelayEffectParameters(): DelayEffectParameters {
  return {
    delayTimeSeconds: DELAY_DEFAULT_TIME_SECONDS,
    feedback: DELAY_DEFAULT_FEEDBACK,
    wetMix: DELAY_DEFAULT_WET_MIX,
  };
}

function createDefaultDistortionEffectParameters(): DistortionEffectParameters {
  return {
    drive: DISTORTION_DEFAULT_DRIVE,
    wetMix: DISTORTION_DEFAULT_WET_MIX,
  };
}

export function updateTrackEffectState(
  state: TrackEffectState,
  patch: Partial<Omit<TrackEffectState, "id">>,
): TrackEffectState {
  const nextKind = patch.kind ?? state.kind;

  if (nextKind !== state.kind) {
    return normalizeTrackEffectState({
      ...createTrackEffectState(nextKind),
      enabled: nextKind === "none" ? false : (patch.enabled ?? true),
      parameters: patch.parameters,
    });
  }

  return normalizeTrackEffectState({
    ...state,
    ...patch,
    id: TRACK_EFFECT_SLOT_ID,
  });
}

export function normalizeTrackMixerState(
  state: unknown,
  fallbackTrackId = isRecord(state) && typeof state.trackId === "string"
    ? state.trackId
    : "",
): TrackMixerState {
  const source = isRecord(state) ? state : {};

  return {
    effectSlot: normalizeTrackEffectState(source.effectSlot),
    muted: source.muted === true,
    solo: source.solo === true,
    trackId: typeof source.trackId === "string" ? source.trackId : fallbackTrackId,
    volumeDb: clampMixerVolumeDb(
      typeof source.volumeDb === "number"
        ? source.volumeDb
        : MIXER_DEFAULT_VOLUME_DB,
    ),
  };
}

export function normalizeTrackEffectState(
  state: unknown,
): TrackEffectState {
  if (!isRecord(state)) {
    return createTrackEffectState("none");
  }

  const kind = isTrackEffectKind(state.kind) ? state.kind : "none";

  if (kind === "none") {
    return createTrackEffectState("none");
  }

  const enabled = state.enabled !== false;

  if (kind === "filter") {
    return {
      enabled,
      id: TRACK_EFFECT_SLOT_ID,
      kind,
      parameters: normalizeFilterEffectParameters(state.parameters),
    };
  }

  if (kind === "delay") {
    return {
      enabled,
      id: TRACK_EFFECT_SLOT_ID,
      kind,
      parameters: normalizeDelayEffectParameters(state.parameters),
    };
  }

  return {
    enabled,
    id: TRACK_EFFECT_SLOT_ID,
    kind,
    parameters: normalizeDistortionEffectParameters(state.parameters),
  };
}

export function normalizeFilterEffectParameters(
  parameters: unknown,
): FilterEffectParameters {
  const source = isRecord(parameters) ? parameters : {};
  const type = source.type === "highpass" ? "highpass" : "lowpass";

  return {
    frequencyHz: clampNumber({
      fallback: FILTER_DEFAULT_FREQUENCY_HZ,
      max: FILTER_MAX_FREQUENCY_HZ,
      min: FILTER_MIN_FREQUENCY_HZ,
      value: source.frequencyHz,
    }),
    q: clampNumber({
      fallback: FILTER_DEFAULT_Q,
      max: FILTER_MAX_Q,
      min: FILTER_MIN_Q,
      value: source.q,
    }),
    type,
  };
}

export function normalizeDelayEffectParameters(
  parameters: unknown,
): DelayEffectParameters {
  const source = isRecord(parameters) ? parameters : {};

  return {
    delayTimeSeconds: clampNumber({
      fallback: DELAY_DEFAULT_TIME_SECONDS,
      max: DELAY_MAX_TIME_SECONDS,
      min: DELAY_MIN_TIME_SECONDS,
      value: source.delayTimeSeconds,
    }),
    feedback: clampNumber({
      fallback: DELAY_DEFAULT_FEEDBACK,
      max: DELAY_MAX_FEEDBACK,
      min: DELAY_MIN_FEEDBACK,
      value: source.feedback,
    }),
    wetMix: clampNumber({
      fallback: DELAY_DEFAULT_WET_MIX,
      max: EFFECT_MAX_WET_MIX,
      min: EFFECT_MIN_WET_MIX,
      value: source.wetMix,
    }),
  };
}

export function normalizeDistortionEffectParameters(
  parameters: unknown,
): DistortionEffectParameters {
  const source = isRecord(parameters) ? parameters : {};

  return {
    drive: clampNumber({
      fallback: DISTORTION_DEFAULT_DRIVE,
      max: DISTORTION_MAX_DRIVE,
      min: DISTORTION_MIN_DRIVE,
      value: source.drive,
    }),
    wetMix: clampNumber({
      fallback: DISTORTION_DEFAULT_WET_MIX,
      max: EFFECT_MAX_WET_MIX,
      min: EFFECT_MIN_WET_MIX,
      value: source.wetMix,
    }),
  };
}

function clampNumber({
  fallback,
  max,
  min,
  value,
}: {
  fallback: number;
  max: number;
  min: number;
  value: unknown;
}): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function isTrackEffectKind(value: unknown): value is TrackEffectKind {
  return (
    value === "delay" ||
    value === "distortion" ||
    value === "filter" ||
    value === "none"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
