import {
  TICKS_PER_4_4_BAR,
  TICKS_PER_16_STEP,
  type Tick,
} from "../utils";

export type DrumLaneId = "kick" | "snare" | "closedHat" | "openHat";
export type PitchedInstrumentId =
  | "default-synth"
  | "iowa-piano"
  | "audition-sub-bass"
  | "audition-naive-sawtooth"
  | "audition-acid-lead"
  | "audition-soft-pad"
  | "audition-pluck";
export type DrumStepSubdivision = 1 | 2 | 3;
export type HybridClipLengthBars = 1 | 2 | 4;

export interface DrumLaneDefinition {
  id: DrumLaneId;
  label: string;
  sampleId: string;
}

export interface DrumEvent {
  id: string;
  laneId: DrumLaneId;
  sampleId: string;
  startTick: Tick;
  velocity: number;
}

export interface NoteEvent {
  id: string;
  instrumentId: PitchedInstrumentId;
  midiNote: number;
  startTick: Tick;
  durationTicks: Tick;
  velocity: number;
}

export interface PianoRollPitch {
  keyType: "white" | "black";
  label: string;
  midiNote: number;
  sampleId: string;
}

export interface HybridClip {
  kind: "hybrid";
  id: string;
  name: string;
  lengthTicks: Tick;
  drumStepSubdivision: DrumStepSubdivision;
  drumLanes: DrumLaneDefinition[];
  drumEvents: DrumEvent[];
  pitchedInstrumentIds: PitchedInstrumentId[];
  noteEvents: NoteEvent[];
}

export const DRUM_LANES = [
  { id: "kick", label: "FRED KICK 1", sampleId: "fred-kick-1" },
  { id: "snare", label: "FRED SNARE 1", sampleId: "fred-snare-1" },
  {
    id: "closedHat",
    label: "FRED CLOSED HI-HAT",
    sampleId: "fred-closed-hi-hat",
  },
  {
    id: "openHat",
    label: "FRED OPEN HI-HAT",
    sampleId: "fred-open-hi-hat",
  },
] as const satisfies readonly DrumLaneDefinition[];

export const DEFAULT_DRUM_VELOCITY = 1;
export const DEFAULT_NOTE_VELOCITY = 0.8;
export const DEFAULT_HYBRID_CLIP_LENGTH_BARS: HybridClipLengthBars = 1;
export const HYBRID_CLIP_LENGTH_BARS = [
  1,
  2,
  4,
] as const satisfies readonly HybridClipLengthBars[];
export const DEFAULT_PITCHED_INSTRUMENT_ID: PitchedInstrumentId = "default-synth";
export const INITIAL_PITCHED_INSTRUMENT_IDS =
  [] as const satisfies readonly PitchedInstrumentId[];
export const DEFAULT_DRUM_STEP_SUBDIVISION: DrumStepSubdivision = 1;
export const DRUM_STEP_SUBDIVISIONS = [
  1,
  2,
  3,
] as const satisfies readonly DrumStepSubdivision[];
export const DRUM_STEPS_PER_BAR = 16;
export const DRUM_STEP_COUNT = DRUM_STEPS_PER_BAR;
export const PIANO_ROLL_COLUMNS_PER_BAR = 32;
export const PIANO_ROLL_COLUMN_COUNT = PIANO_ROLL_COLUMNS_PER_BAR;
export const TICKS_PER_PIANO_ROLL_COLUMN =
  TICKS_PER_4_4_BAR / PIANO_ROLL_COLUMN_COUNT;

