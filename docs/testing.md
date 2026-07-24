# Testing Strategy

## Required Checks

Run these checks before opening a PR when the scripts exist:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

CI uses `--if-present` while the repository is still before the Vite scaffold.

## Test Strategy

- Pure utilities: unit tests.
- Tick/time conversion: unit tests.
- Data model transformations: unit tests.
- Clip length and arrangement length transformations: unit tests.
- Drum step subdivision tick math and event toggling: unit tests.
- Clip collection and sidebar membership transformations: unit tests.
- Arrangement clip instance creation, movement, deletion, and snapping: unit tests.
- Arrangement scheduler event expansion from clip instances: unit tests where practical.
- IndexedDB persistence adapters, migrations, and serialization boundaries: unit or integration tests with mocked storage where practical.
- Multi-project store operations: unit or integration tests for create, list, rename, delete, active project selection, and migration from the single active project shape.
- Project dialog validation helpers: unit tests for empty, trimmed, and duplicate-name behavior where practical.
- Project autosave/manual restore checks should verify that imported audio metadata and blobs remain separated.
- Project JSON and bundle import/export helpers: unit tests for serialization, project ID collision handling, sample hash metadata, missing sample detection, store-only ZIP round trips, and app-created bundle layout where practical.
- Imported sample relink helpers: unit tests for SHA-256 matching, mismatch rejection, and fallback metadata behavior when hashes are unavailable.
- Imported audio source BPM validation and stretch-rate helpers: unit tests.
- BPM-aware imported audio scheduler planning: unit tests where practical.
- BPM-aware imported audio export planning and missing-metadata errors: unit tests where practical.
- Variable hybrid clip length should cover 1, 2, and 4 bar tick lengths, editor grid derivation, shortening behavior, and arrangement default instance length.
- WAV encoder header, duration, and sample conversion helpers: unit tests.
- Pitched instrument metadata and sample-zone mapping: unit tests.
- Piano roll multi-note selection, group movement, group deletion, and app-local copy/paste transforms: unit tests where practical.
- Tempo control and scheduler tempo update behavior: unit tests where practical.
- Mixer decibel-to-gain conversion and mute/solo effective-gain logic: unit tests.
- Mixer state transformations for volume, mute, solo, and master volume: unit tests.
- Mixer effect state defaults, parameter clamping, and state transformations: unit tests.
- Clip duplication transformations: unit tests for hybrid deep-copy behavior, regenerated IDs, audio clip sample reference sharing, and arrangement placement non-mutation.
- Arrangement playback event expansion should preserve `trackId` so scheduled sources can route through the mixer.
- Sustain loop point calculations: unit tests.
- Sampler sustain metadata validation and fallback decisions: unit tests.
- Scheduler calculations: unit tests where possible.
- Imported WAV file-name, metadata, validation, and duration helpers: unit tests where practical.
- UI interactions: component tests later.
- Critical flows: browser end-to-end tests later, after the UI and workflows are stable enough to justify the framework.

## Test Source Layout

- `src/`: production code only.
- `tests/unit/`: unit tests for pure utilities, scheduler calculations, model transformations, and isolated module behavior.
- `tests/integration/`: integration tests for multi-module workflows when needed.

Do not add an end-to-end test directory or framework yet. Add it only when a future feature spec needs browser flow coverage.

Test files should use `*.test.ts` or `*.test.tsx`. Keep paths grouped by the production area they cover, for example:

```text
tests/unit/audio/lookahead-scheduler.test.ts
tests/unit/audio/sampler-sustain.test.ts
tests/unit/utils/tick-time.test.ts
```

`tsconfig.test.json` owns TypeScript settings for tests. The root `tsconfig.json` should reference it so `npm run typecheck` checks test files as well as production code.

## High-risk Areas

