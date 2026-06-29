# Audio Engine

## Responsibilities

- Manage `AudioContext` lifecycle.
- Load and decode sample assets.
- Play one-shot samples.
- Convert tick positions to audio time using tempo and PPQ.
- Schedule sequenced playback with a lookahead scheduler.
- Track transport state such as stopped, playing, paused, tempo, loop range, and playhead position.
- Expose a small typed API to the UI.

## Non-responsibilities

- Rendering React components.
- Owning project JSON persistence.
- Storing serializable project state.
- Handling visual layout.
- Implementing a full DAW mixer during early clip-editor milestones.

## AudioContext Lifecycle

Create the `AudioContext` in response to a user gesture when possible. Provide explicit start/resume and stop/suspend behavior. Browser autoplay policies mean audio setup must tolerate a suspended context until the user interacts.

The app should have one primary audio engine instance for normal playback.

## Sample Loading and Decoding

Bundled sample files should be fetched as array buffers, decoded with `AudioContext.decodeAudioData`, and stored in a runtime cache keyed by `sampleId`.

Decoded sample data is not serializable project data. Project JSON stores sample metadata and stable references only.

In the browser implementation, decoded buffers should live in the audio engine runtime cache, not in React state or project data. UI code should trigger loading through the typed audio engine API and may display loaded sample IDs or context state returned by that API.

Imported WAV files should follow the same runtime rule. The file picker may provide a `File` or `Blob`, but the audio engine should only keep decoded buffers in a runtime cache keyed by a stable imported sample ID. Project JSON stores metadata such as file name, MIME type, and duration, not the `File`, `Blob`, object URL, or `AudioBuffer`.

IndexedDB persistence may store imported file bytes outside project JSON. After restore, the app passes those persistent blobs back through the audio engine's typed import API so decoded buffers can be rebuilt on demand. The audio engine should not depend on IndexedDB directly. If project metadata references an imported sample whose bytes are unavailable, the engine or feature orchestration should fail clearly instead of silently skipping playback.

## Imported Audio Clip Playback

Imported audio clips are source-media clips, not pitched instruments.

The first imported WAV implementation may support a simple preview or clip playback path:

- Decode the selected WAV after a user gesture.
- Store the decoded `AudioBuffer` in the runtime sample cache.
- Use `AudioBuffer.duration` to populate serializable duration metadata.
- Create a new `AudioBufferSourceNode` for each preview or scheduled playback.
- Schedule playback against `AudioContext.currentTime`.
- Stop active imported audio sources on transport stop or when switching away if required by the UI.

Imported audio clip duration is source media duration in seconds. Future arrangement placement should convert arrangement positions and visible instance lengths to ticks, while source offsets remain sample-local seconds. Without a time-stretching feature, resizing an audio clip instance should trim/crop playback or extend silence rather than stretch the audio to a new musical duration.

## Arrangement Playback

`PAT` mode playback targets the selected clip editor. `SONG` mode playback should target placed `ClipInstance` objects on the arrangement timeline.

Arrangement playback should:

- Read serializable clip instances from project or app model state.
- Convert arrangement tick positions to `AudioContext.currentTime` scheduling times.
- Expand hybrid clip drum events to `clipInstance.startTick + drumEvent.startTick`.
- Expand hybrid clip note events to `clipInstance.startTick + noteEvent.startTick`.
- Schedule audio clips at `clipInstance.startTick` when their runtime sample data is available.
- Respect `clipInstance.lengthTicks` as the visible and playable duration boundary.
- Keep play, pause, resume, and stop behavior separate from React render timing.

Arrangement playback derives its outer bounds from arrangement state, specifically `arrangementLengthBars` and the normalized loop range. Avoid reintroducing fixed 16-bar playback assumptions.

The current first pass reuses the existing lookahead loop scheduler for `SONG` mode by setting a loop range that covers the visible arrangement. This keeps scheduling independent from React and enables pause/resume with the existing transport API, but it is not yet a true one-shot linear song transport. A later transport task should add non-looping arrangement playback that stops at the arrangement end.

The arrangement view may set loop start and loop end at bar boundaries. `SONG` playback should pass those ticks as the scheduler `loopStartTick` and `loopEndTick`. Selecting clips or instruments in the sidebar while `SONG` mode is playing must not replace the active arrangement scheduler with selected-clip `PAT` events.

Imported audio clips should play at original speed unless a later time-stretching feature explicitly changes that behavior. If an audio clip instance is shorter than the source buffer, playback should be cropped. If the instance is longer than the source buffer, playback may end naturally and leave silence. If runtime file data is missing after refresh, the engine should report a clear missing-source error rather than silently failing.

Arrangement playback still uses the lookahead scheduler. UI drag state, arrangement DOM geometry, visual playheads, decoded buffers, and active source nodes remain runtime-only.

## Offline WAV Export