export const PIANO_ROLL_PITCHES = [
  {
    keyType: "white",
    label: "C5",
    midiNote: 72,
    sampleId: "iowa-piano-c5",
  },
  {
    keyType: "white",
    label: "B4",
    midiNote: 71,
    sampleId: "iowa-piano-b4",
  },
  {
    keyType: "black",
    label: "Bb4",
    midiNote: 70,
    sampleId: "iowa-piano-bb4",
  },
  {
    keyType: "white",
    label: "A4",
    midiNote: 69,
    sampleId: "iowa-piano-a4",
  },
  {
    keyType: "black",
    label: "Ab4",
    midiNote: 68,
    sampleId: "iowa-piano-ab4",
  },
  {
    keyType: "white",
    label: "G4",
    midiNote: 67,
    sampleId: "iowa-piano-g4",
  },
  {
    keyType: "black",
    label: "Gb4",
    midiNote: 66,
    sampleId: "iowa-piano-gb4",
  },
  {
    keyType: "white",
    label: "F4",
    midiNote: 65,
    sampleId: "iowa-piano-f4",
  },
  {
    keyType: "white",
    label: "E4",
    midiNote: 64,
    sampleId: "iowa-piano-e4",
  },
  {
    keyType: "black",
    label: "Eb4",
    midiNote: 63,
    sampleId: "iowa-piano-eb4",
  },
  {
    keyType: "white",
    label: "D4",
    midiNote: 62,
    sampleId: "iowa-piano-d4",
  },
  {
    keyType: "black",
    label: "Db4",
    midiNote: 61,
    sampleId: "iowa-piano-db4",
  },
  {
    keyType: "white",
    label: "C4",
    midiNote: 60,
    sampleId: "iowa-piano-c4",
  },
] as const satisfies readonly PianoRollPitch[];

export function createEmptyHybridClip({
  id = "clip-1",
  lengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
  name = "Clip 1",
  drumStepSubdivision = DEFAULT_DRUM_STEP_SUBDIVISION,
  pitchedInstrumentIds = INITIAL_PITCHED_INSTRUMENT_IDS,
}: {
  drumStepSubdivision?: DrumStepSubdivision;
  id?: string;
  lengthTicks?: Tick;
  name?: string;
  pitchedInstrumentIds?: readonly PitchedInstrumentId[];
} = {}): HybridClip {
  validateHybridClipLengthTicks(lengthTicks);

  return {
    drumEvents: [],
    drumLanes: cloneDrumLanes(DRUM_LANES),
    drumStepSubdivision,
    id,
    kind: "hybrid",
    lengthTicks,
    name,
    noteEvents: [],
    pitchedInstrumentIds: [...pitchedInstrumentIds],
  };
}

export function getHybridClipLengthTicks(
  barCount: HybridClipLengthBars,
): Tick {
  validateHybridClipLengthBars(barCount);

  return barCount * TICKS_PER_4_4_BAR;
}

export function getHybridClipBarCount(
  lengthTicks: Tick,
): HybridClipLengthBars {
  validateHybridClipLengthTicks(lengthTicks);

  return (lengthTicks / TICKS_PER_4_4_BAR) as HybridClipLengthBars;
}

export function getHybridClipLengthLabel(lengthTicks: Tick): string {
  const barCount = getHybridClipBarCount(lengthTicks);

  return `${barCount} bar${barCount === 1 ? "" : "s"}`;
}

export function getDrumStepCount(
  lengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
): number {
  return getHybridClipBarCount(lengthTicks) * DRUM_STEPS_PER_BAR;
}

export function getPianoRollColumnCount(
  lengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
): number {
  return getHybridClipBarCount(lengthTicks) * PIANO_ROLL_COLUMNS_PER_BAR;
}

export function hasHybridClipEventsOutsideLength({
  clip,
  lengthTicks,
}: {
  clip: HybridClip;
  lengthTicks: Tick;
}): boolean {
  validateHybridClipLengthTicks(lengthTicks);

  return (
    clip.drumEvents.some((event) => event.startTick >= lengthTicks) ||
    clip.noteEvents.some(
      (event) =>
        event.startTick >= lengthTicks ||
        event.startTick + event.durationTicks > lengthTicks,
    )
  );
}

