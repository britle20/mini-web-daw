# Feature: 27 BPM-Aware Imported Audio Playback

Related issue: #7

## Status
Implemented

## Goal

Make imported WAV audio clips follow the project BPM during live playback while preserving pitch.

## Context

Imported WAV clips currently play at original speed. That is acceptable for one-shots, but loop material should stay in time with the project tempo.

A local `signalsmith-stretch` spike confirmed that pitch-preserving stretch can work in the browser for manual WAV playback. The production feature should integrate that behavior into imported audio clip metadata and `SONG` arrangement playback.

## Scope

Included:

- Require the user to enter source BPM when importing a WAV audio clip.
- Store source BPM as serializable imported sample metadata.
- Allow existing imported audio clips without source BPM metadata to show a clear missing-BPM state or edit path.
- During live imported audio playback, calculate stretch rate as `projectBpm / sourceBpm`.
- Preserve pitch while changing playback speed.
- Apply BPM-aware stretch to imported audio clips during `SONG` arrangement playback.
- Keep BPM changes from affecting already-playing imported audio; the new BPM applies from the next playback start.
- Add startup safeguards for the stretch worklet, such as a conservative schedule lead time or retry behavior.
- Keep decoded buffers, stretch nodes, AudioWorklet nodes, and other runtime audio objects outside project JSON.
- Add focused tests for source BPM validation, stretch-rate calculation, metadata handling, and scheduler planning where practical.
- Update relevant data model, audio engine, import, persistence, and testing docs.

Excluded:

- Automatic BPM detection.
- Beat warping, transient markers, slicing, or manual warp grids.
- Live stretch-ratio changes while playback is already running.
- Offline arrangement WAV export stretch support.
- Non-WAV import formats.
- Pitch shifting as a user-facing control.
- Clip instance resize handles or destructive source audio edits.

## Constraints

- React UI must not own exact audio timing.
- Musical placement and arrangement duration must remain tick-based.
- Source BPM is required for newly imported WAV clips.
- Project state must remain serializable.
- Do not store `AudioBuffer`, `AudioNode`, `AudioWorkletNode`, `File`, `Blob`, object URLs, or decoded PCM data in project JSON.
- If `signalsmith-stretch` becomes a production dependency, document why it is needed and keep the integration isolated behind the audio engine API.
- Imported audio should fail visibly when required source BPM metadata or sample data is missing.

## Data Model Notes

Prefer storing source BPM on imported sample metadata because it describes the source media, not an arrangement placement.

Illustrative shape:

```ts
export interface ImportedSampleSource {
  kind: "imported";
  fileName: string;
  mimeType?: string;
  byteLength?: number;
  contentHashSha256?: string;
  sourceBpm?: number;
}
```

New imports should require `sourceBpm`. The field remains optional in the type so older projects and JSON imports without source BPM can be represented and repaired.

## Audio Notes

The runtime audio path should derive stretch rate at playback start:

```text
stretchRate = projectBpm / sourceBpm
```

Examples:

- Source 120 BPM, project 120 BPM -> `1.0x`.
- Source 120 BPM, project 150 BPM -> `1.25x`.
- Source 120 BPM, project 90 BPM -> `0.75x`.

The first implementation should not update the stretch ratio for already-playing imported audio when the user moves the BPM slider. Stop and start playback again to use the new project BPM.

The local spike found that the stretch node can occasionally fail to start if scheduled too tightly. The production implementation should use a conservative schedule lead time, retry behavior, or another explicit startup guard.

## Implementation notes

- Source BPM is stored on `SampleMeta.source.sourceBpm`.
- Imported audio arrangement events carry runtime-only `sourceBpm`, `stretchRate`, and `playbackDurationSeconds` values derived from project BPM at playback/event-build time.
- Live `SONG` playback uses `projectBpm / sourceBpm` to tempo-sync imported audio clips.
- The target live arrangement path uses `signalsmith-stretch` with `semitones = 0` so imported clips remain pitch-preserving while following project BPM.
- `AudioBufferSourceNode.playbackRate` remains available as an emergency fallback, but it is not pitch-preserving.
- `signalsmith-stretch` remains isolated behind `BrowserAudioEngine`; React components do not call the stretch library directly.
- Offline arrangement WAV export stretch remains deferred to issue #6.

## Done when

- Importing a WAV requires source BPM input before creating the audio clip.
- Imported audio metadata stores source BPM in serializable project data.
- Existing imported clips without source BPM have a clear missing-BPM or edit path.
- `SONG` playback stretches imported audio clips according to `projectBpm / sourceBpm`.
- Pitch remains recognizably preserved when project BPM differs from source BPM.
- Changing project BPM while stopped affects the next playback start.
- Changing project BPM while playback is already running does not attempt unstable mid-playback rescheduling.
- Missing source BPM or missing sample bytes produce clear UI/audio-engine errors instead of silent failure.
- Relevant tests and docs are updated.

## Verification

Run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

Manual check:

- Import a WAV loop and enter its source BPM.
- Place the imported audio clip in the arrangement.
- Set project BPM equal to the source BPM and confirm playback sounds unchanged.
- Set project BPM higher than the source BPM and confirm the loop plays faster without obvious pitch increase.
- Set project BPM lower than the source BPM and confirm the loop plays slower without obvious pitch decrease.
- Start playback, change BPM, stop, and play again; confirm the new BPM applies on the next playback.
- Refresh the browser and confirm persisted imported audio metadata still includes source BPM.
- Try an imported audio clip with missing source BPM metadata and confirm the app reports the missing requirement clearly.

## PR notes

- Reference issue #7.
- Explain where source BPM is stored.
- Explain the stretch-rate calculation.
- Explain why BPM changes affect imported audio from the next playback start only.
- Mention that offline WAV export stretch support is deferred to issue #6.
