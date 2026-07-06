import type { Tick } from "../utils";
import {
  TICKS_PER_4_4_BAR,
  TICKS_PER_BEAT,
  secondsToTicks,
} from "../utils";
import {
  isAudioClip,
  isHybridClip,
  isValidImportedAudioSourceBpm,
  type Clip,
} from "./audio-clip";

export type TrackId = string;
export type ClipInstanceId = string;

export interface ArrangementTrack {
  id: TrackId;
  name: string;
}

export interface ClipInstance {
  id: ClipInstanceId;
  clipId: string;
  trackId: TrackId;
  startTick: Tick;
  lengthTicks: Tick;
  sourceOffsetSeconds?: number;
}

export interface ArrangementLoopRange {
  startTick: Tick;
  endTick: Tick;
}

export interface ArrangementState {
  lengthBars: number;
  loopRange: ArrangementLoopRange;
}

export const ARRANGEMENT_TRACK_COUNT = 12;
export const MIN_ARRANGEMENT_LENGTH_BARS = 1;
export const DEFAULT_ARRANGEMENT_LENGTH_BARS = 16;
export const MAX_ARRANGEMENT_LENGTH_BARS = 128;
export const ARRANGEMENT_BAR_COUNT = DEFAULT_ARRANGEMENT_LENGTH_BARS;
export const ARRANGEMENT_SNAP_TICKS = TICKS_PER_BEAT;
export const ARRANGEMENT_VISIBLE_LENGTH_TICKS =
  getArrangementLengthTicks(DEFAULT_ARRANGEMENT_LENGTH_BARS);
export const ARRANGEMENT_CLIP_DRAG_TYPE = "application/x-mini-daw-clip-id";
export const ARRANGEMENT_CLIP_INSTANCE_DRAG_TYPE =
  "application/x-mini-daw-clip-instance-id";

export function createDefaultArrangementTracks(
  count = ARRANGEMENT_TRACK_COUNT,
): ArrangementTrack[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
  }));
}

export function getArrangementLengthTicks(lengthBars: number): Tick {
  return normalizeArrangementLengthBars(lengthBars) * TICKS_PER_4_4_BAR;
}

export function normalizeArrangementLengthBars(lengthBars: number): number {
  if (!Number.isFinite(lengthBars)) {
    return DEFAULT_ARRANGEMENT_LENGTH_BARS;
  }

  return clampInteger(
    Math.round(lengthBars),
    MIN_ARRANGEMENT_LENGTH_BARS,
    MAX_ARRANGEMENT_LENGTH_BARS,
  );
}

export function createDefaultArrangementLoopRange(
  lengthBars = DEFAULT_ARRANGEMENT_LENGTH_BARS,
): ArrangementLoopRange {
  return {
    endTick: getArrangementLengthTicks(lengthBars),
    startTick: 0,
  };
}

export function createClipInstance({
  clip,
  existingInstanceIds,
  sourceBpm,
  startTick,
  tempoBpm,
  trackId,
}: {
  clip: Clip;
  existingInstanceIds: readonly ClipInstanceId[];
  sourceBpm?: number;
  startTick: Tick;
  tempoBpm: number;
  trackId: TrackId;
}): ClipInstance {
  const snappedStartTick = snapArrangementTick(startTick);
  const lengthTicks = getDefaultClipInstanceLength({
    clip,
    sourceBpm,
    tempoBpm,
  });

  return {
    clipId: clip.id,
    id: createUniqueClipInstanceId({
      clipId: clip.id,
      existingInstanceIds,
      startTick: snappedStartTick,
      trackId,
    }),
    lengthTicks,
    startTick: snappedStartTick,
    trackId,
  };
}

export function moveClipInstance({
  instance,
  startTick,
  trackId,
}: {
  instance: ClipInstance;
  startTick: Tick;
  trackId: TrackId;
}): ClipInstance {
  return {
    ...instance,
    startTick: snapArrangementTick(startTick),
    trackId,
  };
}

export function deleteClipInstance(
  instances: readonly ClipInstance[],
  instanceId: ClipInstanceId,
): ClipInstance[] {
  return instances.filter((instance) => instance.id !== instanceId);
}

export function snapArrangementTick(
  tick: Tick,
  snapTicks = ARRANGEMENT_SNAP_TICKS,
): Tick {
  if (!Number.isFinite(tick)) {
    return 0;
  }

  if (!Number.isFinite(snapTicks) || snapTicks <= 0) {
    throw new Error(`snapTicks must be positive. Received ${snapTicks}.`);
  }

  return Math.max(0, Math.round(tick / snapTicks) * snapTicks);
}