export function updateHybridClipLength({
  clip,
  lengthTicks,
  trimEvents = false,
}: {
  clip: HybridClip;
  lengthTicks: Tick;
  trimEvents?: boolean;
}): HybridClip {
  validateHybridClipLengthTicks(lengthTicks);

  if (clip.lengthTicks === lengthTicks) {
    return clip;
  }

  if (
    !trimEvents &&
    hasHybridClipEventsOutsideLength({
      clip,
      lengthTicks,
    })
  ) {
    throw new Error(
      "Cannot shorten clip while drum or note events extend outside the new length.",
    );
  }

  return {
    ...clip,
    drumEvents: trimEvents
      ? clip.drumEvents.filter((event) => event.startTick < lengthTicks)
      : clip.drumEvents,
    lengthTicks,
    noteEvents: trimEvents
      ? clip.noteEvents
          .filter((event) => event.startTick < lengthTicks)
          .map((event) => ({
            ...event,
            durationTicks: Math.min(
              event.durationTicks,
              lengthTicks - event.startTick,
            ),
          }))
      : clip.noteEvents,
  };
}

export function renameClip<TClip extends { name: string }>({
  clip,
  name,
}: {
  clip: TClip;
  name: string;
}): TClip {
  const trimmedName = name.trim();

  if (!trimmedName || trimmedName === clip.name) {
    return clip;
  }

  return {
    ...clip,
    name: trimmedName,
  };
}

export function duplicateHybridClip({
  clip,
  id,
  name,
}: {
  clip: HybridClip;
  id: string;
  name: string;
}): HybridClip {
  return {
    ...clip,
    drumEvents: clip.drumEvents.map((event) => ({
      ...event,
      id: createDrumEventId(id, event.laneId, event.startTick),
    })),
    drumLanes: cloneDrumLanes(clip.drumLanes),
    id,
    name,
    noteEvents: clip.noteEvents.map((event) => ({
      ...event,
      id: createNoteEventId(
        id,
        event.instrumentId,
        event.midiNote,
        event.startTick,
      ),
    })),
    pitchedInstrumentIds: [...clip.pitchedInstrumentIds],
  };
}

export function addPitchedInstrumentToClip({
  clip,
  instrumentId,
}: {
  clip: HybridClip;
  instrumentId: PitchedInstrumentId;
}): HybridClip {
  if (clip.pitchedInstrumentIds.includes(instrumentId)) {
    return clip;
  }

  return {
    ...clip,
    pitchedInstrumentIds: [...clip.pitchedInstrumentIds, instrumentId],
  };
}

export function removePitchedInstrumentFromClip({
  clip,
  instrumentId,
  removeOwnedNotes = false,
}: {
  clip: HybridClip;
  instrumentId: PitchedInstrumentId;
  removeOwnedNotes?: boolean;
}): HybridClip {
  if (!clip.pitchedInstrumentIds.includes(instrumentId)) {
    return clip;
  }

  return {
    ...clip,
    noteEvents: removeOwnedNotes
      ? clip.noteEvents.filter((event) => event.instrumentId !== instrumentId)
      : clip.noteEvents,
    pitchedInstrumentIds: clip.pitchedInstrumentIds.filter(
      (candidate) => candidate !== instrumentId,
    ),
  };
}

export function hasNoteEventsForPitchedInstrument({
  clip,
  instrumentId,
}: {
  clip: HybridClip;
  instrumentId: PitchedInstrumentId;
}): boolean {
  return clip.noteEvents.some((event) => event.instrumentId === instrumentId);
}

export function getDrumStepStartTick(
  stepIndex: number,
  clipLengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
): Tick {
  validateStepIndex(stepIndex, clipLengthTicks);

  return stepIndex * TICKS_PER_16_STEP;
}

export function getDrumSubstepTicks(
  subdivision: DrumStepSubdivision,
): Tick {
  validateDrumStepSubdivision(subdivision);

  return TICKS_PER_16_STEP / subdivision;
}

