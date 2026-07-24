# Plans

## North Star

Create a browser-first, clip-oriented mini DAW that is useful for making electronic music. The app should favor correct timing, serializable project data, and focused workflows over broad full-DAW scope.

## Current Milestone: Editing Foundations

The current queue is focused on expanding editing tools and making arrangement-level structure more usable.

Focus:

- Add useful oscillator-based synth instrument presets through an audition-and-select workflow.
- Add multi-note piano roll editing so short phrases can be moved, deleted, and copied as groups.
- Add multi-clip arrangement editing so song sections can be moved, deleted, and copied as groups.
- Add undo/redo history before editing operations become too easy to lose.
- Add velocity editing for drum and piano roll events.
- Add non-destructive trim and fade editing for placed arrangement clips.
- Add arrangement track management for creating, renaming, deleting, and reordering tracks.
- Keep synth preset metadata serializable and runtime Web Audio nodes inside the audio engine.

## Active Issue Order

1. #17 Add oscillator synth instrument presets -> `docs/features/29-oscillator-synth-instrument-presets.md`
2. #19 Add piano roll multi-note selection and editing -> `docs/features/30-piano-roll-multi-note-editing.md`
3. #20 Add arrangement multi-clip selection and clipboard editing -> `docs/features/31-arrangement-multi-clip-editing.md`
4. #22 Add undo and redo history -> `docs/features/32-undo-redo-history.md`
5. #21 Add velocity editing for drum and piano roll events -> `docs/features/33-velocity-editing.md`
6. #23 Add clip trim and fade editing -> `docs/features/34-clip-trim-and-fade.md`
7. #24 Add arrangement track management -> `docs/features/35-track-management.md`

When new work is needed, create or update a feature spec under `docs/features/`, create a linked GitHub Issue, and add that issue here in priority order.

## Completed Milestones

1. Project scaffold.
2. AudioContext and sample playback.
3. Lookahead scheduler.
4. Drum step sequencer.
5. Basic piano roll.
6. Transport pause/resume and editor playhead.
7. Pitched instrument selection and Iowa Piano one-shot playback.
8. Tempo control and live BPM updates.
9. Arrangement view UI shell.
10. Sampler advanced sustain.
11. Sidebar clip and instrument management.
12. Drum step subdivisions.
13. Arrangement mixer panel UI shell.
14. Hybrid clip loop playback.
15. WAV file import as audio clip.
16. Arrangement clip placement and playback.
17. Mixer audio routing and track controls.
18. IndexedDB project persistence.
19. Variable hybrid clip length.
20. Adjustable arrangement length.
21. Arrangement WAV export.
22. Multi-project management.
23. Basic mixer effects.

## Planned Milestones

1. Browser-driven smoke tests with Playwright or an equivalent e2e tool.
2. Broader manual/audio QA pass before treating the prototype as a stable release.

## Backlog

- Keyboard shortcuts for transport and editing.
- Advanced piano roll commands such as transpose, nudge, duplicate, repeat, and group resize.
- Advanced arrangement commands such as time selection editing, persistent clip groups, split, stretch, consolidate, and duplicate shortcuts.
- Starter project template.
- Metronome.
- Quantize utilities.
- Swing or groove timing after strict timing is reliable.
- MIDI file import or export.
- Improved sampler sustain authoring and tuning UI.
- User-created synth patch editing.
- More complete effect slots and effect parameter persistence.

## Frozen / Not Now

- Realtime audio recording.
- VST/plugin support.
- Cloud sync.
- Multiplayer collaboration.
- Advanced audio mastering.
- Full DAW replacement scope.
