import { describe, expect, it } from "vitest";

import {
  ARRANGEMENT_SNAP_TICKS,
  DEFAULT_ARRANGEMENT_LENGTH_BARS,
  MAX_ARRANGEMENT_LENGTH_BARS,
  MIN_ARRANGEMENT_LENGTH_BARS,
  createClipInstance,
  createDefaultArrangementLoopRange,
  createDefaultArrangementTracks,
  createEmptyHybridClip,
  createImportedAudioClipDraft,
  deleteClipInstance,
  getHybridClipLengthTicks,
  getArrangementLengthTicks,
  getArrangementLoopBoundaryIndex,
  getArrangementLoopBoundaryIndexForLength,
  getArrangementPlaybackEndTick,
  getClipInstancesOutsideArrangementLength,
  moveClipInstance,
  normalizeArrangementLengthBars,
  normalizeArrangementLoopRange,
  removeClipInstancesOutsideArrangementLength,
  snapArrangementTick,
} from "../../../src/model";

describe("arrangement model", () => {
  it("creates default serializable arrangement tracks", () => {
    expect(createDefaultArrangementTracks(3)).toEqual([
      { id: "track-1", name: "Track 1" },
      { id: "track-2", name: "Track 2" },
      { id: "track-3", name: "Track 3" },
    ]);
  });

  it("snaps arrangement ticks to the beat grid", () => {
    expect(ARRANGEMENT_SNAP_TICKS).toBe(480);
    expect(snapArrangementTick(0)).toBe(0);
    expect(snapArrangementTick(241)).toBe(480);
    expect(snapArrangementTick(-120)).toBe(0);
  });

  it("normalizes serializable arrangement length in bars", () => {
    expect(DEFAULT_ARRANGEMENT_LENGTH_BARS).toBe(16);
    expect(MIN_ARRANGEMENT_LENGTH_BARS).toBe(1);
    expect(MAX_ARRANGEMENT_LENGTH_BARS).toBe(128);
    expect(normalizeArrangementLengthBars(0)).toBe(1);
    expect(normalizeArrangementLengthBars(12.4)).toBe(12);
    expect(normalizeArrangementLengthBars(200)).toBe(128);
    expect(getArrangementLengthTicks(12)).toBe(23040);
  });

  it("normalizes arrangement loop ranges to bar boundaries", () => {
    expect(createDefaultArrangementLoopRange()).toEqual({
      endTick: 30720,
      startTick: 0,
    });
    expect(
      normalizeArrangementLoopRange({
        endTick: 7700,
        startTick: 1800,
      }),
    ).toEqual({
      endTick: 7680,
      startTick: 1920,
    });
    expect(
      normalizeArrangementLoopRange({
        endTick: 1920,
        startTick: 30720,
      }),
    ).toEqual({
      endTick: 30720,
      startTick: 28800,
    });
    expect(getArrangementLoopBoundaryIndex(3840)).toBe(2);
  });

  it("normalizes arrangement loop ranges within dynamic arrangement length", () => {
    expect(createDefaultArrangementLoopRange(8)).toEqual({
      endTick: 15360,
      startTick: 0,
    });
    expect(
      normalizeArrangementLoopRange(
        {
          endTick: 30720,
          startTick: 14400,
        },
        8,
      ),
    ).toEqual({
      endTick: 15360,
      startTick: 13440,
    });
    expect(getArrangementLoopBoundaryIndexForLength(30720, 8)).toBe(8);
  });

  it("creates clip instances using hybrid clip length", () => {
    const clip = createEmptyHybridClip({
      id: "clip-1",
      lengthTicks: getHybridClipLengthTicks(2),
    });
    const instance = createClipInstance({
      clip,
      existingInstanceIds: [],
      startTick: 510,
      tempoBpm: 120,
      trackId: "track-2",
    });

    expect(instance).toEqual({
      clipId: "clip-1",
      id: "clip-instance-clip-1-track-2-480",
      lengthTicks: 3840,
      startTick: 480,
      trackId: "track-2",
    });
  });

  it("creates audio clip instances with beat-rounded tick length", () => {
    const { clip } = createImportedAudioClipDraft({
      clipId: "audio-clip-loop",
      durationSeconds: 1.2,
      fileName: "Loop.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-loop",
    });
    const instance = createClipInstance({
      clip,
      existingInstanceIds: [],
      startTick: 0,
      tempoBpm: 120,
      trackId: "track-1",
    });

    expect(instance.lengthTicks).toBe(1440);
  });

  it("uses source BPM for imported audio clip instance length when available", () => {
    const { clip } = createImportedAudioClipDraft({
      clipId: "audio-clip-loop",
      durationSeconds: 2,
      fileName: "Loop.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-loop",
      sourceBpm: 120,
    });
    const instance = createClipInstance({
      clip,
      existingInstanceIds: [],
      sourceBpm: 120,
      startTick: 0,
      tempoBpm: 180,
      trackId: "track-1",
    });

    expect(instance.lengthTicks).toBe(1920);
  });

  it("moves and deletes clip instances without mutating source clips", () => {
    const clip = createEmptyHybridClip({ id: "clip-1" });
    const instance = createClipInstance({
      clip,
      existingInstanceIds: [],
      startTick: 0,
      tempoBpm: 120,
      trackId: "track-1",
    });
    const moved = moveClipInstance({
      instance,
      startTick: 950,
      trackId: "track-3",
    });

    expect(moved).toMatchObject({
      clipId: "clip-1",
      startTick: 960,
      trackId: "track-3",
    });
    expect(
      deleteClipInstance(
        [
          instance,
          {
            ...moved,
            id: "clip-instance-clip-1-track-3-960",
          },
        ],
        "clip-instance-clip-1-track-3-960",
      ),
    ).toEqual([instance]);
  });

  it("uses the visible arrangement length as the minimum playback end", () => {
    const clip = createEmptyHybridClip({ id: "clip-1" });
    const instance = createClipInstance({
      clip,
      existingInstanceIds: [],
      startTick: 40000,
      tempoBpm: 120,
      trackId: "track-1",
    });

    expect(getArrangementPlaybackEndTick([])).toBe(30720);
    expect(getArrangementPlaybackEndTick([instance])).toBe(41760);
  });

  it("finds and removes clip instances outside a shortened arrangement", () => {
    const insideInstance = createClipInstance({
      clip: createEmptyHybridClip({ id: "clip-1" }),
      existingInstanceIds: [],
      startTick: 0,
      tempoBpm: 120,
      trackId: "track-1",
    });
    const outsideInstance = createClipInstance({
      clip: createEmptyHybridClip({
        id: "clip-2",
        lengthTicks: getHybridClipLengthTicks(2),
      }),
      existingInstanceIds: [insideInstance.id],
      startTick: 3360,
      tempoBpm: 120,
      trackId: "track-1",
    });
    const instances = [insideInstance, outsideInstance];

    expect(
      getClipInstancesOutsideArrangementLength({
        instances,
        lengthBars: 2,
      }).map((instance) => instance.id),
    ).toEqual([outsideInstance.id]);
    expect(
      removeClipInstancesOutsideArrangementLength({
        instances,
        lengthBars: 2,
      }),
    ).toEqual([insideInstance]);
  });
});