export function getDrumSubstepStartTick({
  stepIndex,
  substepIndex,
  subdivision,
  clipLengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
}: {
  clipLengthTicks?: Tick;
  stepIndex: number;
  substepIndex: number;
  subdivision: DrumStepSubdivision;
}): Tick {
  validateStepIndex(stepIndex, clipLengthTicks);
  validateSubstepIndex(substepIndex, subdivision);

  return (
    getDrumStepStartTick(stepIndex, clipLengthTicks) +
    substepIndex * getDrumSubstepTicks(subdivision)
  );
}

export function isDrumStepActive(
  drumEvents: readonly DrumEvent[],
  laneId: DrumLaneId,
  stepIndex: number,
  clipLengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
): boolean {
  const startTick = getDrumStepStartTick(stepIndex, clipLengthTicks);

  return drumEvents.some(
    (event) => event.laneId === laneId && event.startTick === startTick,
  );
}

export function isDrumSubstepActive({
  drumEvents,
  laneId,
  stepIndex,
  substepIndex,
  subdivision,
  clipLengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
}: {
  clipLengthTicks?: Tick;
  drumEvents: readonly DrumEvent[];
  laneId: DrumLaneId;
  stepIndex: number;
  substepIndex: number;
  subdivision: DrumStepSubdivision;
}): boolean {
  const startTick = getDrumSubstepStartTick({
    clipLengthTicks,
    stepIndex,
    subdivision,
    substepIndex,
  });

  return drumEvents.some(
    (event) => event.laneId === laneId && event.startTick === startTick,
  );
}

export function toggleDrumStep({
  clip,
  laneId,
  stepIndex,
  velocity = DEFAULT_DRUM_VELOCITY,
}: {
  clip: HybridClip;
  laneId: DrumLaneId;
  stepIndex: number;
  velocity?: number;
}): HybridClip {
  return toggleDrumSubstep({
    clip,
    laneId,
    stepIndex,
    substepIndex: 0,
    velocity,
  });
}

export function toggleDrumSubstep({
  clip,
  laneId,
  stepIndex,
  substepIndex,
  velocity = DEFAULT_DRUM_VELOCITY,
}: {
  clip: HybridClip;
  laneId: DrumLaneId;
  stepIndex: number;
  substepIndex: number;
  velocity?: number;
}): HybridClip {
  const lane = getDrumLane(clip.drumLanes, laneId);
  const startTick = getDrumSubstepStartTick({
    clipLengthTicks: clip.lengthTicks,
    stepIndex,
    subdivision: clip.drumStepSubdivision,
    substepIndex,
  });
  const eventExists = isDrumSubstepActive({
    drumEvents: clip.drumEvents,
    clipLengthTicks: clip.lengthTicks,
    laneId,
    stepIndex,
    subdivision: clip.drumStepSubdivision,
    substepIndex,
  });

  if (eventExists) {
    return {
      ...clip,
      drumEvents: clip.drumEvents.filter(
        (event) => !(event.laneId === laneId && event.startTick === startTick),
      ),
    };
  }

  const drumEvents = [
    ...clip.drumEvents,
    {
      id: createDrumEventId(clip.id, laneId, startTick),
      laneId,
      sampleId: lane.sampleId,
      startTick,
      velocity,
    },
  ];

  drumEvents.sort(createDrumEventComparator(clip.drumLanes));

  return {
    ...clip,
    drumEvents,
  };
}

export function updateDrumStepSubdivision({
  clip,
  subdivision,
}: {
  clip: HybridClip;
  subdivision: DrumStepSubdivision;
}): HybridClip {
  validateDrumStepSubdivision(subdivision);

  if (clip.drumStepSubdivision === subdivision) {
    return clip;
  }

  return {
    ...clip,
    drumStepSubdivision: subdivision,
  };
}

