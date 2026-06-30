# Product Definition

## Product Goal

Build a browser-first mini DAW for creating electronic music with short clips. The app should become a practical music-making tool, not just a demo, while keeping the first milestones narrow enough to implement and verify.

## Target Users

- Electronic music beginners who want a fast browser-based sketchpad.
- Musicians who want to create short loops without installing a desktop DAW.
- Developers and audio experimenters who want a small, understandable Web Audio codebase.

## Core Workflow

1. Open the browser app.
2. Create or select a browser-local project.
3. Create or select a 1-bar clip.
4. Build a clip with drum events and pitched notes, or import a local WAV file as an audio clip.
5. Start loop playback and edit while listening.
6. Place clips on the `SONG` arrangement timeline.
7. Play the arranged timeline to build a larger song.
8. Balance arrangement tracks with basic mixer controls.

## MVP Definition

The MVP is a browser-first 1-bar hybrid clip editor with:

- 16-step drum sequencer.
- Basic piano roll.
- Loop playback.
- Bundled starter samples.
- Later WAV import for user audio clips.
- Basic project JSON and bundle export/import later.
- Serializable project state.

## Non-goals

- Full DAW replacement scope.
- Realtime audio recording.
- VST/plugin support.
- Cloud sync.
- Multiplayer collaboration.
- Advanced mastering tools.
- Desktop packaging before the browser app is useful.

## Success Criteria

- Users can create a short 1-bar loop with drums and pitched notes.
- Playback timing is stable enough for simple electronic music loops.
- Users can place clips on an arrangement timeline and hear the placed clips in song order.
- Users can adjust track and master levels and mute or solo tracks during arrangement playback.
- Users can keep separate songs or sketches as multiple local browser projects.
- Users can move editable projects between browser profiles, with imported WAV files restored through bundle import or relinked by hash.
- Project data can be represented as JSON without runtime audio objects.
- The codebase separates UI rendering, project state, persistence, and audio scheduling.
- Future contributors can pick up feature specs and implement small, reviewable tasks.

## Important Product Principles

- Timing correctness matters.
- React UI must not own exact audio timing.
- Musical time is stored in ticks, not seconds.
- Project data must be serializable.
- Runtime audio objects such as `AudioBuffer` are not stored in project JSON.
- Use CSS Modules for component styles.
- Avoid unnecessary dependencies.
- Prefer small, focused changes.