Arrangement WAV export should use an offline audio rendering path, not the live React UI or visual playhead.

The first export target should be WAV because the browser can produce it from PCM data without a compressed-audio encoder dependency. A predictable first format is stereo 44.1 kHz 16-bit PCM WAV unless implementation constraints justify another choice in the PR.

The current first export pass:

- Renders from arrangement tick 0 through the configured arrangement length.
- Uses the same tick-to-seconds conversion rules as live playback.
- Includes arranged hybrid clip drums, `Default Synth` notes, Iowa Piano sampled notes, imported audio clips, track volume, track mute/solo, and master gain.
- Crops imported audio clip playback to the placed `ClipInstance.lengthTicks`; if the source ends first, the remaining placement renders silence.
- Blocks with a clear error when required imported sample data is missing.
- Avoids mutating live transport state, active source nodes, or decoded runtime caches during rendering.

WAV encoding can be a small utility that converts rendered PCM into a Blob. MP3, FLAC, stem export, cloud export, and mastering processors are separate features.

## Mixer Routing

The first functional mixer should apply to `SONG` arrangement playback. It depends on scheduled sources knowing their arrangement `trackId`.

The audio engine should own the routing graph:

```text
scheduled source
  -> track gain node
  -> optional track meter analyser
  -> master gain node
  -> optional master meter analyser
  -> AudioContext.destination
```

Track gain nodes should be keyed by stable `trackId`. When arrangement playback schedules a drum sample, synth note, sample-based note, or audio clip source, that source should connect to the appropriate track channel instead of directly to the destination.

Mixer settings such as `volumeDb`, `muted`, `solo`, and master `volumeDb` are serializable model data. Web Audio nodes, analyser nodes, meter buffers, active source nodes, and the routing graph are runtime-only audio-engine data.

Use a deterministic mute/solo rule:

```text
anySolo = at least one track has solo = true
trackAudible = (!anySolo || track.solo) && !track.muted
```

If a track is both muted and soloed, muted wins and the track remains silent.

Volume faders should map decibels to linear gain before updating `GainNode.gain`. Prefer a small utility for this conversion so it can be unit tested.

The audio engine should expose a small typed mixer API to the UI or feature orchestration, for example:

```ts
setTrackVolume(trackId, volumeDb)
setTrackMute(trackId, muted)
setTrackSolo(trackId, solo)
setMasterVolume(volumeDb)
getMixerLevels()
```

Implementation names may differ. React components should not hold or mutate Web Audio nodes directly.

Level meters are display feedback only. The UI may poll meter snapshots with `requestAnimationFrame` or subscribe through an audio-engine callback. Meter timing must not drive audio scheduling.

The current browser engine exposes meter snapshots as normalized runtime values from track and master `AnalyserNode` instances. These snapshots are display data only and are not serializable project state.

The first mixer routing path applies to track-aware `SONG` arrangement events. Preview and `PAT` playback may continue using the existing direct playback path unless a later feature explicitly adds clip-editor mixer routing.

## Basic Mixer Effects

Basic mixer effects should extend the existing `SONG` track routing path with one
track insert effect slot.

Recommended live routing shape:

```text
scheduled source
  -> track effect input
  -> optional effect nodes
  -> track gain / mute / solo stage
  -> track meter analyser
  -> master gain
  -> master meter analyser
  -> AudioContext.destination
```

The first effect set should use Web Audio-native nodes and no third-party
runtime dependencies:

- `Filter`: `BiquadFilterNode`, initially low-pass or high-pass.
- `Delay`: `DelayNode`, feedback `GainNode`, and dry/wet gains.
- `Distortion`: `WaveShaperNode` and dry/wet gains.

React components may edit serializable effect state, but they must not create or
own effect nodes. The audio engine should receive normalized effect settings and
own the runtime graph. If an effect is disabled or set to `none`, the track
should bypass effect processing and preserve the dry signal.

Parameter updates during playback should update existing nodes where practical
and avoid obvious clicks. If an implementation rebuilds a track effect graph, it
must disconnect old runtime nodes and avoid leaving stale paths connected.

Arrangement WAV export should apply equivalent effect settings so rendered audio
matches live `SONG` playback where practical. Offline rendering may share pure
graph-building helpers with the browser engine or build equivalent nodes in the
offline context.

## One-shot Sample Playback

Use a new `AudioBufferSourceNode` for every one-shot playback. A source node cannot be restarted after it has played.

Basic one-shot playback should:

- Look up the decoded `AudioBuffer` by `sampleId`.
- Create a source node.
- Connect it to the appropriate destination or gain node.
- Schedule `source.start(when)`.

## Basic Synth Note Playback

The first piano roll playback path may use a simple Web Audio oscillator synth rather than stretching short sample files. This keeps held notes predictable because note duration comes from `durationTicks`.

