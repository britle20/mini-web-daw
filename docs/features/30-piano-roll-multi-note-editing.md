# Feature: 30 Piano Roll Multi-Note Editing

Related issue: #19

## Status

Planned

## Goal

Add multi-note selection and basic batch editing to the piano roll.

Users should be able to select several notes, move them together, delete them together, and optionally copy/paste a selected phrase using app-local keyboard shortcuts.

## Context

The current piano roll supports single-note creation, movement, and right-click deletion. That is enough for very small tests, but real phrase editing needs a way to operate on multiple notes.

This feature should improve editing without changing the `NoteEvent` data shape. Notes should remain serializable clip data. Selection state, selection marquee geometry, and clipboard state should remain runtime UI state.

## Scope

Included:

- Ctrl/Cmd-click an existing note to add it to or remove it from the selection.
- Click a note without Ctrl/Cmd to select only that note.
- Click empty piano roll space to clear the current selection unless starting a box selection.
- Drag on empty grid space to draw a box selection marquee.
- Select notes whose note rectangles intersect the selection marquee.
- Show selected notes with a clear visual selected state.
- Drag any selected note to move the whole selected group.
- Preserve relative start tick and pitch offsets during group movement.
- Snap moved notes to the existing piano roll grid.
- Delete or Backspace deletes all selected notes.
- Keep existing single-note creation, drag movement, and right-click deletion behavior.
- Add basic app-local copy/paste if practical:
  - Ctrl/Cmd+C copies selected notes into runtime editor clipboard state.
  - Ctrl/Cmd+V pastes notes into the current clip and selected pitched instrument.
  - Pasted notes receive new IDs.
  - Relative tick and pitch spacing is preserved.
  - The pasted notes become the current selection.
- Add focused helper/model tests for selection, group movement, deletion, and copy/paste transforms where practical.

Excluded:

- OS clipboard integration.
- Saving note clipboard data in project JSON or IndexedDB.
- Cross-project clipboard behavior.
- Multi-instrument group editing.
- Arrangement view multi-select.
- Velocity lane editing.
- Resize handles for a selected note group.
- Quantize, transpose, nudge, duplicate, or repeat commands unless they are trivial helpers needed for the first copy/paste implementation.

## Constraints

- Store musical time in ticks, not seconds.
- Project data must remain serializable.
- `NoteEvent` should continue to store note ownership through `instrumentId`.
- Selection and clipboard state should not be persisted.
- React UI may own editor selection state, but audio scheduling must remain separate.
- Group movement and paste should obey clip length and visible pitch range boundaries.
- Avoid partial silent failures. If an operation would place some notes outside allowed bounds, clamp the whole group predictably or reject the operation consistently.
- Do not introduce a drag-and-drop dependency for this feature.

## Copy/Paste Recommendation

Copy/paste is useful enough to include with the first multi-select implementation if it stays simple.

Recommended first behavior:

- Keep an app-local note clipboard, not the OS clipboard.
- Copy only notes from the currently selected clip and pitched instrument.
- Store copied notes as relative data from the copied selection's earliest `startTick`.
- Preserve MIDI pitches by default.
- Paste into the currently selected clip and pitched instrument.
- Use the last piano roll edit position as the paste anchor when available.
- If no edit position exists, paste one grid step after the copied selection.
- Generate new IDs and select the newly pasted notes.

Later features can add OS clipboard support, cross-clip paste behavior, pitch-relative paste, duplicate shortcuts, transpose, and nudge commands.

## Done when

- Ctrl/Cmd-click toggles individual note selection.
- Empty-grid drag creates a selection box.
- Box selection selects intersecting notes.
- Selected notes are visually distinct.
- Dragging a selected note moves the selected group together.
- Delete and Backspace delete all selected notes.
- Existing single-note editing still works.
- If copy/paste is implemented, copied notes paste with preserved spacing, new IDs, and correct selected state.
- `PAT` playback and `SONG` playback use updated note events after edits.

## Verification

Run:

- `npm run typecheck --if-present`
- `npm run lint --if-present`
- `npm run test --if-present`
- `npm run build --if-present`

Manual check:

- Create several notes in one pitched instrument lane.
- Ctrl/Cmd-click notes to add and remove them from the selection.
- Drag a box around notes and confirm intersecting notes are selected.
- Drag selected notes and confirm they move as one group.
- Confirm group moves preserve timing and pitch relationships.
- Try moving selected notes near clip and pitch boundaries.
- Delete selected notes with Delete/Backspace.
- If copy/paste is included, copy selected notes, paste them, and confirm spacing, pitches, IDs, and selected state are correct.
- Confirm single-note create, move, and right-click delete still work.
- Start `PAT` and `SONG` playback after edits and confirm updated notes are heard.

## PR notes

- Explain the selection state model.
- Explain group movement boundary behavior.
- If copy/paste is included, explain paste anchor behavior and clipboard limitations.
- Mention that OS clipboard, cross-instrument editing, quantize, transpose, and group resizing are intentionally deferred.