export function getArrangementPlaybackEndTick(
  instances: readonly ClipInstance[],
  minimumEndTick = getArrangementLengthTicks(DEFAULT_ARRANGEMENT_LENGTH_BARS),
): Tick {
  const lastInstanceEndTick = instances.reduce(
    (highestEndTick, instance) =>
      Math.max(highestEndTick, instance.startTick + instance.lengthTicks),
    0,
  );

  return Math.max(minimumEndTick, ceilTickToSnap(lastInstanceEndTick));
}

export function normalizeArrangementLoopRange({
  endTick,
  startTick,
}: ArrangementLoopRange, lengthBars = DEFAULT_ARRANGEMENT_LENGTH_BARS): ArrangementLoopRange {
  const maxEndBoundaryIndex = normalizeArrangementLengthBars(lengthBars);
  const startBoundaryIndex = clampInteger(
    Math.round(startTick / TICKS_PER_4_4_BAR),
    0,
    maxEndBoundaryIndex - 1,
  );
  const minimumEndBoundaryIndex = startBoundaryIndex + 1;
  const endBoundaryIndex = clampInteger(
    Math.round(endTick / TICKS_PER_4_4_BAR),
    minimumEndBoundaryIndex,
    maxEndBoundaryIndex,
  );

  return {
    endTick: endBoundaryIndex * TICKS_PER_4_4_BAR,
    startTick: startBoundaryIndex * TICKS_PER_4_4_BAR,
  };
}

export function getArrangementLoopBoundaryIndex(tick: Tick): number {
  return getArrangementLoopBoundaryIndexForLength(
    tick,
    DEFAULT_ARRANGEMENT_LENGTH_BARS,
  );
}

export function getArrangementLoopBoundaryIndexForLength(
  tick: Tick,
  lengthBars: number,
): number {
  return clampInteger(
    Math.round(tick / TICKS_PER_4_4_BAR),
    0,
    normalizeArrangementLengthBars(lengthBars),
  );
}

export function getClipInstancesOutsideArrangementLength({
  instances,
  lengthBars,
}: {
  instances: readonly ClipInstance[];
  lengthBars: number;
}): ClipInstance[] {
  const arrangementLengthTicks = getArrangementLengthTicks(lengthBars);

  return instances.filter(
    (instance) => instance.startTick + instance.lengthTicks > arrangementLengthTicks,
  );
}

export function removeClipInstancesOutsideArrangementLength({
  instances,
  lengthBars,
}: {
  instances: readonly ClipInstance[];
  lengthBars: number;
}): ClipInstance[] {
  const outOfRangeInstanceIds = new Set(
    getClipInstancesOutsideArrangementLength({ instances, lengthBars }).map(
      (instance) => instance.id,
    ),
  );

  return instances.filter((instance) => !outOfRangeInstanceIds.has(instance.id));
}

function getDefaultClipInstanceLength({
  clip,
  sourceBpm,
  tempoBpm,
}: {
  clip: Clip;
  sourceBpm?: number;
  tempoBpm: number;
}): Tick {
  if (isHybridClip(clip)) {
    return clip.lengthTicks;
  }

  if (isAudioClip(clip)) {
    const durationTempoBpm = isValidImportedAudioSourceBpm(sourceBpm)
      ? sourceBpm
      : tempoBpm;

    return Math.max(
      ARRANGEMENT_SNAP_TICKS,
      ceilTickToSnap(
        secondsToTicks(clip.durationSeconds, { tempoBpm: durationTempoBpm }),
      ),
    );
  }

  return TICKS_PER_4_4_BAR;
}

function ceilTickToSnap(tick: Tick, snapTicks = ARRANGEMENT_SNAP_TICKS): Tick {
  if (!Number.isFinite(tick) || tick <= 0) {
    return snapTicks;
  }

  return Math.ceil(tick / snapTicks) * snapTicks;
}

function createUniqueClipInstanceId({
  clipId,
  existingInstanceIds,
  startTick,
  trackId,
}: {
  clipId: string;
  existingInstanceIds: readonly ClipInstanceId[];
  startTick: Tick;
  trackId: TrackId;
}): ClipInstanceId {
  const baseId = `clip-instance-${clipId}-${trackId}-${startTick}`;
  const existingIds = new Set(existingInstanceIds);

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;

  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }

  return candidate;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
