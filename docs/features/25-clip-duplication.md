# Feature: 25 Clip Duplication

Related feature document: `docs/features/25-clip-duplication.md`

## Status
Planned

## Goal

Allow users to duplicate an existing sidebar clip so they can create variations without rebuilding the original pattern or imported audio reference.

## Context

The sidebar now manages reusable clips. Users can build hybrid clips, import WAV files as audio clips, place clips in the arrangement, and persist projects locally.

The next editing convenience is duplication. This should duplicate reusable source clips in the sidebar, not arrangement placements. Arrangement `ClipInstance` objects should continue to represent song placement separately.

## Scope

Included:

- Add a duplicate action for clip rows in the sidebar.
- Duplicate hybrid clips with a new stable clip ID and name.
- Deep-copy hybrid clip musical content:
  - `lengthTicks`
  - `drumStepSubdivision`
  - ordered `drumLanes`
  - `drumEvents`
  - `pitchedInstrumentIds`
  - `noteEvents`
- Generate new stable event IDs for duplicated drum and note events when event IDs exist.
- Duplicate audio clips as new clip records that reference the same imported sample metadata and `sampleId`.
- Do not duplicate imported audio blob bytes or decoded runtime buffers.
- Select the duplicated clip after creation.
- Keep source clip contents unchanged after editing the duplicate.
- Add pure model helper coverage where practical.
- Use CSS Modules and semantic tokens for any new sidebar control.

Excluded:

- Duplicating arrangement `ClipInstance` placements.
- Duplicating a whole project.
- Linked clips or alias clips that intentionally share editable musical events.
- Duplicating imported sample blobs or media bytes.
- Batch duplication.
- Keyboard shortcuts for duplication.
- Drag-copy arrangement editing.

## Constraints

- Project state must remain serializable.
- Musical event timing must remain tick-based.
- Runtime objects such as `AudioBuffer`, `AudioNode`, `Blob`, `File`, and object URLs must not be copied into project JSON.
- A duplicated clip must have an independent clip ID.
- Duplicated hybrid events should not share mutable event identity with the source clip.
- Duplicated audio clips may share `sampleId` and sample metadata because the source media is reusable project data.
- Do not mutate or delete arrangement placements when duplicating a source clip.

## Data Model Notes

Clip duplication should be implemented as a model transformation, not as ad hoc component state editing.

Recommended behavior:

- Source clip `CLIP 1` duplicates to a readable name such as `CLIP 1 COPY` or the next available `CLIP N`.
- Hybrid clip duplication deep-copies musical arrays so edits to the duplicate do not affect the source.
- Audio clip duplication creates a second audio clip entry that points to the same `sampleId`.
- Arrangement instances continue to reference the original source clip unless the user explicitly places the duplicate later.

If an implementation chooses deterministic IDs for drum events, those IDs should be regenerated from the duplicated clip ID, lane ID, and event tick so source and duplicate remain distinct.

## UI Notes

The duplicate action should be available from the clip row where users already manage clips.

Recommended first UI:

- Add a compact duplicate icon button near existing clip row actions.
- Use an accessible label such as `Duplicate CLIP 1`.
- Keep hover and focus styling unified so the row does not look like separate unrelated boxes.

The first implementation does not need a confirmation dialog because duplication is non-destructive.

## Done when

- A user can duplicate a hybrid clip from the sidebar.
- The duplicate appears as a separate sidebar clip with a unique ID and readable name.
- The duplicate is selected after creation.
- Editing duplicated drum steps or notes does not mutate the source clip.
- A user can duplicate an imported audio clip.
- The duplicated audio clip can be selected, placed, and played using the existing imported sample reference.
- Duplicating a clip does not create arrangement placements and does not mutate existing placements.
- Project persistence restores duplicated clips correctly.
- Relevant tests and docs are updated.

## Verification

Run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

Manual check:

- Create a hybrid clip with drum events and notes, duplicate it, then edit the duplicate.
- Confirm the source clip's drum events and notes are unchanged.
- Confirm the duplicate keeps clip length and drum subdivision settings.
- Import a WAV clip, duplicate it, place the duplicate in the arrangement, and confirm it plays from the same imported source.
- Confirm no new arrangement placement appears until the duplicate is explicitly placed.
- Refresh the browser and confirm duplicated clips persist.

## PR notes

- Reference issue #3.
- Explain the duplicate naming rule.
- Explain how hybrid event IDs are regenerated.
- Explain why audio clip duplication shares sample metadata instead of copying media bytes.
- Mention that arrangement instance duplication and keyboard shortcuts are deferred.
