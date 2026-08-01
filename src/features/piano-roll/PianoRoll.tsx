import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import { Panel } from "../../components";
import {
  PIANO_ROLL_COLUMNS_PER_BAR,
  TICKS_PER_PIANO_ROLL_COLUMN,
  getHybridClipBarCount,
  getPianoRollColumnCount,
  getPianoRollPitchByMidiNote,
  type NoteEvent,
  type PianoRollPitch,
} from "../../model";
import { type Tick } from "../../utils";
import { PianoKeyboard } from "./PianoKeyboard";
import styles from "./PianoRoll.module.css";

interface PianoRollProps {
  clipLengthTicks: Tick;
  instrumentName: string;
  noteEvents: readonly NoteEvent[];
  pitches: readonly PianoRollPitch[];
  playheadTick: Tick;
  shouldShowPlayhead: boolean;
  onNoteCreate: (note: {
    durationTicks: Tick;
    midiNote: number;
    startTick: Tick;
  }) => void;
  onNoteDelete: (noteId: string) => void;
  onNoteMove: (note: {
    midiNote: number;
    noteId: string;
    startTick: Tick;
  }) => void;
}

interface GridPosition {
  columnIndex: number;
  rowIndex: number;
}

interface DraftNote {
  anchorColumnIndex: number;
  currentColumnIndex: number;
  pointerId: number;
  rowIndex: number;
}

interface MovingNote {
  columnOffset: number;
  currentColumnIndex: number;
  currentRowIndex: number;
  durationColumns: number;
  noteId: string;
  pointerId: number;
}

interface NoteGeometry {
  columnIndex: number;
  durationColumns: number;
  rowIndex: number;
}

const BEATS_PER_BAR = 4;
const PIANO_ROLL_COLUMNS_PER_BEAT = PIANO_ROLL_COLUMNS_PER_BAR / BEATS_PER_BAR;
const EMPTY_ROLL_DEFAULT_LOW_MIDI_NOTE = 60;
const EMPTY_ROLL_DEFAULT_HIGH_MIDI_NOTE = 72;

