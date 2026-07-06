import { describe, expect, it } from "vitest";

import {
  createEmptyHybridClip,
  createImportedAudioClipDraft,
  createImportedAudioDisplayName,
  createImportedAudioIds,
  getImportedAudioStretchRate,
  getClipDeleteConfirmationMessage,
  toggleDrumStep,
  validateImportedAudioSourceBpm,
  validateImportedWavFile,
} from "../../../src/model";

describe("audio clip model", () => {
  it("creates readable display names from imported file names", () => {
    expect(createImportedAudioDisplayName("Vocal_Stem_01.wav")).toBe(
      "Vocal Stem 01",
    );
    expect(createImportedAudioDisplayName("kick-loop.WAV")).toBe("kick loop");
  });

  it("validates WAV-like imported files", () => {
    expect(() =>
      validateImportedWavFile({
        name: "loop.wav",
        size: 128,
        type: "audio/wav",
      }),
    ).not.toThrow();
    expect(() =>
      validateImportedWavFile({
        name: "loop.mp3",
        size: 128,
        type: "audio/mpeg",
      }),
    ).toThrow("Only WAV files can be imported.");
    expect(() =>
      validateImportedWavFile({
        name: "empty.wav",
        size: 0,
        type: "audio/wav",
      }),
    ).toThrow("The selected WAV file is empty.");
  });

  it("creates stable unique IDs for imported audio clips and samples", () => {
    expect(
      createImportedAudioIds({
        existingClipIds: ["audio-clip-vocal-stem"],
        existingSampleIds: ["imported-audio-vocal-stem"],
        fileName: "Vocal_Stem.wav",
      }),
    ).toEqual({
      clipId: "audio-clip-vocal-stem-2",
      sampleId: "imported-audio-vocal-stem-2",
    });
  });

  it("creates serializable audio clip and sample metadata", () => {
    const draft = createImportedAudioClipDraft({
      clipId: "audio-clip-loop",
      durationSeconds: 2.5,
      fileName: "Loop.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-loop",
    });

    expect(draft.clip).toEqual({
      durationSeconds: 2.5,
      id: "audio-clip-loop",
      kind: "audio",
      mimeType: "audio/wav",
      name: "Loop",
      sampleId: "imported-audio-loop",
      sourceFileName: "Loop.wav",
    });
    expect(draft.sampleMeta).toEqual({
      durationSeconds: 2.5,
      id: "imported-audio-loop",
      name: "Loop",
      source: {
        fileName: "Loop.wav",
        kind: "imported",
        mimeType: "audio/wav",
      },
    });
  });

  it("stores optional imported audio source BPM metadata", () => {
    const draft = createImportedAudioClipDraft({
      clipId: "audio-clip-loop",
      durationSeconds: 2.5,
      fileName: "Loop.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-loop",
      sourceBpm: 96.5,
    });

    expect(draft.sampleMeta.source.sourceBpm).toBe(96.5);
  });

  it("validates imported audio source BPM and derives stretch rate", () => {
    expect(() => validateImportedAudioSourceBpm(40)).not.toThrow();
    expect(() => validateImportedAudioSourceBpm(250)).not.toThrow();
    expect(() => validateImportedAudioSourceBpm(39.99)).toThrow(
      "Source BPM must be between 40 and 250.",
    );
    expect(() => validateImportedAudioSourceBpm(250.01)).toThrow(
      "Source BPM must be between 40 and 250.",
    );
    expect(
      getImportedAudioStretchRate({
        projectBpm: 150,
        sourceBpm: 120,
      }),
    ).toBeCloseTo(1.25);
  });

  it("does not require confirmation for empty unused hybrid clips", () => {
    expect(
      getClipDeleteConfirmationMessage({
        clip: createEmptyHybridClip({ id: "clip-1", name: "Clip 1" }),
      }),
    ).toBeNull();
  });

  it("requires confirmation for hybrid clips with musical events", () => {
    const clip = toggleDrumStep({
      clip: createEmptyHybridClip({ id: "clip-1", name: "Clip 1" }),
      laneId: "kick",
      stepIndex: 0,
    });

    expect(getClipDeleteConfirmationMessage({ clip })).toBe(
      "Delete Clip 1 and its musical events?",
    );
  });

  it("requires confirmation for hybrid clips used in the arrangement", () => {
    expect(
      getClipDeleteConfirmationMessage({
        arrangementInstanceCount: 2,
        clip: createEmptyHybridClip({ id: "clip-1", name: "Clip 1" }),
      }),
    ).toBe("Delete Clip 1? 2 arrangement placements will also be removed.");
  });

  it("includes arrangement removal in imported audio clip confirmation", () => {
    const { clip } = createImportedAudioClipDraft({
      clipId: "audio-clip-loop",
      durationSeconds: 2.5,
      fileName: "Loop.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-loop",
    });

    expect(
      getClipDeleteConfirmationMessage({
        arrangementInstanceCount: 1,
        clip,
      }),
    ).toBe(
      "Delete imported audio clip Loop? 1 arrangement placement will also be removed.",
    );
  });
});
