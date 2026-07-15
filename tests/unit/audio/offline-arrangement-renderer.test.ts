import { describe, expect, it } from "vitest";

import {
  getMissingImportedAudioSourceBpmClipNamesForExport,
  resolveOfflineSampleRenderPlan,
} from "../../../src/audio/offline-arrangement-renderer";
import {
  createEmptyHybridClip,
  createImportedAudioClipDraft,
  type ClipInstance,
} from "../../../src/model";
import { TICKS_PER_4_4_BAR } from "../../../src/utils";

describe("offline arrangement renderer helpers", () => {
  it("finds arranged imported audio clips without source BPM metadata", () => {
    const importedWithBpm = createImportedAudioClipDraft({
      clipId: "audio-clip-with-bpm",
      durationSeconds: 2,
      fileName: "Loop With BPM.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-with-bpm",
      sourceBpm: 120,
    });
    const importedWithoutBpm = createImportedAudioClipDraft({
      clipId: "audio-clip-without-bpm",
      durationSeconds: 2,
      fileName: "Loop Without BPM.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-without-bpm",
    });
    const instances: ClipInstance[] = [
      {
        clipId: importedWithBpm.clip.id,
        id: "instance-1",
        lengthTicks: TICKS_PER_4_4_BAR,
        startTick: 0,
        trackId: "track-1",
      },
      {
        clipId: importedWithoutBpm.clip.id,
        id: "instance-2",
        lengthTicks: TICKS_PER_4_4_BAR,
        startTick: TICKS_PER_4_4_BAR,
        trackId: "track-1",
      },
      {
        clipId: importedWithoutBpm.clip.id,
        id: "instance-3",
        lengthTicks: TICKS_PER_4_4_BAR,
        startTick: TICKS_PER_4_4_BAR * 2,
        trackId: "track-1",
      },
      {
        clipId: "hybrid-clip",
        id: "instance-4",
        lengthTicks: TICKS_PER_4_4_BAR,
        startTick: TICKS_PER_4_4_BAR * 3,
        trackId: "track-1",
      },
    ];

    expect(
      getMissingImportedAudioSourceBpmClipNamesForExport({
        clipInstances: instances,
        clips: [
          importedWithBpm.clip,
          importedWithoutBpm.clip,
          createEmptyHybridClip({ id: "hybrid-clip" }),
        ],
        sampleMetas: [
          importedWithBpm.sampleMeta,
          importedWithoutBpm.sampleMeta,
        ],
      }),
    ).toEqual(["Loop Without BPM"]);
  });

  it("maps imported audio source offsets into pre-rendered stretched buffers", () => {
    expect(
      resolveOfflineSampleRenderPlan({
        arrangementLengthTicks: TICKS_PER_4_4_BAR * 4,
        event: {
          durationTicks: TICKS_PER_4_4_BAR,
          id: "audio-event",
          playbackDurationSeconds: 2,
          sampleId: "imported-audio-loop",
          sourceOffsetSeconds: 0.5,
          startTick: TICKS_PER_4_4_BAR,
          stretchRate: 1.25,
        },
        renderedBufferDurationSeconds: 3.2,
        sourceBufferDurationSeconds: 4,
        tempoBpm: 120,
      }),
    ).toEqual({
      durationSeconds: 2,
      renderedOffsetSeconds: 0.4,
      sourceOffsetSeconds: 0.5,
      stretchRate: 1.25,
    });
  });

  it("clamps sample render duration to the arrangement end", () => {
    expect(
      resolveOfflineSampleRenderPlan({
        arrangementLengthTicks: TICKS_PER_4_4_BAR * 2,
        event: {
          durationTicks: TICKS_PER_4_4_BAR,
          id: "audio-event",
          playbackDurationSeconds: 2,
          sampleId: "imported-audio-loop",
          startTick: TICKS_PER_4_4_BAR + TICKS_PER_4_4_BAR / 2,
          stretchRate: 1,
        },
        renderedBufferDurationSeconds: 4,
        sourceBufferDurationSeconds: 4,
        tempoBpm: 120,
      })?.durationSeconds,
    ).toBeCloseTo(1);
  });

  it("skips sample events whose source offset is outside the source buffer", () => {
    expect(
      resolveOfflineSampleRenderPlan({
        arrangementLengthTicks: TICKS_PER_4_4_BAR,
        event: {
          id: "audio-event",
          sampleId: "imported-audio-loop",
          sourceOffsetSeconds: 4,
          startTick: 0,
        },
        renderedBufferDurationSeconds: 4,
        sourceBufferDurationSeconds: 4,
        tempoBpm: 120,
      }),
    ).toBeNull();
  });
});
