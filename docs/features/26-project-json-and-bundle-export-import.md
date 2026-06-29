# Feature: 26 Project JSON and Bundle Export/Import

Related feature document: `docs/features/26-project-json-and-bundle-export-import.md`

## Status
Planned

## Goal

Let users move a browser-local project between browsers or machines.

This feature should support both:

- JSON-only project export/import.
- Bundle export/import as a ZIP file that includes `project.json` and imported WAV files.

Imported WAV files should be identified by stable `sampleId` values and content hashes so missing sample relinking can attach a user-selected WAV to the correct project sample reference.

## Context

The app already stores browser-local projects and imported sample blobs in IndexedDB. That makes refresh and local reuse work, but it does not let a user send a project to someone else.

Project JSON should remain portable and serializable. It must not embed `File`, `Blob`, object URLs, decoded PCM data, `AudioBuffer`, or audio nodes. Imported WAV bytes need a bundle format or an explicit relink workflow.

This feature is different from arrangement WAV export. Arrangement WAV export renders the song to final audio. Project export/import moves editable project data and, optionally, source media.

## Scope

Included:

- Add project JSON export for the active project.
- Add project JSON import that creates a new browser-local project rather than overwriting the active project.
- Add bundle export as a ZIP file containing:
  - `project.json`
  - imported WAV blobs referenced by the project when available
- Add bundle import that restores the project document and imported WAV blobs into IndexedDB.
- Preserve imported audio `sampleId` values inside the imported project.
- Compute and store or export `contentHashSha256` metadata for imported WAV files.
- Store exported imported-sample metadata such as source file name, MIME type, duration, byte length, and content hash.
- Treat JSON-only imports as valid even when imported WAV bytes are missing.
- Show imported samples with missing source data after JSON-only import or incomplete bundle import.
- Add a relink flow for missing imported samples.
- When relinking, compute the selected WAV's SHA-256 hash and attach the blob to the existing `sampleId` when it matches.
- Use filename, byte length, and duration only as secondary fallback metadata when a hash is unavailable, such as for old projects.
- Add clear UI labels so project JSON/bundle export is not confused with arrangement WAV export.
- Keep all new project data serializable.
- Add focused tests for project serialization, hash matching, missing sample detection, relink behavior, and app-created bundle parsing where practical.
- Update architecture, data model, UI, and testing docs.

Excluded:

- Cloud sync.
- User accounts.
- Realtime collaboration.
- Importing arbitrary third-party ZIP layouts.
- Compressing audio files for smaller bundles.
- MP3, AIFF, FLAC, OGG, or other imported media formats.
- Time stretching imported audio.
- Project merge/conflict resolution.
- Partial clip import from another project.
- Final arrangement audio export, which already belongs to arrangement WAV export.

## Constraints

- Project JSON must remain serializable.
- Do not embed imported WAV bytes in JSON.
- Do not store `File`, `Blob`, object URL, `AudioBuffer`, decoded PCM data, or audio nodes in project JSON.
- Preserve `sampleId` values inside an imported project so clips and sample metadata still connect.
- If an imported project ID collides with an existing local project, generate a new local project ID while preserving internal clip IDs and sample IDs.
- Imported sample blobs remain project-scoped in IndexedDB.
- React UI must not own audio scheduling or decoded audio buffers.
- Keep persistence/import/export logic outside React components where practical.
- Prefer no new runtime dependency. A minimal app-owned store-only ZIP writer/reader is acceptable because WAV files are already compressed poorly by general ZIP compression. If the implementation chooses a ZIP dependency, the PR must justify it.

## Data Model Notes

Extend imported `SampleMeta` with stable file identity metadata.

Illustrative shape:

```ts
export interface SampleMeta {
  id: string;
  name: string;
  durationSeconds?: number;
  source: {
    kind: "bundled" | "imported";
    path?: string;
    fileName?: string;
    mimeType?: string;
    byteLength?: number;
    contentHashSha256?: string;
  };
}
```

`contentHashSha256` identifies the WAV bytes, not a decoded `AudioBuffer`.

When a JSON-only project is imported:

- Keep all clip, arrangement, mixer, tempo, and sample metadata.
- Preserve each audio clip's `sampleId`.
- Mark imported samples as missing until the user relinks the WAV.
- Relinking stores the selected blob under the existing project-scoped `sampleId`.

When a bundle project is imported:

- Read `project.json`.
- Restore imported WAV blobs from the bundle into IndexedDB under the imported project's local project ID and original `sampleId`.
- Verify bundle WAV blobs against `contentHashSha256` when present.
- Treat missing or mismatched bundle entries as missing samples with a visible warning, not as runtime audio objects in project JSON.

## Bundle Format

The first bundle format should be intentionally small and app-owned.

Recommended ZIP entries:

```text
project.json
samples/imported/<sampleId>.wav
```

Rules:

- `project.json` is UTF-8 JSON.
- Imported sample entries are WAV blobs stored by `sampleId`.
- Original source file names remain in `project.json` metadata.
- The first implementation only needs to import bundles exported by this app.
- Store-only ZIP entries are acceptable; compression is not required.

## UI Notes

Project file import/export should be visually separate from arrangement WAV export.

Recommended first UI:

- `Export Project JSON`
- `Export Project Bundle`
- `Import Project File`
- Missing sample list with one `Relink` action per missing imported sample.

`Import Project File` may accept `.json` and `.zip`.

After importing a project file, the app should create a new local project and switch to it when import succeeds. The imported project name may be preserved unless a duplicate local name requires a suffix.

## Done when

- Users can export the active project as JSON.
- Users can import a project JSON file as a new local project.
- JSON-only import preserves project structure while imported WAV sources appear as missing when bytes are not available.
- Users can relink a missing imported WAV by selecting a matching file.
- Relinking uses SHA-256 content hash matching when available and stores the blob under the existing `sampleId`.
- Users can export the active project as a bundle ZIP containing `project.json` and available imported WAV blobs.
- Users can import an app-created bundle ZIP and recover imported WAV playback without manually relinking.
- Imported sample metadata includes `sampleId`, source file name, duration, MIME type, byte length where available, and content hash where available.
- Imported project ID collisions are handled without overwriting existing local projects.
- Arrangement playback, audio clip preview, persistence, and arrangement WAV export still work after project import.
- Missing source data produces clear UI feedback rather than broken silent playback.
- Relevant tests and docs are updated.

## Verification

Run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

Manual check:

- Create a project with hybrid clips, imported WAV clips, arrangement placements, mixer settings, and tempo changes.
- Export JSON, import it, and confirm the project appears as a new local project.
- Confirm imported audio clips from JSON-only import show missing sample state.
- Relink a missing imported WAV with the original file and confirm playback works.
- Try relinking with a different WAV and confirm the hash mismatch is rejected or clearly warned.
- Export a bundle ZIP from the original project.
- Import the bundle ZIP in a clean browser profile if practical.
- Confirm imported audio clip preview, arrangement playback, persistence after refresh, and arrangement WAV export work without manual relinking.
- Confirm project import does not overwrite existing local projects.

## PR notes

- Reference issue #5.
- Explain the project file format and bundle ZIP layout.
- Explain imported sample hash metadata and relink behavior.
- Explain project ID collision behavior.
- Mention any ZIP limitations, such as app-created bundles only and no compression.
