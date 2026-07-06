# Architecture

## High-level Architecture

The app is a Vite + React + TypeScript browser application. React owns visual rendering and user interaction. The model layer owns serializable project data. The audio engine owns Web Audio runtime objects, scheduling, and playback.

The main rule is separation of concerns: UI rendering, persistence, and audio scheduling must not be mixed in the same module.

## Layer Responsibilities

### UI layer

- Render the transport, clip editor, drum sequencer, piano roll, and later arrangement views.
- Dispatch user actions to state/model logic.
- Display audio state such as stopped, playing, paused, and playhead position.
- Render song-level UI shells such as arrangement and mixer panels.
- Let users place, move, select, and delete arrangement clip instances.
- Let users adjust clip and arrangement lengths through model-backed controls.
- Dispatch mixer control edits such as volume, mute, solo, and master volume.
- Trigger save, restore, import, and export workflows through persistence/audio APIs.
- Let users create, select, rename, and delete browser-local projects through project-level UI.
- Use `requestAnimationFrame` for visual playheads where needed.
- Avoid owning exact audio timing.

### State/model layer

- Define serializable project data types.
- Store musical time in ticks.
- Provide pure transformations for creating, editing, duplicating, and deleting clips and events.
- Store clip length and arrangement length as serializable musical values.
- Store project identity and project metadata separately from runtime UI selection.
- Provide pure transformations for creating, moving, and deleting arrangement clip instances.
- Store serializable mixer settings such as track volume, mute, solo, master volume, and effect settings when mixer routing exists.
- Avoid references to Web Audio runtime objects.

### Audio engine

- Own `AudioContext` lifecycle.
- Load and decode sample assets.
- Store runtime-only decoded sample data.
- Schedule audio against `AudioContext.currentTime`.
- Schedule arrangement playback from placed clip instances when `SONG` mode is active.
- Own mixer routing, track gain nodes, master gain, runtime meters, and effect nodes when those features exist.
- Provide an offline rendering path for arrangement WAV export when that feature exists.
- Expose a small typed API to the UI and feature code.
- Never depend on React components.

### Persistence/import/export

- Convert project data to and from JSON.
- Validate or migrate project versions when needed.
- Store sample references by stable IDs or metadata, not decoded buffers.
- Handle browser file import boundaries for user-provided audio files.
- Keep `File`, `Blob`, object URL, IndexedDB handles, and decoded audio buffers out of model data.
- Persist browser-local project documents and imported sample blobs through IndexedDB.
- Persist a browser-local project collection for create/select/rename/delete workflows.
- Store the active project ID separately from the project document.
- Export and import portable project JSON files.
- Export and import app-created project bundle ZIP files that contain `project.json` plus imported WAV blobs.
- Compute and verify imported sample content hashes for relinking and bundle validation.
- Relink missing imported samples by attaching a validated user-selected WAV blob to an existing project-scoped `sampleId`.
- Export rendered arrangement audio as WAV without storing runtime audio objects in project JSON.

### Utilities

- Tick and time conversion.
- Musical grid math.
- ID generation if needed.
- Small pure helpers that are easy to test.

## Suggested Source Layout

```text
src/
  app/
  components/
  features/
  audio/
  model/
  persistence/
  utils/
  styles/
```

## Dependency Direction Rules

- `src/audio/` may depend on `src/model/` types and `src/utils/`, but not React components.
- `src/model/` should not depend on React, Web Audio, or browser storage APIs.
- `src/persistence/` may depend on model types and validation helpers.
- `src/features/` may compose UI, model operations, and audio engine APIs.
- Shared components should not import feature-specific state unless intentionally designed for that feature.

## Runtime vs Serializable Data

Serializable data includes projects, tracks, clips, clip instances, drum events, note events, sample metadata, tempo, time signature, clip length, arrangement length, arrangement loop ranges, and mixer settings.

Runtime data includes `AudioContext`, `AudioBuffer`, audio nodes, scheduler timers, decoded sample caches, and currently playing source nodes. Runtime data must not be written into project JSON.

Imported browser files are also runtime or persistence-layer data. Project JSON may reference imported audio by stable sample IDs and metadata such as file name, MIME type, and duration, but it must not embed `File`, `Blob`, object URL, or decoded PCM data.

IndexedDB may store imported sample blobs or bytes outside the project JSON document. The model should reference those blobs by stable sample IDs so the audio engine can rebuild decoded runtime caches after restore.

Portable project JSON exports should include imported sample `sampleId` values and metadata such as source file name, MIME type, duration, byte length, and `contentHashSha256` when available. They should not include imported WAV bytes. JSON-only imports may therefore restore imported clips as missing-source clips until the user relinks matching WAV files.

Project bundle exports may include imported WAV blobs in an app-owned store-only ZIP layout next to `project.json`. Bundle import should restore blobs into project-scoped persistence and verify their hashes when metadata is available. The first bundle importer only needs to support bundles created by this app, not arbitrary third-party ZIP layouts.

Each persisted project has a stable project ID. Imported sample blobs are scoped
to the owning project with project-aware records and composite blob keys.
Switching projects should stop live playback and preview before replacing app
state. Autosave must write to the intended project ID and must not accidentally
overwrite another project after a switch.

Mixer settings such as volume, mute, solo, master volume, and effect settings
are serializable project or app-model data once real mixer routing exists. Mixer
runtime data, including `GainNode`, `AnalyserNode`, effect nodes, meter buffers,
and active routing graphs, belongs to the audio engine runtime and must not be
stored in project JSON.

Arrangement placement data is serializable. A placed clip should be represented by a `ClipInstance` with stable IDs, `startTick`, `lengthTicks`, and track membership. Drag state, pointer coordinates, DOM measurements, scheduler timers, decoded buffers, and active audio nodes are runtime-only and must not be persisted.

## Future Desktop Packaging Considerations

Keep the app browser-first, but avoid assumptions that block future Electron or Tauri packaging:

- Keep file-system access behind persistence/import/export modules.
- Avoid direct dependency on Node APIs in UI and audio modules.
- Keep project files portable JSON.
- Keep sample references abstract enough to support browser object URLs now and local file paths later.

## Audio Engine React Boundary

The audio engine must not depend on React components. React may call a typed audio engine API, subscribe to status updates, and render visual feedback, but audio scheduling must remain independent from component render timing.