Basic synth note playback should:

- Convert `midiNote` to oscillator frequency at scheduling time.
- Convert `durationTicks` to seconds using tempo and PPQ.
- Schedule oscillator start and stop against `AudioContext.currentTime`.
- Use a short gain envelope to avoid clicks.
- Treat oscillator nodes and gain nodes as runtime-only objects.

This is not a full sampler instrument. Bundled pitched sample metadata can exist for future sampler work, but the initial held-note behavior should not depend on sample length.

The oscillator instrument should be kept as `Default Synth` when sample-based pitched instruments are added. It is useful as a reliable fallback because it can sustain notes for arbitrary durations without sample loop metadata.

## Sample-based Pitched Playback

Iowa Piano should be a separate pitched instrument from `Default Synth`. It should use the bundled C4-C5 Iowa Piano WAV files when the piano roll note pitch has a matching sample.

Sample-based pitched playback should:

- Look up the selected pitched instrument.
- Map `midiNote` to a sample zone or bundled sample ID.
- Load and decode the sample into the runtime cache.
- Create a new `AudioBufferSourceNode` for each scheduled note.
- Schedule note start against `AudioContext.currentTime`.
- Convert `durationTicks` to seconds from tempo and PPQ.
- Use a gain envelope for attack and release.
- Stop or release active voices when transport stops.

The current Iowa Piano implementation uses the shared sampler sustain path. Iowa Piano zones include explicit `sustain` metadata with forward-loop points and an envelope. If that metadata is valid for the decoded buffer and note duration, the source node uses `loop = true`, `loopStart`, and `loopEnd`. If the metadata is missing, unsupported, or invalid, playback falls back to one-shot sample behavior.

Do not attempt automatic loop point detection in this pass. Loop points are explicit serializable metadata and should be tuned by editing the zone metadata or replacing sample material.

Current Iowa Piano sample zones use explicit `sampleStartSeconds` offsets because the bundled one-second C4-C5 WAV files contain leading silence before the audible note attack. The engine should pass that value as the second argument to `AudioBufferSourceNode.start(when, offset)`.

Current Iowa Piano loop metadata is a pragmatic first pass for the bundled 5-second samples. It uses a late tail loop region so short notes and most 1-bar notes play the natural sample decay without looping, while longer notes can loop the quieter tail instead of repeating the audible attack portion. Some samples may still have weak sustain quality depending on their source material. The engine must reject unsafe loop metadata rather than clamp invalid values into a loop.

The audio engine should load sample zones needed by selected note events before handing them to the lookahead scheduler. If a sample-based instrument has no zone for a note, the engine may fall back to `Default Synth` behavior for that note rather than storing any runtime fallback state in project data.

Each scheduled note event carries an `instrumentId`. The scheduler should play all note events in the selected clip, not only the currently visible piano roll lane, so multiple pitched instruments can sound together.

When `decodeAudioData` cannot decode a bundled PCM WAV file, the browser engine may fall back to a local PCM WAV decoder and create an `AudioBuffer` manually. This fallback is runtime-only and does not change project data.

## Sampler Sustain

Sampler sustain should be a reusable audio-engine capability for sample-based pitched instruments, not an `Iowa Piano` special case.

Sampler sustain should:

- Read serializable sample-zone metadata such as `sampleStartSeconds`, `sampleEndSeconds`, sustain loop mode, loop start/end points, optional crossfade length, and envelope settings.
- Treat sample-local offsets, loop points, and envelope lengths as seconds because they describe positions inside a decoded sample buffer.
- Keep musical event positions and durations in ticks and convert them to seconds only at scheduling time.
- Validate loop metadata before enabling looping.
- Fall back to one-shot sample playback when loop metadata is missing or invalid.
- For one-shot sample playback, complete the release fade before the earlier of note end and the usable sample region end so the buffer does not end abruptly at non-zero gain.
- Apply release behavior at note end, transport pause, and transport stop so sustained voices do not remain stuck.

The first implementation should prefer explicit metadata over automatic analysis. Automatic loop point detection, visual loop point editing, velocity layers, round-robin selection, and full sampler preset management belong in later tasks.

If a zone uses a simple forward loop, the engine may use `AudioBufferSourceNode.loop`, `loopStart`, and `loopEnd`. If a future task adds crossfaded looping, it may need multiple scheduled source nodes and gain ramps because Web Audio buffer source looping does not provide native loop crossfade behavior.

## Lookahead Scheduler Concept

Do not rely on UI timers for exact playback. Sequenced playback should use a timer that wakes frequently, looks ahead by a short scheduling window, and schedules Web Audio events against `AudioContext.currentTime`.

Example terms:

- `lookaheadMs`: how often the scheduler wakes.
- `scheduleAheadTime`: how far into the future audio events are scheduled.
- `nextTick`: next musical tick to inspect.
- `loopStartTick` and `loopEndTick`: musical loop boundaries.

