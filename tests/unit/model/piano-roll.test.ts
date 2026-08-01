import { describe, expect, it } from "vitest";

import {
  IOWA_PIANO_SAMPLE_PITCHES,
  PIANO_ROLL_COLUMN_COUNT,
  PIANO_ROLL_PITCHES,
  TICKS_PER_PIANO_ROLL_COLUMN,
  addNoteEvent,
  createEmptyHybridClip,
  deleteNoteEvent,
  getHybridClipLengthTicks,
  getPianoRollColumnCount,
  getPianoRollColumnStartTick,
  getPianoRollPitchByMidiNote,
  moveNoteEvent,
  resizeNoteEvent,
} from "../../../src/model";

describe("piano roll model", () => {
  it("defines a 32-column one-bar grid", () => {
    expect(PIANO_ROLL_COLUMN_COUNT).toBe(32);
    expect(TICKS_PER_PIANO_ROLL_COLUMN).toBe(60);
    expect(getPianoRollColumnStartTick(0)).toBe(0);
    expect(getPianoRollColumnStartTick(8)).toBe(480);
    expect(getPianoRollColumnStartTick(31)).toBe(1860);
  });

  it("derives piano roll columns from clip length", () => {
    expect(getPianoRollColumnCount(getHybridClipLengthTicks(1))).toBe(32);
    expect(getPianoRollColumnCount(getHybridClipLengthTicks(2))).toBe(64);
    expect(getPianoRollColumnCount(getHybridClipLengthTicks(4))).toBe(128);
    expect(getPianoRollColumnStartTick(63, getHybridClipLengthTicks(2))).toBe(
      3780,
    );
  });

  it("defines the synth piano roll pitch range from C1 through C7", () => {
    expect(PIANO_ROLL_PITCHES).toHaveLength(73);
    expect(PIANO_ROLL_PITCHES[0]).toMatchObject({
      label: "C7",
      midiNote: 96,
    });
    expect(PIANO_ROLL_PITCHES.at(-1)).toMatchObject({
      label: "C1",
      midiNote: 24,
    });
    expect(getPianoRollPitchByMidiNote(36)).toMatchObject({
      label: "C2",
      midiNote: 36,
    });
  });

  it("defines Iowa Piano sample pitches from C4 through C5", () => {
    expect(IOWA_PIANO_SAMPLE_PITCHES).toHaveLength(13);
    expect(IOWA_PIANO_SAMPLE_PITCHES[0]).toMatchObject({
      label: "C5",
      midiNote: 72,
      sampleId: "iowa-piano-c5",
    });
    expect(IOWA_PIANO_SAMPLE_PITCHES.at(-1)).toMatchObject({
      label: "C4",
      midiNote: 60,
      sampleId: "iowa-piano-c4",
    });
    expect(
      getPianoRollPitchByMidiNote(61, IOWA_PIANO_SAMPLE_PITCHES),
    ).toMatchObject({
      label: "Db4",
      sampleId: "iowa-piano-db4",
    });
  });

  it("adds a serializable note event", () => {
    const clip = addNoteEvent({
      clip: createEmptyHybridClip(),
      durationTicks: 240,
      midiNote: 60,
      startTick: 120,
    });

    expect(clip.noteEvents).toEqual([
      {
        durationTicks: 240,
        id: "clip-1:note:default-synth:60:120",
        instrumentId: "default-synth",
        midiNote: 60,
        startTick: 120,
        velocity: 0.8,
      },
    ]);
  });

  it("replaces an existing note at the same pitch and tick", () => {
    const clip = addNoteEvent({
      clip: createEmptyHybridClip(),
      durationTicks: 60,
      midiNote: 64,
      startTick: 240,
    });
    const replacedClip = addNoteEvent({
      clip,
      durationTicks: 180,
      midiNote: 64,
      startTick: 240,
      velocity: 0.5,
    });

    expect(replacedClip.noteEvents).toHaveLength(1);
    expect(replacedClip.noteEvents[0]).toMatchObject({
      durationTicks: 180,
      id: "clip-1:note:default-synth:64:240",
      velocity: 0.5,
    });
  });

  it("allows different pitched instruments at the same pitch and tick", () => {
    const synthClip = addNoteEvent({
      clip: createEmptyHybridClip(),
      durationTicks: 120,
      instrumentId: "default-synth",
      midiNote: 60,
      startTick: 0,
    });
    const pianoClip = addNoteEvent({
      clip: synthClip,
      durationTicks: 120,
      instrumentId: "iowa-piano",
      midiNote: 60,
      startTick: 0,
    });

    expect(pianoClip.noteEvents).toHaveLength(2);
    expect(pianoClip.noteEvents.map((event) => event.instrumentId)).toEqual([
      "default-synth",
      "iowa-piano",
    ]);
  });

  it("moves a note while preserving its duration and ID", () => {
    const clip = addNoteEvent({
      clip: createEmptyHybridClip(),
      durationTicks: 120,
      midiNote: 60,
      startTick: 0,
    });
    const movedClip = moveNoteEvent({
      clip,
      midiNote: 72,
      noteId: "clip-1:note:default-synth:60:0",
      startTick: 1800,
    });

    expect(movedClip.noteEvents).toEqual([
      {
        durationTicks: 120,
        id: "clip-1:note:default-synth:60:0",
        instrumentId: "default-synth",
        midiNote: 72,
        startTick: 1800,
        velocity: 0.8,
      },
    ]);
  });

  it("resizes and deletes notes", () => {
    const clip = addNoteEvent({
      clip: createEmptyHybridClip(),
      durationTicks: 120,
      midiNote: 67,
      startTick: 600,
    });
    const resizedClip = resizeNoteEvent({
      clip,
      durationTicks: 360,
      noteId: "clip-1:note:default-synth:67:600",
    });
    const deletedClip = deleteNoteEvent({
      clip: resizedClip,
      noteId: "clip-1:note:default-synth:67:600",
    });

    expect(resizedClip.noteEvents[0]?.durationTicks).toBe(360);
    expect(deletedClip.noteEvents).toEqual([]);
  });

  it("clamps notes to the clip length", () => {
    const clip = addNoteEvent({
      clip: createEmptyHybridClip(),
      durationTicks: 240,
      midiNote: 60,
      startTick: 1860,
    });

    expect(clip.noteEvents[0]).toMatchObject({
      durationTicks: 60,
      startTick: 1860,
    });
  });

  it("allows notes in later bars of a longer clip", () => {
    const clip = addNoteEvent({
      clip: createEmptyHybridClip({
        lengthTicks: getHybridClipLengthTicks(4),
      }),
      durationTicks: 240,
      midiNote: 60,
      startTick: 5760,
    });

    expect(clip.noteEvents[0]).toMatchObject({
      durationTicks: 240,
      startTick: 5760,
    });
  });
});