- Tick-to-seconds conversion.
- Loop boundaries.
- Clip length boundary handling.
- Arrangement length boundary handling.
- Pause/resume tick offsets.
- Playhead wrapping at loop boundaries.
- BPM changes while stopped, paused, and playing.
- Pitched instrument selection.
- Drum step subdivision tick math.
- Drum step subdivision changes preserving existing events.
- Clip add/delete/rename selection fallback.
- Per-clip pitched instrument add/delete behavior.
- Removing pitched instruments that own note events.
- Arrangement clip placement snapping.
- Arrangement clip move/delete behavior.
- Arrangement playback event expansion across clip instance offsets.
- Arrangement playhead behavior during play, pause, resume, and stop.
- Sample start offsets, optional sustain loop points, and note release behavior.
- Sampler sustain fallback behavior when loop metadata is missing or invalid.
- Clip duplication.
- Sample import.
- Imported audio clip metadata and runtime-cache separation.
- Imported audio source BPM validation and missing-BPM behavior.
- Imported audio stretch-rate calculation from project BPM and source BPM.
- Imported audio stretch startup reliability and retry behavior.
- Imported file persistence limitations across refresh.
- IndexedDB restore behavior for imported sample metadata and blobs.
- Multi-project active project migration and restore behavior.
- Project create/rename/delete dialog validation and cancel behavior.
- Autosave writing to the wrong project after a project switch.
- Imported sample blob collisions between projects.
- Project export/import.
- Project bundle import/export.
- Imported sample hash matching and relinking.
- WAV export duration and missing-source failure behavior.
- WAV export behavior for BPM-aware imported audio clips.
- Oscillator synth preset metadata, lookup, and live/export playback parity.
- Scheduler timing.
- Mixer decibel-to-gain conversion.
- Mixer mute/solo state interactions and effective audibility.
- Mixer effect parameter clamping and migration from projects without effect slots.
- Clip duplication source/duplicate independence.
- Audio clip duplication sample-reference reuse without media-byte duplication.
- Mixer effect routing interaction with track faders, mute, solo, meters, and master output.
- Track-to-master routing during arrangement playback.
- Runtime level meter behavior and meter decay after stop.

## Manual Testing Guidance for Audio Features

Manual audio checks should verify:

- Audio starts only after user interaction when required by the browser.
- One-shot samples play repeatedly without reusing the same source node.
- Loop playback does not double-trigger events at the loop boundary.
- UI playhead movement roughly matches audible playback.
- Pause preserves the runtime playhead position, resume continues from that position, and stop resets to the start.
- BPM changes while stopped affect the next playback start.
- BPM changes while paused affect resume from the paused tick.
- BPM changes while playing affect future scheduled drum and note events without using UI timers for exact playback.
- Starting, stopping, and restarting transport leaves no stuck sounds.
- Long sample-based piano notes behave as documented for the selected instrument. For the current Iowa Piano implementation, they should not retrigger or sound like repeated strikes.
- When sampler sustain metadata exists, long sample-based notes should sustain without obvious repeated attacks as much as the sample material allows.
- If sampler sustain metadata is missing or invalid, sample-based notes should fall back to one-shot playback rather than stuck or unstable sustain.
- Instrument switching changes piano roll playback sound without mutating existing note events.
- Piano roll multi-note editing checks should verify Ctrl/Cmd-click toggling, box selection, selected-note visual state, group drag behavior, Delete/Backspace deletion, and app-local copy/paste if included.
- Oscillator synth preset checks should verify that approved presets can be added to clips, sound distinct in `PAT` and `SONG` playback, render in arrangement WAV export, and rejected audition candidates are absent from the final UI.
- Tempo changes behave as documented for the current milestone.
- Mixer UI shell checks should verify fader, mute, solo, meter placeholder, and effect slot visuals without implying real audio routing.
- Functional mixer checks should verify track faders, master fader, mute, solo, and level meters affect real `SONG` playback.
- Basic mixer effect checks should verify Filter, Delay, and Distortion affect only their owning track, can be bypassed, persist across refresh, and are reflected in WAV export where supported.
- Drum subdivision settings of `1`, `2`, and `3` should toggle and play hits at the expected rhythmic positions.
- WAV import checks should verify valid WAV import, invalid file rejection, imported clip selection, displayed duration metadata, and clear behavior after refresh when imported file persistence is not implemented.
- BPM-aware imported audio checks should verify source BPM input, equal-BPM unchanged playback, higher/lower project BPM stretch, pitch preservation, and next-playback-only behavior after BPM changes.
- Arrangement placement checks should verify dragging clips into tracks, moving placed clips, deleting placed clips, and playback from `SONG` mode.
- Imported audio clip arrangement checks should verify clear missing-source behavior after refresh until imported file persistence exists.
- Multi-project checks should verify creating, renaming, switching, deleting, refreshing, and imported audio isolation across projects.
- Project dialog checks should verify create, rename, delete, cancel, empty-name validation, duplicate-name handling, focus states, and keyboard submit/cancel behavior where implemented.
- Clip duplication checks should verify duplicating hybrid and audio clips, editing duplicates without mutating sources, no automatic arrangement placement creation, and persistence after refresh.
- Project JSON export/import checks should verify importing as a new local project, preserving clip and arrangement data, reporting missing imported WAV sources, and relinking by matching hash.
- Project bundle export/import checks should verify app-created ZIP import, restored imported WAV playback, persistence after refresh, and clear errors for missing or hash-mismatched bundle entries.
- BPM-aware imported audio export checks should verify exported imported WAV clips match live tempo-synced playback and fail clearly when source BPM or imported bytes are missing.

Use headphones or speakers at a safe volume. Record browser, OS, and device details when reporting audio timing issues.

## Test Integrity

Do not remove tests or checks just to make a task pass. If a test is obsolete, update it with the code change and explain why in the PR.
