# Feature: 32 Undo Redo History

Related issue: #22

## Status

Planned

## Goal

Add basic undo and redo history for destructive and high-frequency editing operations.

Users should be able to recover from mistakes while editing clips, notes, drum events, arrangement placements, mixer settings, and project metadata.

## Context

The app now has several editable surfaces:

- Sidebar clip and instrument management.
- Drum step sequencing.
- Piano roll note editing.
- Arrangement clip placement and movement.
- Arrangement length and loop range controls.
- Mixer volume, mute, solo, and effect settings.
- Browser-local project create, rename, delete, import, and export flows.

As these workflows become more capable, accidental edits become more costly. Existing DAWs treat undo/redo as a foundational safety feature. The first implementation should cover serializable project/editor state and intentionally avoid runtime audio state.

## Scope

Included:

- Add bounded undo and redo history for serializable project/app editing state.
- Support `Ctrl/Cmd+Z` for undo.
- Support `Ctrl/Cmd+Shift+Z` and/or `Ctrl/Cmd+Y` for redo.
- Clear redo history after a new edit following undo.
- Include common editing operations where practical:
  - drum step edits and subdivision changes
  - piano roll note create, move, delete, copy, and paste
  - clip create, rename, delete, and duplicate
  - pitched instrument add and remove
  - arrangement clip placement, move, delete, copy, and paste
  - arrangement length and loop range edits
  - mixer volume, mute, solo, and effect parameter edits
- Group high-frequency pointer edits into sensible history entries where practical.
- Add UI affordances if practical, such as disabled/enabled undo and redo buttons or project menu actions.
- Add focused tests for history push, undo, redo, redo invalidation, history bounds, and representative edit operations.

Excluded:

- Persistent undo history across browser refresh.
- Collaborative undo.
- Runtime audio undo, including active transport position, decoded buffers, scheduled nodes, meters, or active source voices.
- Browser history integration.
- Full command palette.
- Perfect semantic grouping for every gesture if that makes the first implementation too broad.

## Constraints

- Project data must remain serializable.
- Runtime audio objects must not be stored in undo history.
- DOM geometry, pointer state, selection marquee state, audio cache state, and active transport playback state must not be stored in undo history.
- Keep history memory bounded.
- Do not break IndexedDB autosave or project export/import.
- Undo/redo should update the same app-model state used by persistence so autosave records the restored state.
- React UI may trigger undo/redo commands, but audio scheduling must remain separate.

## Data Model Notes

The first implementation may store history as bounded snapshots or patches of serializable app/project state.

Snapshot history is acceptable for the first version if memory remains reasonable. If snapshot size becomes a problem, a later feature can move to command patches or structural sharing.

Do not persist undo history in project JSON or IndexedDB for this feature. After refresh, the current project state should restore, but undo/redo stacks may be empty.

## Done when

- Users can undo and redo supported editing operations with keyboard shortcuts.
- Redo clears after undo followed by a new edit.
- Supported edit operations are listed clearly in the implementation PR.
- Undo/redo does not restore runtime-only audio state.
- Playback uses the restored project state after undo/redo.
- Autosave and project persistence still work after undo/redo.
- Tests cover core history behavior and representative supported operations.

## Verification

Run:

- `npm run typecheck --if-present`
- `npm run lint --if-present`
- `npm run test --if-present`
- `npm run build --if-present`

Manual check:

- Edit drum steps, notes, arrangement placements, mixer values, and clip metadata.
- Undo and redo each supported operation.
- Confirm redo clears after undo followed by a new edit.
- Confirm undo/redo during stopped playback updates visible state.
- Confirm playback after undo/redo uses the restored state.
- Refresh after undo/redo and confirm autosaved state matches the visible state where autosave applies.

## PR notes

- List supported operations.
- List deferred operations.
- Explain snapshot vs patch strategy.
- Explain history bounds.
- Explain which runtime-only state is intentionally excluded.
