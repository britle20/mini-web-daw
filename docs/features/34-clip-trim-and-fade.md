# Feature: 34 Clip Trim and Fade

Related issue: #23

## Status

Planned

## Goal

Add non-destructive trim and fade editing for clips placed on the arrangement timeline.

Users should be able to shorten a placed clip, shift the audible start point of an imported audio clip, and add simple fade-in/fade-out shaping without modifying the reusable source clip or imported WAV bytes.

## Context

The arrangement view can place, move, delete, loop, and play clip instances. Imported audio clips can follow project BPM with pitch-preserving stretch. The next editing gap is clip-instance shaping: users need to trim starts/ends and avoid abrupt clip entrances or exits.

This feature operates on `ClipInstance` data. Source `Clip` content remains reusable and unchanged.

## Scope

Included:

- Add visible start and end trim handles to placed arrangement clips.
- Add visible fade-in and fade-out handles or equivalent compact controls to placed arrangement clips.
- Update `ClipInstance.lengthTicks` when trimming the end of a placed clip.
- Update `ClipInstance.startTick`, `ClipInstance.lengthTicks`, and imported-audio `sourceOffsetSeconds` when trimming the start of an audio clip.
- Store fade durations as serializable tick-based clip-instance metadata, such as `fadeInTicks` and `fadeOutTicks`.
- Clamp trim and fade edits to valid clip and arrangement bounds.
- Snap trim handles to the existing arrangement grid unless the implementation already has a modifier-key free-drag pattern.
- Apply trim and fade behavior during live `SONG` playback.
- Apply equivalent trim and fade behavior during arrangement WAV export.
- Show trim/fade state visually on arrangement clip blocks.
- Add focused tests for clip-instance trim/fade model helpers and scheduler/export planning where practical.

Excluded:

- Destructive source clip editing.
- Rewriting, cutting, or replacing imported WAV files.
- Clip split, consolidate, normalize, reverse, bounce, or duplicate shortcuts.
- Crossfades between adjacent clips.
- Pitch shifting or user-editable time-stretch ratios.
- Advanced fade curve editing beyond the first practical default curve.
- Waveform rendering unless it already exists and can be reused safely.

## Constraints

- Arrangement positions, lengths, and fade durations are stored in ticks.
- Imported audio source offsets are sample-local seconds because they point into media data.
- Project data must remain serializable.
- Runtime `AudioBuffer`, source nodes, gain nodes, scheduled nodes, and drag geometry must stay out of project JSON.
- React UI may own pointer interaction state, but audio scheduling and fade gain ramps belong in the audio engine/export path.
- Trim/fade changes must not mutate source `Clip`, `AudioClip`, or imported sample metadata except through explicit future features.
- Do not introduce a new drag-and-drop or waveform dependency for this first pass.

## Data Model Notes

Recommended first fields on `ClipInstance`:

```ts
export interface ClipInstance {
  id: string;
  clipId: string;
  trackId: string;
  startTick: Tick;
  lengthTicks: Tick;
  sourceOffsetSeconds?: number;
  fadeInTicks?: Tick;
  fadeOutTicks?: Tick;
}
```

For hybrid clips, trim should limit which drum and note events are visible/playable inside the placed instance window. It should not delete events from the source clip.

For imported audio clips, start trim should advance `sourceOffsetSeconds` while moving the arrangement start forward. End trim should reduce `lengthTicks`. If the trimmed instance is longer than the usable source audio after BPM-aware stretch, playback may end naturally and leave silence.

## Done when

- Users can trim the start and end of a placed clip without mutating the source clip.
- Users can set fade-in and fade-out durations on a placed clip.
- Fade handles cannot exceed the clip-instance duration or produce invalid negative lengths.
- Trim/fade values persist through project save and restore.
- `SONG` playback respects clip-instance trim/fade settings.
- Arrangement WAV export respects the same trim/fade settings.
- Existing clip placement, movement, deletion, loop playback, imported audio playback, and mixer routing still work.

## Verification

Run:

- `npm run typecheck --if-present`
- `npm run lint --if-present`
- `npm run test --if-present`
- `npm run build --if-present`

Manual check:

- Place a hybrid clip and confirm start/end trim changes the audible event window without deleting source events.
- Place an imported audio clip and confirm start trim skips into the source audio.
- Add fade-in and fade-out to a clip and confirm live playback has smooth gain changes.
- Export arrangement WAV and confirm trim/fade behavior matches live `SONG` playback.
- Confirm project save/restore preserves clip-instance trim/fade values.

## PR notes

- Explain the chosen first fade curve.
- Explain how start trim maps to `sourceOffsetSeconds` for imported audio.
- Note any limitations around hybrid note clipping, waveform display, or snap precision.