The browser audio engine exposes sample loop playback through a typed API that accepts tick-based sample events, tempo, loop bounds, lookahead cadence, and schedule-ahead time. The scheduler itself is independent from React and can be unit tested without DOM rendering.

The transport API should allow playback to start from a tick offset when resuming from pause. The offset is runtime state only and should be passed as a `startTick` option, not persisted into project data.

## Tick-to-audio-time Conversion

Ticks convert to seconds using tempo and PPQ:

```ts
secondsPerBeat = 60 / tempoBpm;
secondsPerTick = secondsPerBeat / ppq;
seconds = ticks * secondsPerTick;
```

The documented default is PPQ 480. In 4/4, one bar is 1920 ticks and one 16-step grid step is 120 ticks.

Drum step subdivisions still schedule ordinary tick-based `DrumEvent` objects. For a 16-step primary grid, a subdivision of `2` produces 60-tick substeps and a subdivision of `3` produces 40-tick substeps. Once a `DrumEvent.startTick` is produced, the scheduler should not need UI subdivision state to play it accurately.

## Transport State

Transport state should include:

- Playback state: `stopped`, `playing`, or `paused`.
- Tempo in BPM.
- Current tick.
- Audio start time.
- Tick start offset.
- Loop enabled state.
- Loop start and end ticks.

Transport state may be mirrored into React for display, but React render timing must not drive exact audio playback.

Pause and stop have different meanings:

- Pause captures the current runtime playhead tick and stops future scheduling. Resume should continue from that tick.
- Stop clears scheduling and resets the runtime playhead tick to the loop start, which is tick 0 for the M1 1-bar clip.
- The paused playhead position is runtime state only. It should not be written to project JSON.

The audio engine should expose pause separately from stop. A pause operation preserves the scheduler object and its current tick snapshot; a stop operation clears the active loop and returns the transport to the loop start.

## Tempo Control

Tempo is musical project state, not UI-only state. The transport BPM slider should update the current `tempoBpm` value used by audio scheduling.

Tempo changes should follow these rules:

- When stopped, the next playback start uses the current BPM.
- When paused, resume uses the current BPM from the preserved paused tick.
- When playing, BPM changes should affect future lookahead scheduler windows.
- Existing musical event positions stay in ticks. Tempo changes alter tick-to-seconds conversion, not event tick positions.
- React may own the visible slider value, but exact event scheduling must continue to use audio-engine transport state and `AudioContext.currentTime`.

Prefer an audio-engine API that can update active scheduler tempo while preserving the current runtime tick. If the first implementation restarts the selected clip loop from the current tick to apply tempo changes, document the limitation and keep the schedule-ahead window short enough for interactive use.

## Looping Behavior

For M1, pattern loop playback targets the selected hybrid clip. The default loop range is 0 to 1920 ticks for a 1-bar clip, but 2-bar and 4-bar hybrid clips must pass `loopEndTick` as 3840 or 7680 ticks respectively.

Do not hard-code one-bar loop boundaries in the UI or feature orchestration once a clip has a `lengthTicks` value. The audio engine scheduler already accepts tick-based loop boundaries; the caller should provide the active clip length.

Events at the loop start should play when the loop begins. Events at the loop end should belong to the next loop iteration only if explicitly represented there; avoid double-triggering boundary events.

Loop stop clears the scheduler timer and prevents future windows from being scheduled. Events already submitted to Web Audio inside the current schedule-ahead window may still play briefly; keep `scheduleAheadTime` short enough that this limitation remains acceptable for interactive editing.

When the user edits a drum pattern during playback, the UI may update the scheduler's event list without restarting transport. Newly scheduled windows should use the latest serializable drum events. Events already submitted to Web Audio inside the current schedule-ahead window may still reflect the previous pattern because Web Audio scheduled source nodes cannot be unscheduled after `start(when)`.

When the user edits piano roll notes during playback, the UI may update the same selected-clip loop event list with the latest serializable note events. Newly scheduled windows should use the latest note positions and durations. Already scheduled synth voices inside the current schedule-ahead window may briefly reflect the previous note data.

## UI Playhead Separation

UI cursor and playhead animation may use `requestAnimationFrame` and read transport position from the audio engine. Visual playhead timing can be approximate. Exact sound timing must come from scheduled Web Audio events.

The UI may render a vertical playhead over the piano roll or drum sequencer by converting the current runtime tick into editor geometry. The playhead should wrap at the active loop boundary. It is display feedback only; moving or rendering the playhead must not be required for audio events to play on time.

## Future Extension Points

- Sampler instrument.
- Synth instruments.
- More advanced mixer routing such as pan, sends, buses, automation, and recording arm.
- More advanced effects such as reverb, multiple slots, chains, presets, and automation.
- Offline/export rendering later.