export function PianoRoll({
  clipLengthTicks,
  instrumentName,
  noteEvents,
  pitches,
  playheadTick,
  shouldShowPlayhead,
  onNoteCreate,
  onNoteDelete,
  onNoteMove,
}: PianoRollProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [draftNote, setDraftNote] = useState<DraftNote | null>(null);
  const [movingNote, setMovingNote] = useState<MovingNote | null>(null);
  const [gridScrollTop, setGridScrollTop] = useState(0);
  const [initialCenteredRowIndex] = useState(() =>
    getInitialCenteredRowIndex({ noteEvents, pitches }),
  );
  const pianoRows = pitches.map((pitch) => ({
    id: `midi-${pitch.midiNote}`,
    keyType: pitch.keyType,
    label: pitch.label,
  }));
  const barCount = getHybridClipBarCount(clipLengthTicks);
  const beatCount = barCount * BEATS_PER_BAR;
  const columnCount = getPianoRollColumnCount(clipLengthTicks);
  const beatMarkers = Array.from({ length: beatCount }, (_, beatIndex) => ({
    columnIndex: beatIndex * PIANO_ROLL_COLUMNS_PER_BEAT,
    id: `beat-${beatIndex + 1}`,
    label: String(beatIndex + 1),
  }));
  const timelineStyle = {
    "--piano-beat-width": `calc(100% / ${beatCount})`,
    "--piano-step-width": `calc(100% / ${columnCount})`,
    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
    width: `calc(100% * ${barCount})`,
  } as CSSProperties;
  const handleGridViewportRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || initialCenteredRowIndex === null) {
        return;
      }

      window.requestAnimationFrame(() => {
        const gridElement = gridRef.current;

        if (!gridElement) {
          return;
        }

        const rowHeight =
          gridElement.getBoundingClientRect().height / Math.max(pitches.length, 1);
        const headerHeight =
          element
            .querySelector(`.${styles.beatHeader}`)
            ?.getBoundingClientRect().height ?? 0;
        const visibleNoteHeight = Math.max(
          element.clientHeight - headerHeight,
          rowHeight,
        );
        const centeredScrollTop =
          rowHeight * (initialCenteredRowIndex + 0.5) - visibleNoteHeight / 2;
        const nextScrollTop = clamp(
          centeredScrollTop,
          0,
          Math.max(element.scrollHeight - element.clientHeight, 0),
        );

        element.scrollTop = nextScrollTop;
        setGridScrollTop(nextScrollTop);
      });
    },
    [initialCenteredRowIndex, pitches.length],
  );

  function handleGridPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const gridPosition = getGridPosition(event);

    if (!gridPosition) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftNote({
      anchorColumnIndex: gridPosition.columnIndex,
      currentColumnIndex: gridPosition.columnIndex,
      pointerId: event.pointerId,
      rowIndex: gridPosition.rowIndex,
    });
  }

  function handleGridPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draftNote || draftNote.pointerId !== event.pointerId) {
      return;
    }

    const gridPosition = getGridPosition(event);

    if (!gridPosition) {
      return;
    }

    setDraftNote({
      ...draftNote,
      currentColumnIndex: gridPosition.columnIndex,
    });
  }

  function handleGridPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!draftNote || draftNote.pointerId !== event.pointerId) {
      return;
    }

    const draftGeometry = getDraftNoteGeometry(draftNote);
    const pitch = pitches[draftGeometry.rowIndex];

    if (pitch) {
      onNoteCreate({
        durationTicks:
          draftGeometry.durationColumns * TICKS_PER_PIANO_ROLL_COLUMN,
        midiNote: pitch.midiNote,
        startTick: draftGeometry.columnIndex * TICKS_PER_PIANO_ROLL_COLUMN,
      });
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    setDraftNote(null);
  }

  function handleGridPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (draftNote?.pointerId === event.pointerId) {
      setDraftNote(null);
    }
  }

  function handleNotePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    note: NoteEvent,
  ) {
    if (event.button !== 0) {
      return;
    }

    const gridPosition = getGridPosition(event);
    const noteGeometry = getNoteGeometry(note, columnCount, pitches);

    if (!gridPosition || !noteGeometry) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setMovingNote({
      columnOffset: Math.max(
        gridPosition.columnIndex - noteGeometry.columnIndex,
        0,
      ),
      currentColumnIndex: noteGeometry.columnIndex,
      currentRowIndex: noteGeometry.rowIndex,
      durationColumns: noteGeometry.durationColumns,
      noteId: note.id,
      pointerId: event.pointerId,
    });
  }

  function handleNotePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!movingNote || movingNote.pointerId !== event.pointerId) {
      return;
    }

    const gridPosition = getGridPosition(event);

    if (!gridPosition) {
      return;
    }

    const maxColumnIndex = columnCount - movingNote.durationColumns;
    setMovingNote({
      ...movingNote,
      currentColumnIndex: clamp(
        gridPosition.columnIndex - movingNote.columnOffset,
        0,
        maxColumnIndex,
      ),
      currentRowIndex: gridPosition.rowIndex,
    });
  }

  function handleNotePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!movingNote || movingNote.pointerId !== event.pointerId) {
      return;
    }

    const pitch = pitches[movingNote.currentRowIndex];

    if (pitch) {
      onNoteMove({
        midiNote: pitch.midiNote,
        noteId: movingNote.noteId,
        startTick:
          movingNote.currentColumnIndex * TICKS_PER_PIANO_ROLL_COLUMN,
      });
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    setMovingNote(null);
  }

  function handleNotePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    if (movingNote?.pointerId === event.pointerId) {
      setMovingNote(null);
    }
  }

  function handleNoteContextMenu(
    event: MouseEvent<HTMLButtonElement>,
    noteId: string,
  ) {
    event.preventDefault();
    onNoteDelete(noteId);
  }

  function getGridPosition(
    event: PointerEvent<HTMLElement>,
  ): GridPosition | null {
    const gridElement = gridRef.current;

    if (!gridElement) {
      return null;
    }

    if (pitches.length === 0) {
      return null;
    }

    const rect = gridElement.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width - 1);
    const y = clamp(event.clientY - rect.top, 0, rect.height - 1);
    const rowHeight = rect.height / pitches.length;

    return {
      columnIndex: clamp(
        Math.floor((x / rect.width) * columnCount),
        0,
        columnCount - 1,
      ),
      rowIndex: clamp(
        Math.floor(y / rowHeight),
        0,
        pitches.length - 1,
      ),
    };
  }

  const gridHeight = `calc(var(--piano-row-height) * ${pitches.length})`;
  const movingNoteId = movingNote?.noteId ?? null;

  return (
    <Panel
      actions={
        <div className={styles.rollActions}>
          <span>Grid: 1/32</span>
          <span>{barCount} bar{barCount === 1 ? "" : "s"}</span>
          <span>Tool: Draw</span>
        </div>
      }
      className={styles.pianoRollPanel}
      eyebrow="PIANO ROLL"
      title={instrumentName}
    >
      <div className={styles.rollShell}>
        <div className={styles.editorBody}>
          <PianoKeyboard rows={pianoRows} scrollTop={gridScrollTop} />

          <div
            className={styles.gridViewport}
            onScroll={(event) => setGridScrollTop(event.currentTarget.scrollTop)}
            ref={handleGridViewportRef}
          >
            <div
              className={styles.beatHeader}
              aria-hidden="true"
              style={timelineStyle}
            >
              {beatMarkers.map((marker) => (
                <span
                  className={styles.beatMarker}
                  key={marker.id}
                  style={{ gridColumn: marker.columnIndex + 1 }}
                >
                  {marker.label}
                </span>
              ))}
            </div>

            <div
              className={styles.noteGrid}
              aria-label="Piano roll note grid"
              onContextMenu={(event) => event.preventDefault()}
              onPointerCancel={handleGridPointerCancel}
              onPointerDown={handleGridPointerDown}
              onPointerMove={handleGridPointerMove}
              onPointerUp={handleGridPointerUp}
              ref={gridRef}
              style={{ ...timelineStyle, height: gridHeight }}
            >
              {noteEvents.map((note) => {
                const noteGeometry =
                  note.id === movingNoteId && movingNote
                    ? {
                        columnIndex: movingNote.currentColumnIndex,
                        durationColumns: movingNote.durationColumns,
                        rowIndex: movingNote.currentRowIndex,
                      }
                    : getNoteGeometry(note, columnCount, pitches);

                if (!noteGeometry) {
                  return null;
                }

                const pitch = getPianoRollPitchByMidiNote(
                  note.midiNote,
                  pitches,
                );
                const noteLabel = pitch?.label ?? `MIDI ${note.midiNote}`;

                return (
                  <button
                    aria-label={`${noteLabel} note at tick ${note.startTick}`}
                    className={`${styles.note} ${
                      note.id === movingNoteId ? styles.noteActive : ""
                    }`}
                    key={note.id}
                    onContextMenu={(event) => handleNoteContextMenu(event, note.id)}
                    onPointerCancel={handleNotePointerCancel}
                    onPointerDown={(event) => handleNotePointerDown(event, note)}
                    onPointerMove={handleNotePointerMove}
                    onPointerUp={handleNotePointerUp}
                    style={getNoteStyle(noteGeometry, columnCount)}
                    type="button"
                  >
                    {noteLabel}
                  </button>
                );
              })}

              {draftNote ? (
                <div
                  className={`${styles.note} ${styles.noteDraft}`}
                  style={getNoteStyle(
                    getDraftNoteGeometry(draftNote),
                    columnCount,
                  )}
                >
                  {pitches[draftNote.rowIndex]?.label}
                </div>
              ) : null}

              {shouldShowPlayhead ? (
                <div
                  aria-hidden="true"
                  className={styles.playhead}
                  style={getPlayheadStyle({ clipLengthTicks, playheadTick })}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function getDraftNoteGeometry(draftNote: DraftNote): NoteGeometry {
  const columnIndex = Math.min(
    draftNote.anchorColumnIndex,
    draftNote.currentColumnIndex,
  );
  const durationColumns =
    Math.abs(draftNote.currentColumnIndex - draftNote.anchorColumnIndex) + 1;

  return {
    columnIndex,
    durationColumns,
    rowIndex: draftNote.rowIndex,
  };
}

function getNoteGeometry(
  note: NoteEvent,
  columnCount: number,
  pitches: readonly PianoRollPitch[],
): NoteGeometry | null {
  const rowIndex = pitches.findIndex(
    (pitch) => pitch.midiNote === note.midiNote,
  );

  if (rowIndex < 0) {
    return null;
  }

  return {
    columnIndex: clamp(
      Math.round(note.startTick / TICKS_PER_PIANO_ROLL_COLUMN),
      0,
      columnCount - 1,
    ),
    durationColumns: clamp(
      Math.round(note.durationTicks / TICKS_PER_PIANO_ROLL_COLUMN),
      1,
      columnCount,
    ),
    rowIndex,
  };
}

function getInitialCenteredRowIndex({
  noteEvents,
  pitches,
}: {
  noteEvents: readonly NoteEvent[];
  pitches: readonly PianoRollPitch[];
}): number | null {
  return (
    getFirstVisibleNoteRowIndex({ noteEvents, pitches }) ??
    getEmptyRollDefaultRowIndex(pitches)
  );
}

function getFirstVisibleNoteRowIndex({
  noteEvents,
  pitches,
}: {
  noteEvents: readonly NoteEvent[];
  pitches: readonly PianoRollPitch[];
}): number | null {
  let firstNote: NoteEvent | null = null;
  let firstNoteRowIndex: number | null = null;

  for (const note of noteEvents) {
    const rowIndex = pitches.findIndex(
      (pitch) => pitch.midiNote === note.midiNote,
    );

    if (rowIndex < 0) {
      continue;
    }

    if (
      !firstNote ||
      note.startTick < firstNote.startTick ||
      (note.startTick === firstNote.startTick && note.midiNote > firstNote.midiNote)
    ) {
      firstNote = note;
      firstNoteRowIndex = rowIndex;
    }
  }

  return firstNoteRowIndex;
}

function getEmptyRollDefaultRowIndex(
  pitches: readonly PianoRollPitch[],
): number | null {
  if (pitches.length === 0) {
    return null;
  }

  const defaultCenterMidiNote =
    (EMPTY_ROLL_DEFAULT_LOW_MIDI_NOTE + EMPTY_ROLL_DEFAULT_HIGH_MIDI_NOTE) / 2;
  let closestPitchIndex = 0;
  let closestDistance = Math.abs(pitches[0]!.midiNote - defaultCenterMidiNote);

  for (let pitchIndex = 1; pitchIndex < pitches.length; pitchIndex += 1) {
    const distance = Math.abs(
      pitches[pitchIndex]!.midiNote - defaultCenterMidiNote,
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestPitchIndex = pitchIndex;
    }
  }

  return closestPitchIndex;
}

function getNoteStyle({
  columnIndex,
  durationColumns,
  rowIndex,
}: NoteGeometry, columnCount: number): CSSProperties {
  return {
    height: "var(--piano-row-height)",
    left: `${(columnIndex / columnCount) * 100}%`,
    top: `calc(var(--piano-row-height) * ${rowIndex})`,
    width: `${(durationColumns / columnCount) * 100}%`,
  };
}

function getPlayheadStyle({
  clipLengthTicks,
  playheadTick,
}: {
  clipLengthTicks: Tick;
  playheadTick: Tick;
}): CSSProperties {
  if (clipLengthTicks <= 0) {
    return { left: "0%" };
  }

  const loopTick =
    ((playheadTick % clipLengthTicks) + clipLengthTicks) % clipLengthTicks;

  return {
    left: `${(loopTick / clipLengthTicks) * 100}%`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
