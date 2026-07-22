# Plans

## North Star

Create a browser-first, clip-oriented mini DAW that is useful for making electronic music. The app should favor correct timing, serializable project data, and focused workflows over broad full-DAW scope.

## Current Milestone: BPM-Aware Imported Audio WAV Export

The current next task is to make arrangement WAV export match BPM-aware imported audio playback.

Focus:

- Use imported audio source BPM metadata during arrangement WAV export.
- Preserve pitch while matching `projectBpm / sourceBpm` timing.
- Keep export rendering independent from live transport and React UI state.
- Fail clearly when imported sample bytes, source BPM metadata, or stretch runtime support is missing.

## Active Issue Order

1. #6 BPM-aware imported audio stretch during WAV export -> `docs/features/28-bpm-aware-imported-audio-wav-export.md`

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
