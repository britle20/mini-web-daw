# Plans

## North Star

Create a browser-first, clip-oriented mini DAW that is useful for making electronic music. The app should favor correct timing, serializable project data, and focused workflows over broad full-DAW scope.

## Current Milestone: Basic Mixer Effects

The current next feature is the first real track-level effects pass for the `SONG` arrangement mixer.

Focus:

- Replace the mixer `FX: None` placeholder with one functional insert effect slot per track.
- Start with a small Web Audio-native effect set: Filter, Delay, and Distortion.
- Keep effect settings serializable and runtime Web Audio nodes out of project JSON.
- Keep live `SONG` playback and arrangement WAV export behavior aligned where practical.

## Active Issue Order

1. #1 Basic mixer effects -> `docs/features/23-basic-mixer-effects.md`
2. #4 Custom project management dialogs -> `docs/features/24-custom-project-management-dialogs.md`
3. #3 Clip duplication -> `docs/features/25-clip-duplication.md`

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

## Planned Milestones

1. Project JSON export/import.
2. Browser-driven smoke tests with Playwright or an equivalent e2e tool.
3. Broader manual/audio QA pass before treating the prototype as a stable release.

## Backlog

- Keyboard shortcuts for transport and editing.
- Basic undo and redo.
- Velocity editing for drum and note events.
- Starter project template.
- Metronome.
- Quantize utilities.
- Swing or groove timing after strict timing is reliable.
- MIDI file import or export.
- Improved sampler sustain authoring and tuning UI.
- More complete effect slots and effect parameter persistence.

## Frozen / Not Now

- Realtime audio recording.
- VST/plugin support.
- Cloud sync.
- Multiplayer collaboration.
- Advanced audio mastering.
- Full DAW replacement scope.
