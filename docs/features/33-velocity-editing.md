# Feature: 33 Velocity Editing

Related issue: #21

## Status

Planned

## Goal

Add practical velocity editing for drum events and piano roll note events.

Users should be able to make patterns less static by adjusting event loudness without changing timing or note length.

## Context

`DrumEvent` and `NoteEvent` already store normalized `velocity` values. The audio engine uses event gain during playback and export. The missing piece is an editor UI for changing those values.

Velocity editing is a core DAW workflow, but the first implementation should stay narrow. It should edit existing event velocity fields, reflect changes in playback/export, and avoid broader automation or expressive MIDI editing.

## Scope

Included:

- Add piano roll velocity editing for the selected pitched instrument's notes.
- Add drum step velocity editing for drum events.
- Show velocity values visually in compact editor areas.
- Let users adjust velocity with pointer interactions where practical.
- Clamp velocity to a safe normalized range, recommended `0` to `1`.
- Persist velocity on `NoteEvent.velocity` and `DrumEvent.velocity`.
- Apply velocity during `PAT` playback.
- Apply velocity during `SONG` playback.
- Apply velocity during arrangement WAV export.
- Support selected-note velocity editing when multi-note selection exists.
- Support selected drum step or lane event velocity editing where practical.
- Add focused tests for velocity clamping, model updates, and gain calculations where practical.

Excluded:

- MIDI CC editing.
- Automation lanes.
- Velocity randomization, humanize, probability, chance, ratchet, or swing.
- MPE or per-note expression beyond velocity.
- Dedicated large editor panels.
- Full mixer automation.

## Constraints

- Velocity is serializable event data.
- Timing remains tick-based.
- Velocity changes must not alter `startTick`, `durationTicks`, `midiNote`, `laneId`, or clip length.
- Runtime `GainNode`, `AudioBuffer`, and scheduled source nodes must not be stored in project JSON.
- Use CSS Modules and existing semantic design tokens.
- Keep the UI compact and editor-focused.
- Do not add dependencies.

## UI Notes

Piano roll velocity may use a bottom velocity lane or compact inline editor. The lane should correspond to notes in the selected pitched instrument and should remain visually aligned with the piano roll grid.

Drum velocity may start as per-step interaction on active steps, such as a vertical drag, modifier drag, or compact popover/slider. The implementation should choose the simplest interaction that is clear and does not conflict with step toggling.

When multi-note selection is available, changing one selected note velocity may apply the same value to all selected notes. If multi-note selection is not implemented yet, start with single-note velocity editing and document multi-note velocity as follow-up.

## Done when

- Users can view and edit piano roll note velocity.
- Users can view and edit drum event velocity.
- Edited values are stored on `NoteEvent.velocity` or `DrumEvent.velocity`.
- Velocity affects audible gain in `PAT` playback.
- Velocity affects `SONG` playback.
- Velocity affects arrangement WAV export.
- Existing note and drum editing still works.
- Velocity changes persist after refresh.
- Tests cover model updates and clamping behavior.

## Verification

Run:

- `npm run typecheck --if-present`
- `npm run lint --if-present`
- `npm run test --if-present`
- `npm run build --if-present`

Manual check:

- Create drum hits and change their velocity.
- Create piano roll notes and change their velocity.
- Confirm lower velocity sounds quieter and higher velocity sounds louder.
- Confirm velocity changes persist after refresh.
- Confirm `PAT`, `SONG`, and exported WAV reflect edited velocity.
- Confirm timing and note lengths do not change when velocity is edited.

## PR notes

- Explain the chosen piano roll velocity UI.
- Explain the chosen drum velocity UI.
- Explain velocity clamp behavior.
- Mention whether multi-note velocity editing is included or deferred.
- Mention that automation, MIDI CC editing, humanize, probability, and expressive MIDI are intentionally deferred.
