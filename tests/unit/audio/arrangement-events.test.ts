import { describe, expect, it } from "vitest";

import { expandClipInstancesForPlayback } from "../../../src/audio";
import {
  addNoteEvent,
  addPitchedInstrumentToClip,
  createEmptyHybridClip,
  createImportedAudioClipDraft,
  toggleDrumStep,
  type ClipInstance,
} from "../../../src/model";

describe("arrangement playback event expansion", () => {
  it("offsets hybrid clip drum and note events by clip instance start tick", () => {
    const clipWithDrum = toggleDrumStep({
      clip: createEmptyHybridClip({
        id: "clip-1",
        pitchedInstrumentIds: ["default-synth"],
      }),
      laneId: "kick",
      stepIndex: 4,
    });
    const clip = addNoteEvent({
      clip: clipWithDrum,
      durationTicks: 240,
      instrumentId: "default-synth",
      midiNote: 60,
      startTick: 960,
    });
    const instance: ClipInstance = {
      clipId: clip.id,
      id: "instance-1",
      lengthTicks: 1920,
      startTick: 480,
      trackId: "track-1",
    };

    expect(
      expandClipInstancesForPlayback({
        clipInstances: [instance],
        clips: [clip],
      }),
    ).toEqual({
      missingClipIds: [],
      noteEvents: [
        {
          durationTicks: 240,
          gain: 0.8,
          id: "instance-1:clip-1:note:default-synth:60:960",
          instrumentId: "default-synth",
          midiNote: 60,
          startTick: 1440,
          trackId: "track-1",
        },
      ],
      sampleEvents: [
        {
          gain: 1,
          id: "instance-1:clip-1:drum:kick:480",
          sampleId: "fred-kick-1",
          startTick: 960,
          trackId: "track-1",
        },
      ],
    });
  });

  it("schedules imported audio clips at their arrangement start tick", () => {
    const { clip, sampleMeta } = createImportedAudioClipDraft({
      clipId: "audio-clip-loop",
      durationSeconds: 2,
      fileName: "Loop.wav",
      mimeType: "audio/wav",
      sampleId: "imported-audio-loop",
      sourceBpm: 96,
    });
    const instance: ClipInstance = {
      clipId: clip.id,
      id: "audio-instance-1",
      lengthTicks: 1920,
      sourceOffsetSeconds: 0.25,
      startTick: 960,
      trackId: "track-2",
    };

    expect(
      expandClipInstancesForPlayback({
        clipInstances: [instance],
        clips: [clip],
        projectBpm: 120,
        sampleMetas: [sampleMeta],
      }).sampleEvents,
    ).toEqual([
      {
        durationTicks: 1920,
        id: "audio-instance-1:audio",
        playbackDurationSeconds: 2,
        sampleId: "imported-audio-loop",
        scheduleWhenOverlappingStart: true,
        sourceOffsetSeconds: 0.25,
        sourceBpm: 96,
        startTick: 960,
        stretchRate: 1.25,
        trackId: "track-2",
      },
    ]);
  });

  it("reports missing source clips without throwing", () => {
    expect(
      expandClipInstancesForPlayback({
        clipInstances: [
          {
            clipId: "missing-clip",
            id: "instance-1",
            lengthTicks: 1920,
            startTick: 0,
            trackId: "track-1",
          },
        ],
        clips: [],
      }),
    ).toEqual({
      missingClipIds: ["missing-clip"],
      noteEvents: [],
      sampleEvents: [],
    });
  });

  it("does not expand hybrid events outside the clip instance length", () => {
    const clip = addNoteEvent({
      clip: addPitchedInstrumentToClip({
        clip: createEmptyHybridClip({ id: "clip-1" }),
        instrumentId: "default-synth",
      }),
      durationTicks: 120,
      instrumentId: "default-synth",
      midiNote: 60,
      startTick: 960,
    });

    expect(
      expandClipInstancesForPlayback({
        clipInstances: [
          {
            clipId: clip.id,
            id: "instance-1",
            lengthTicks: 480,
            startTick: 0,
            trackId: "track-1",
          },
        ],
        clips: [clip],
      }).noteEvents,
    ).toEqual([]);
  });
});