export function updateDrumLaneSample({
  clip,
  label,
  laneId,
  sampleId,
}: {
  clip: HybridClip;
  label: string;
  laneId: DrumLaneId;
  sampleId: string;
}): HybridClip {
  getDrumLane(clip.drumLanes, laneId);

  return {
    ...clip,
    drumEvents: clip.drumEvents.map((event) =>
      event.laneId === laneId
        ? {
            ...event,
            sampleId,
          }
        : event,
    ),
    drumLanes: clip.drumLanes.map((lane) =>
      lane.id === laneId
        ? {
            ...lane,
            label,
            sampleId,
          }
        : lane,
    ),
  };
}

export function moveDrumLane({
  clip,
  laneId,
  targetIndex,
}: {
  clip: HybridClip;
  laneId: DrumLaneId;
  targetIndex: number;
}): HybridClip {
  const currentIndex = clip.drumLanes.findIndex((lane) => lane.id === laneId);

  if (currentIndex < 0) {
    throw new Error(`Unknown drum lane ID: ${laneId}`);
  }

  const nextDrumLanes = [...clip.drumLanes];
  const [movedLane] = nextDrumLanes.splice(currentIndex, 1);

  if (!movedLane) {
    throw new Error(`Unknown drum lane ID: ${laneId}`);
  }

  const boundedTargetIndex = Math.min(
    Math.max(targetIndex, 0),
    nextDrumLanes.length,
  );

  nextDrumLanes.splice(boundedTargetIndex, 0, movedLane);

  return {
    ...clip,
    drumEvents: [...clip.drumEvents].sort(
      createDrumEventComparator(nextDrumLanes),
    ),
    drumLanes: nextDrumLanes,
  };
}

export function getPianoRollColumnStartTick(
  columnIndex: number,
  clipLengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
): Tick {
  validatePianoRollColumnIndex(columnIndex, clipLengthTicks);

  return columnIndex * TICKS_PER_PIANO_ROLL_COLUMN;
}

export function getPianoRollPitchByMidiNote(
  midiNote: number,
): PianoRollPitch | undefined {
  return PIANO_ROLL_PITCHES.find((pitch) => pitch.midiNote === midiNote);
}

export function addNoteEvent({
  clip,
  durationTicks,
  instrumentId = DEFAULT_PITCHED_INSTRUMENT_ID,
  midiNote,
  startTick,
  velocity = DEFAULT_NOTE_VELOCITY,
}: {
  clip: HybridClip;
  durationTicks: Tick;
  instrumentId?: PitchedInstrumentId;
  midiNote: number;
  startTick: Tick;
  velocity?: number;
}): HybridClip {
  validateMidiNote(midiNote);
  validateVelocity(velocity);

  const nextTiming = normalizeNoteTiming({
    durationTicks,
    lengthTicks: clip.lengthTicks,
    startTick,
  });
  const nextNote: NoteEvent = {
    durationTicks: nextTiming.durationTicks,
    id: createNoteEventId(clip.id, instrumentId, midiNote, nextTiming.startTick),
    instrumentId,
    midiNote,
    startTick: nextTiming.startTick,
    velocity,
  };
  const noteEvents = [
    ...clip.noteEvents.filter(
      (event) =>
        !(
          event.instrumentId === nextNote.instrumentId &&
          event.midiNote === nextNote.midiNote &&
          event.startTick === nextNote.startTick
        ),
    ),
    nextNote,
  ];

  noteEvents.sort(createNoteEventComparator);

  return {
    ...clip,
    noteEvents,
  };
}

export function deleteNoteEvent({
  clip,
  noteId,
}: {
  clip: HybridClip;
  noteId: string;
}): HybridClip {
  return {
    ...clip,
    noteEvents: clip.noteEvents.filter((event) => event.id !== noteId),
  };
}

