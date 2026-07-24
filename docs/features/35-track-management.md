# Feature: 35 Track Management

Related issue: #24

## Status

Planned

## Goal

Add arrangement track management so users can create, rename, delete, and reorder tracks.

Track management should make the arrangement and mixer feel like editable song-level tools rather than a fixed demo grid.

## Context

The arrangement and mixer currently rely on a fixed set of tracks. Clips, mixer settings, effects, playback routing, persistence, and export are already tied to stable `trackId` values, so track editing must preserve identity and avoid index-based bugs.

This feature should work with the existing arrangement view and bottom mixer panel. It should not add a separate project dashboard or advanced routing model.

## Scope

Included:

- Add a compact UI path to create arrangement tracks.
- Allow track rename from the arrangement track header or an equivalent compact control.
- Allow track deletion with confirmation when the track contains clip instances or meaningful mixer/effect state.
- Allow vertical track reordering.
- Preserve stable `trackId` values when tracks are renamed or reordered.
- Keep placed `ClipInstance` objects associated with their stable `trackId`.
- Keep mixer channel strips in sync with the current track order.
- Preserve track mixer settings when tracks are renamed or reordered.
- Clean up owned clip instances and mixer/effect settings when a track is deleted after confirmation.
- Persist track changes through IndexedDB, project JSON export/import, and project bundle export/import.
- Ensure live `SONG` playback and arrangement WAV export use the updated track list.
- Add focused tests for track create, rename, delete, reorder, selection fallback, and clip-instance preservation where practical.

Excluded:

- Track folders, groups, buses, sends, or submix routing.
- Audio recording tracks or input routing.
- Advanced track types beyond the current arrangement model.
- Per-track automation lanes.
- Track color editing unless it is already trivial in the current model.
- Mixer redesign.
- Arrangement virtualization.

## Constraints

- Track identity must use stable IDs, not array indexes.
- Track order is serializable project state.
- Reordering tracks must not rewrite clip-instance timing.
- Deleting a track with placed clips must require explicit confirmation.
- The first deletion policy should remove clip instances on the deleted track after confirmation. It should not silently move them to another track.
- The app should keep at least one arrangement track available unless a later feature intentionally supports zero-track projects.
- Audio runtime mixer routes must be rebuilt or cleaned up without storing Web Audio nodes in project state.
- React UI can own menu/dialog/pointer state, but playback routing remains in the audio engine.

## Done when

- Users can create a new arrangement track.
- Users can rename an arrangement track.
- Users can delete an arrangement track with appropriate confirmation.
- Users can reorder tracks vertically.
- Arrangement clip blocks remain on the intended stable tracks after rename/reorder.
- Deleting a track removes only data owned by that track after confirmation.
- Mixer strips follow the same track order and do not lose track settings unexpectedly.
- Project persistence, import/export, live `SONG` playback, and arrangement WAV export use the updated track list.

## Verification

Run:

- `npm run typecheck --if-present`
- `npm run lint --if-present`
- `npm run test --if-present`
- `npm run build --if-present`

Manual check:

- Add a track and confirm it appears in the arrangement and mixer.
- Rename a track and confirm placed clips and mixer settings remain attached.
- Reorder tracks and confirm clip blocks, playback routing, and mixer strips follow the same stable tracks.
- Delete an empty track and confirm the layout updates.
- Delete a track with placed clips and confirm the destructive dialog appears before removing owned placements.
- Save/refresh/import/export a project and confirm track changes persist.

## PR notes

- Explain the track deletion policy.
- Explain how stable IDs are preserved during reorder.
- Note any limitations around drag precision, keyboard access, or minimum track count.
