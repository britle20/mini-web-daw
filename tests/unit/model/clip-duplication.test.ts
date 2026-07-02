import { describe, expect, it } from "vitest";

import {
  addNoteEvent,
  addPitchedInstrumentToClip,
  createDuplicatedClipId,
  createDuplicatedClipName,
  createEmptyHybridClip,
  createImportedAudioClipDraft,
  duplicateClip,
  moveDrumLane,
  toggleDrumStep,
  updateDrumStepSubdivision,
  updateHybridClipLength,
} from "../../../src/model";

describe("clip duplication", () => {
  it("creates readable copy IDs and names with collision suffixes", () => {
    expect(
      createDuplicatedClipId({
        existingClipIds: ["clip-1", "clip-1-copy"],
        sourceClipId: "clip-1",
      }),
    ).toBe("clip-1-copy-2");
    expect(
      createDuplicatedClipId({
        existingClipIds: ["clip-1", "clip-1-copy"],
        sourceClipId: "clip-1-copy",
      }),
    ).toBe("clip-1-copy-2");
    expect(
      createDuplicatedClipName({
        existingClipNames: ["Clip 1", "clip 1 copy"],
        sourceClipName: "Clip 1",
      }),
    ).toBe("Clip 1 Copy 2");
  });

  it("deep-copies hybrid clip musical content with new event IDs", () => {
    const sourceClip = addNoteEvent({
      clip: toggleDrumStep({
        clip: moveDrumLane({
          clip: updateDrumStepSubdivision({
            clip: updateHybridClipLength({
              clip: addPitchedInstrumentToClip({
                clip: createEmptyHybridClip({
                  id: "clip-1",
                  name: "Clip 1",
                  pitchedInstrumentIds: ["default-synth"],
                }),
                instrumentId: "iowa-piano",
              }),
              lengthTicks: 3840,
            }),
            subdivision: 2,
          }),
          laneId: "openHat",
          targetIndex: 1,
        }),
        laneId: "kick",
        stepIndex: 2,
      }),
      durationTicks: 240,
      instrumentId: "iowa-piano",
      midiNote: 64,
      startTick: 120,
    });
    const duplicatedClip = duplicateClip({
      clip: sourceClip,
      existingClipIds: ["clip-1"],
      existingClipNames: ["Clip 1"],
    });

    expect(duplicatedClip).toMatchObject({
      drumStepSubdivision: 2,
      id: "clip-1-copy",
      kind: "hybrid",
      lengthTicks: 3840,
      name: "Clip 1 Copy",
      pitchedInstrumentIds: ["default-synth", "iowa-piano"],
    });

    if (duplicatedClip.kind !== "hybrid") {
      throw new Error("Expected duplicated hybrid clip.");
    }

    expect(duplicatedClip.drumLanes).toEqual(sourceClip.drumLanes);
    expect(duplicatedClip.drumLanes).not.toBe(sourceClip.drumLanes);
    expect(duplicatedClip.drumEvents).toEqual([
      {
        ...sourceClip.drumEvents[0],
        id: "clip-1-copy:drum:kick:240",
      },
    ]);
    expect(duplicatedClip.drumEvents[0]).not.toBe(sourceClip.drumEvents[0]);
    expect(duplicatedClip.noteEvents).toEqual([
      {
        ...sourceClip.noteEvents[0],
        id: "clip-1-copy:note:iowa-piano:64:120",
      },
    ]);
    expect(duplicatedClip.noteEvents[0]).not.toBe(sourceClip.noteEvents[0]);
  });

  it("duplicates audio clips without duplicating imported sample references", () => {
    const { clip } = createImportedAudioClipDraft({
      clipId: "audio-clip-loop",
      durationSeconds: 2.5,
      fileName: "Loop.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-loop",
    });
    const duplicatedClip = duplicateClip({
      clip,
      existingClipIds: ["audio-clip-loop"],
      existingClipNames: ["Loop"],
    });

    expect(duplicatedClip).toEqual({
      ...clip,
      id: "audio-clip-loop-copy",
      name: "Loop Copy",
      sampleId: "imported-audio-loop",
    });
  });
});