export function moveNoteEvent({
  clip,
  midiNote,
  noteId,
  startTick,
}: {
  clip: HybridClip;
  midiNote: number;
  noteId: string;
  startTick: Tick;
}): HybridClip {
  validateMidiNote(midiNote);

  const note = clip.noteEvents.find((event) => event.id === noteId);

  if (!note) {
    return clip;
  }

  const nextTiming = normalizeNoteTiming({
    durationTicks: note.durationTicks,
    lengthTicks: clip.lengthTicks,
    startTick,
  });
  const movedNote: NoteEvent = {
    ...note,
    midiNote,
    startTick: nextTiming.startTick,
  };
  const noteEvents = [
    ...clip.noteEvents.filter(
      (event) =>
        event.id !== noteId &&
        !(
          event.instrumentId === movedNote.instrumentId &&
          event.midiNote === movedNote.midiNote &&
          event.startTick === movedNote.startTick
        ),
    ),
    movedNote,
  ];

  noteEvents.sort(createNoteEventComparator);

  return {
    ...clip,
    noteEvents,
  };
}

export function resizeNoteEvent({
  clip,
  durationTicks,
  noteId,
}: {
  clip: HybridClip;
  durationTicks: Tick;
  noteId: string;
}): HybridClip {
  const note = clip.noteEvents.find((event) => event.id === noteId);

  if (!note) {
    return clip;
  }

  const nextTiming = normalizeNoteTiming({
    durationTicks,
    lengthTicks: clip.lengthTicks,
    startTick: note.startTick,
  });

  return {
    ...clip,
    noteEvents: clip.noteEvents.map((event) =>
      event.id === noteId
        ? {
            ...event,
            durationTicks: nextTiming.durationTicks,
          }
        : event,
    ),
  };
}

function getDrumLane(
  drumLanes: readonly DrumLaneDefinition[],
  laneId: DrumLaneId,
): DrumLaneDefinition {
  const lane = drumLanes.find((candidate) => candidate.id === laneId);

  if (!lane) {
    throw new Error(`Unknown drum lane ID: ${laneId}`);
  }

  return lane;
}

function createDrumEventComparator(
  drumLanes: readonly DrumLaneDefinition[],
): (left: DrumEvent, right: DrumEvent) => number {
  const drumLaneOrder = new Map<DrumLaneId, number>(
    drumLanes.map((lane, index) => [lane.id, index]),
  );

  return (left, right) => {
    if (left.startTick !== right.startTick) {
      return left.startTick - right.startTick;
    }

    return (
      getLaneOrder(drumLaneOrder, left.laneId) -
      getLaneOrder(drumLaneOrder, right.laneId)
    );
  };
}

function getLaneOrder(
  drumLaneOrder: ReadonlyMap<DrumLaneId, number>,
  laneId: DrumLaneId,
): number {
  return drumLaneOrder.get(laneId) ?? Number.MAX_SAFE_INTEGER;
}

function createDrumEventId(
  clipId: string,
  laneId: DrumLaneId,
  startTick: Tick,
): string {
  return `${clipId}:drum:${laneId}:${startTick}`;
}

function createNoteEventId(
  clipId: string,
  instrumentId: PitchedInstrumentId,
  midiNote: number,
  startTick: Tick,
): string {
  return `${clipId}:note:${instrumentId}:${midiNote}:${startTick}`;
}

function createNoteEventComparator(left: NoteEvent, right: NoteEvent): number {
  if (left.startTick !== right.startTick) {
    return left.startTick - right.startTick;
  }

  if (left.instrumentId !== right.instrumentId) {
    return left.instrumentId.localeCompare(right.instrumentId);
  }

  return right.midiNote - left.midiNote;
}

function validateHybridClipLengthBars(
  barCount: number,
): asserts barCount is HybridClipLengthBars {
  if (!HYBRID_CLIP_LENGTH_BARS.includes(barCount as HybridClipLengthBars)) {
    throw new Error(
      `barCount must be one of ${HYBRID_CLIP_LENGTH_BARS.join(", ")}. Received ${barCount}.`,
    );
  }
}

