# Feature: 31 Arrangement Multi-Clip Editing

Related issue: #20

## Status

Planned

## Goal

Add multi-clip selection, group movement, group deletion, and app-local copy/paste to the arrangement view.

Users should be able to edit repeated song sections by selecting several placed clips and moving, deleting, or copying them together.

## Context

The arrangement view currently supports individual `ClipInstance` placement, movement, deletion, and playback. That is enough to build a small arrangement, but larger song edits need group operations.

Existing DAWs generally support multi-select in arrangement or playlist views because arrangement editing is selection-based: users select clips or regions, then move, delete, copy, paste, duplicate, or process the selection. This feature brings the first focused version of that workflow into the mini DAW.

This feature operates on arrangement placements, not source clips. Deleting or pasting selected arrangement clips must not delete or duplicate sidebar source clips.

## Scope

Included:

- Ctrl/Cmd-click a placed arrangement clip to add it to or remove it from the current selection.
- Click a placed clip without Ctrl/Cmd to select only that placement.
- Click empty arrangement space to clear the current selection unless starting a box selection.
- Drag empty arrangement space to draw a box selection marquee.
- Select placed clips whose rectangles intersect the selection marquee.
- Show selected clip instances with a clear visual selected state.
- Drag any selected clip instance to move the selected group.
- Preserve relative track offsets and tick offsets during group movement.
- Snap group movement and paste to the existing arrangement grid.
- Clamp group movement at arrangement start/end and track boundaries while preserving relative placement where possible.
- Delete or Backspace deletes all selected clip instances.
- Ctrl/Cmd+C copies selected clip instances into app-local arrangement clipboard state.
- Ctrl/Cmd+V pastes copied clip instances into the current arrangement.
- Pasted clip instances receive new IDs.
- Pasted clip instances reference the same source clips and sample metadata.
- Add focused tests for selection, group movement, bounds clamping, group deletion, and copy/paste transforms where practical.

Excluded:

- Deleting or duplicating sidebar source clips from arrangement multi-select commands.
- OS clipboard integration.
- Persisting arrangement clipboard state in project JSON or IndexedDB.
- Cross-project clipboard behavior.
- Persistent clip groups.
- Arrangement time selection commands.
- Clip instance resize handles.
- Split, trim, stretch, consolidate, or bounce commands.
- Automation selection or editing.
- Track creation, deletion, or reordering.

## Constraints

- Arrangement positions and lengths remain stored in ticks.
- Project data must remain serializable.
- `ClipInstance` data remains the serializable source of truth for arrangement placement.
- Selected instance IDs, selection marquee geometry, last arrangement edit position, and clipboard contents are runtime UI state.
- Copy/paste creates new serializable `ClipInstance` objects with new IDs.
- Source `Clip` data is reused by reference. Audio clip copies continue to reference the same `sampleId`.
- React UI may own selection state, but it must not own exact audio scheduling.
- Group movement and paste should reuse the existing arrangement snap rules.
- Do not introduce a drag-and-drop dependency for this feature.

## Bounds Policy

Use group-level clamping.

When a selected group moves or pastes:

- Compute the group's earliest start tick and latest end tick.
- Compute the group's top and bottom track indexes.
- Compute the requested movement delta.
- Clamp the delta so the group remains inside arrangement tick bounds and valid track indexes.
- Apply the same clamped delta to every selected instance.

This preserves relative spacing inside the selected group. If the group is wider than the arrangement or taller than the available track count, reject the operation with clear behavior documented in the PR rather than partially moving or dropping clips.

## Copy/Paste Recommendation

Use an app-local arrangement clipboard for the first implementation.

Recommended behavior:

- Ctrl/Cmd+C copies selected `ClipInstance` data only.
- Store copied instances relative to the copied group's earliest `startTick` and top track index.
- Ctrl/Cmd+V pastes into the current arrangement.
- Use the last arrangement grid click/drop position as the paste anchor when available.
- If no anchor exists, paste one snap unit after the copied selection.
- Generate new instance IDs.
- Preserve relative tick spacing and track offsets.
- Select the pasted instances after paste.

Later features can add OS clipboard support, duplicate shortcuts, persistent clip groups, time selection editing, and cross-project paste behavior.

## Done when

- Ctrl/Cmd-click toggles arrangement clip instance selection.
- Empty-grid drag creates a selection box.
- Box selection selects intersecting clip instances.
- Selected instances are visually distinct.
- Dragging a selected instance moves all selected instances together.
- Group movement clamps at arrangement start/end and track boundaries.
- Delete and Backspace delete all selected instances without deleting source clips.
- Ctrl/Cmd+C and Ctrl/Cmd+V copy/paste selected instances.
- Pasted instances receive new IDs, preserve relative spacing, and reference the same source clips.
- Existing single-clip placement, movement, right-click deletion, and playback still work.
- `SONG` playback uses the updated arrangement instances after edits.

## Verification

Run:

- `npm run typecheck --if-present`
- `npm run lint --if-present`
- `npm run test --if-present`
- `npm run build --if-present`

Manual check:

- Place several hybrid and imported audio clips in the arrangement.
- Ctrl/Cmd-click placed clips to add/remove them from the selection.
- Drag a box around placed clips and confirm intersecting clips are selected.
- Drag selected clips horizontally and vertically and confirm they move as a group.
- Move selected clips against arrangement start/end and top/bottom track bounds and confirm clamping.
- Delete selected placements with Delete/Backspace and confirm sidebar source clips remain.
- Copy selected placements with Ctrl/Cmd+C and paste with Ctrl/Cmd+V.
- Confirm pasted placements preserve relative timing and track offsets.
- Confirm pasted placements receive new IDs and reference the same source clips.
- Confirm `SONG` playback reflects moved, deleted, and pasted clip instances.

## PR notes

- Explain selection state and clipboard state ownership.
- Explain group-level bounds clamping behavior.
- Explain paste anchor behavior.
- Mention that OS clipboard, persistent groups, time selection editing, split/trim/stretch, and duplicate shortcuts are intentionally deferred.
