# Feature: 28 BPM-Aware Imported Audio WAV Export

Related issue: #6

## Status
Planned

## Goal

Make arrangement WAV export render imported audio clips with the same project-BPM-aware, pitch-preserving stretch behavior used during live arrangement playback.

## Context

Arrangement WAV export currently renders imported audio at source speed and crops or leaves silence based on the placed clip instance length. After imported audio live playback becomes BPM-aware, exported WAV files should match what users hear from `SONG` playback.

This requires separate verification because offline rendering may use `OfflineAudioContext`, and the `signalsmith-stretch` AudioWorklet/WASM path must be tested in that context.

## Scope

Included:

- Use imported audio source BPM metadata during arrangement WAV export.
- Calculate export stretch rate as `projectBpm / sourceBpm`, matching live playback.
- Preserve pitch in exported imported audio clips.
- Ensure exported clip timing, clip instance length, loop assumptions, and arrangement duration remain tick-based.
- Verify whether the chosen stretch implementation works in the offline export path.
- If the implementation requires a separate offline stretch adapter, keep it inside the audio/offline-rendering layer.
- Render track volume, mute, solo, master volume, and supported effects consistently with the existing export path.
- Fail clearly when required imported sample bytes, source BPM metadata, or stretch runtime support is unavailable.
- Add focused tests for export planning, duration math, missing metadata errors, and helper logic where practical.
- Update relevant audio engine, data model, export, and testing docs.

Excluded:

- Realtime recording export.
- MP3, FLAC, AAC, or compressed export.
- Automatic BPM detection.
- Manual warp markers or beat-grid editing.
- Live playback changes, which belong to issue #7.
- Stem export.
- Server-side rendering.

## Constraints

- Export must not rely on React timers, visual playheads, or DOM state.
- Export must not mutate live transport state, active source nodes, or runtime playback graph state.
- Project data must remain serializable.
- Runtime stretch nodes, AudioWorklet nodes, decoded buffers, and PCM buffers must not be stored in project JSON.
- Exported audio should be deterministic for the same project, sample data, source BPM, and project BPM where practical.
- Do not silently fall back to unstretched imported audio if BPM-aware export is expected.

## Dependency

This feature should be scheduled after `docs/features/27-bpm-aware-imported-audio-playback.md` because it depends on source BPM metadata and shared stretch-rate semantics.

## Done when

- Arrangement WAV export uses source BPM metadata for imported audio clips.
- Exported imported audio clip speed matches `projectBpm / sourceBpm`.
- Exported pitch remains recognizably preserved when project BPM differs from source BPM.
- Exported WAV timing matches arrangement tick positions and instance lengths.
- Missing source BPM or missing imported sample bytes produce clear export errors.
- If the stretch implementation cannot run in the offline render path, the PR either implements a working alternate path or explicitly blocks export with a clear unsupported-state message and documents the limitation for follow-up.
- Existing hybrid clips, synth notes, Iowa Piano notes, mixer routing, and supported effects continue to export correctly.
- Relevant tests and docs are updated.

## Verification

Run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

Manual check:

- Create an arrangement with an imported WAV loop whose source BPM is known.
- Export at the same project BPM and compare against live playback.
- Export at a higher project BPM and confirm the imported audio is shorter/faster without obvious pitch increase.
- Export at a lower project BPM and confirm the imported audio is longer/slower without obvious pitch decrease.
- Confirm exported clip starts and ends at the expected arrangement positions.
- Confirm export fails clearly if source BPM metadata or imported sample bytes are missing.

## PR notes

- Reference issue #6.
- Explain how the offline render path applies imported audio stretch.
- Explain whether `signalsmith-stretch` works directly with the export path or whether an adapter/fallback was required.
- State clearly if any stretch/export limitation remains.