function validateHybridClipLengthTicks(lengthTicks: Tick): void {
  if (!Number.isFinite(lengthTicks)) {
    throw new Error(`lengthTicks must be finite. Received ${lengthTicks}.`);
  }

  const barCount = lengthTicks / TICKS_PER_4_4_BAR;

  validateHybridClipLengthBars(barCount);
}

function validateStepIndex(
  stepIndex: number,
  clipLengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
): void {
  const stepCount = getDrumStepCount(clipLengthTicks);

  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= stepCount) {
    throw new Error(
      `stepIndex must be an integer from 0 to ${
        stepCount - 1
      }. Received ${stepIndex}.`,
    );
  }
}

function validateDrumStepSubdivision(
  subdivision: number,
): asserts subdivision is DrumStepSubdivision {
  if (!DRUM_STEP_SUBDIVISIONS.includes(subdivision as DrumStepSubdivision)) {
    throw new Error(
      `subdivision must be one of ${DRUM_STEP_SUBDIVISIONS.join(", ")}. Received ${subdivision}.`,
    );
  }
}

function validateSubstepIndex(
  substepIndex: number,
  subdivision: DrumStepSubdivision,
): void {
  validateDrumStepSubdivision(subdivision);

  if (
    !Number.isInteger(substepIndex) ||
    substepIndex < 0 ||
    substepIndex >= subdivision
  ) {
    throw new Error(
      `substepIndex must be an integer from 0 to ${subdivision - 1}. Received ${substepIndex}.`,
    );
  }
}

function validatePianoRollColumnIndex(
  columnIndex: number,
  clipLengthTicks = getHybridClipLengthTicks(DEFAULT_HYBRID_CLIP_LENGTH_BARS),
): void {
  const columnCount = getPianoRollColumnCount(clipLengthTicks);

  if (
    !Number.isInteger(columnIndex) ||
    columnIndex < 0 ||
    columnIndex >= columnCount
  ) {
    throw new Error(
      `columnIndex must be an integer from 0 to ${
        columnCount - 1
      }. Received ${columnIndex}.`,
    );
  }
}

function validateMidiNote(midiNote: number): void {
  if (!Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127) {
    throw new Error(`midiNote must be an integer from 0 to 127. Received ${midiNote}.`);
  }
}

function validateVelocity(velocity: number): void {
  if (!Number.isFinite(velocity) || velocity < 0 || velocity > 1) {
    throw new Error(`velocity must be a number from 0 to 1. Received ${velocity}.`);
  }
}

function normalizeNoteTiming({
  durationTicks,
  lengthTicks,
  startTick,
}: {
  durationTicks: Tick;
  lengthTicks: Tick;
  startTick: Tick;
}): { durationTicks: Tick; startTick: Tick } {
  if (!Number.isFinite(startTick)) {
    throw new Error(`startTick must be finite. Received ${startTick}.`);
  }

  validateHybridClipLengthTicks(lengthTicks);

  if (!Number.isFinite(durationTicks) || durationTicks <= 0) {
    throw new Error(
      `durationTicks must be a positive finite number. Received ${durationTicks}.`,
    );
  }

  const boundedStartTick = Math.min(
    Math.max(startTick, 0),
    lengthTicks - TICKS_PER_PIANO_ROLL_COLUMN,
  );
  const boundedDurationTicks = Math.min(
    durationTicks,
    lengthTicks - boundedStartTick,
  );

  return {
    durationTicks: boundedDurationTicks,
    startTick: boundedStartTick,
  };
}

function cloneDrumLanes(
  drumLanes: readonly DrumLaneDefinition[],
): DrumLaneDefinition[] {
  return drumLanes.map((lane) => ({ ...lane }));
}
