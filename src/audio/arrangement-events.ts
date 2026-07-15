import {
  getImportedAudioStretchRate,
  isAudioClip,
  isHybridClip,
  type Clip,
  type ClipInstance,
  type SampleMeta,
} from "../model";
import { ticksToSeconds } from "../utils";
import type { NoteLoopEvent, SampleLoopEvent } from "./types";

export interface ArrangementPlaybackEvents {
  missingClipIds: string[];
  noteEvents: NoteLoopEvent[];
  sampleEvents: SampleLoopEvent[];
}

export function expandClipInstancesForPlayback({
  clipInstances,
  clips,
  projectBpm,
  sampleMetas = [],
}: {
  clipInstances: readonly ClipInstance[];
  clips: readonly Clip[];
  projectBpm?: number;
  sampleMetas?: readonly SampleMeta[];
}): ArrangementPlaybackEvents {
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const sampleMetasById = new Map(
    sampleMetas.map((sampleMeta) => [sampleMeta.id, sampleMeta]),
  );
  const missingClipIds: string[] = [];
  const noteEvents: NoteLoopEvent[] = [];
  const sampleEvents: SampleLoopEvent[] = [];

  for (const instance of clipInstances) {
    const clip = clipsById.get(instance.clipId);

    if (!clip) {
      missingClipIds.push(instance.clipId);
      continue;
    }

    if (isAudioClip(clip)) {
      if (instance.lengthTicks > 0) {
        const sourceBpm = sampleMetasById.get(clip.sampleId)?.source.sourceBpm;
        const sampleEvent: SampleLoopEvent = {
          durationTicks: instance.lengthTicks,
          id: `${instance.id}:audio`,
          sampleId: clip.sampleId,
          scheduleWhenOverlappingStart: true,
          startTick: instance.startTick,
          trackId: instance.trackId,
        };

        if (typeof instance.sourceOffsetSeconds === "number") {
          sampleEvent.sourceOffsetSeconds = instance.sourceOffsetSeconds;
        }

        if (typeof sourceBpm === "number") {
          sampleEvent.sourceBpm = sourceBpm;
        }

        if (typeof sourceBpm === "number" && typeof projectBpm === "number") {
          sampleEvent.playbackDurationSeconds = ticksToSeconds(
            instance.lengthTicks,
            { tempoBpm: projectBpm },
          );
          sampleEvent.stretchRate = getImportedAudioStretchRate({
            projectBpm,
            sourceBpm,
          });
        }

        sampleEvents.push(sampleEvent);
      }

      continue;
    }

    if (!isHybridClip(clip)) {
      continue;
    }

    for (const event of clip.drumEvents) {
      if (event.startTick >= instance.lengthTicks) {
        continue;
      }

      sampleEvents.push({
        gain: event.velocity,
        id: `${instance.id}:${event.id}`,
        sampleId: event.sampleId,
        startTick: instance.startTick + event.startTick,
        trackId: instance.trackId,
      });
    }

    for (const event of clip.noteEvents) {
      if (event.startTick >= instance.lengthTicks) {
        continue;
      }

      noteEvents.push({
        durationTicks: event.durationTicks,
        gain: event.velocity,
        id: `${instance.id}:${event.id}`,
        instrumentId: event.instrumentId,
        midiNote: event.midiNote,
        startTick: instance.startTick + event.startTick,
        trackId: instance.trackId,
      });
    }
  }

  return {
    missingClipIds,
    noteEvents,
    sampleEvents,
  };
}
