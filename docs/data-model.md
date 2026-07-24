# Data Model

## Tick-based Time Model

Store musical time in ticks, not seconds. The recommended default PPQ is 480 pulses per quarter note.

For 4/4:

- 1 beat = 480 ticks.
- 1 bar = 1920 ticks.
- 2 bars = 3840 ticks.
- 4 bars = 7680 ticks.
- 16-step grid step = 120 ticks.

Seconds are derived at playback time from ticks and tempo. Do not store seconds as the primary event position.

## Tempo

Project tempo should be represented as serializable BPM data, using a field such as `tempoBpm` on the project or current app-level project state until full persistence exists.

Changing tempo must not rewrite clip event positions. Drum events and note events keep their `startTick` and `durationTicks`; the audio engine converts those ticks to seconds using the current `tempoBpm` at scheduling time.

The initial transport UI range is 60 to 180 BPM. Implementations should validate or clamp tempo values before passing them to scheduler or tick/time conversion utilities.

## Core Entities

- `Project`: top-level serializable project document.
- `ProjectSummary`: lightweight local project list item.
- `ProjectCollectionState`: browser-local project collection metadata such as the active project ID.
- `Track`: a stable arrangement lane that can contain clip instances.
- `Clip`: reusable musical content. It may be a hybrid MIDI/drum clip or, later, an imported audio clip.
- `ClipInstance`: placement of a clip on a track in arrangement time.
- `AudioClip`: reusable clip content that references imported audio metadata.
- `DrumEvent`: drum hit inside a clip.
- `NoteEvent`: pitched note inside a clip.
- `SampleMeta`: serializable metadata for a sample.
- `PitchedInstrumentMeta`: serializable metadata for a pitched instrument.
- `TrackMixerState`: serializable track mixer settings when real mixer routing exists.
- `MasterMixerState`: serializable master output settings when real mixer routing exists.

## Project Collection

The app supports multiple browser-local projects through IndexedDB project
documents plus separate collection metadata.

`Project` remains the serializable document for one song or sketch. Each project should have a stable ID and contain the musical data already documented in this file: clips, arrangement tracks, clip instances, arrangement length, loop range, sample metadata, tempo, mixer settings, and related project fields.

Project collection metadata should be stored separately from individual project documents:

```ts
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectCollectionState {
  activeProjectId: string;
  projects: ProjectSummary[];
}
```

The current implementation keeps one active project in memory at a time. The
active project ID is serializable browser-local state so a refresh restores the
last selected project.

Imported sample blobs are not project JSON. Imported blob records are scoped to
the owning project so two projects can safely have the same local `sampleId`.
The first implementation stores imported blobs in a project-scoped IndexedDB
store keyed by a composite ID such as `${projectId}::${sampleId}` and also keeps
the `projectId` on the record for deletion by project.

Project file export/import should preserve sample IDs inside the exported project. If the imported project's `projectId` collides with a local project, the app may assign a new local project ID while leaving internal clip IDs and sample IDs unchanged.

Switching projects should not mutate the outgoing project document except for an intentional save or autosave flush. Runtime UI selection, decoded sample caches, active source nodes, transport state, and audio preview state should be reset or rebuilt for the newly active project.

Undo and redo history should be treated as runtime editor state for the first implementation. History entries may contain bounded snapshots or patches of serializable project/app model state, but the history stack itself should not be stored in project JSON or IndexedDB. Runtime audio objects, decoded buffers, scheduled nodes, meters, DOM geometry, pointer state, and active transport state must not be stored in history entries.

## Hybrid Clips

Early clips may contain both drum events and note events. This keeps the M1 editor focused: one clip can hold a drum pattern and a piano roll phrase.

Later, the model can evolve toward separate drum, MIDI, and audio clip types if arrangement and editing workflows need stronger separation.

Hybrid clip length is represented as `lengthTicks`. Supported M1 lengths are 1, 2, and 4 bars: 1920, 3840, or 7680 ticks. Event positions and note durations remain tick-based and must stay inside the clip length.

Editor grids derive from `lengthTicks`. Drum sequencing uses 16 primary steps per bar, so 1, 2, and 4 bar clips expose 16, 32, and 64 primary drum steps. Piano roll editing uses 32 columns per bar, so 1, 2, and 4 bar clips expose 32, 64, and 128 columns.

Shortening a hybrid clip must not silently drop data. The UI should require confirmation before deleting drum events outside the new length or trimming note durations that extend beyond the new end tick.

Imported WAV files should use a separate audio clip shape rather than forcing audio file state into the M1 hybrid clip fields.

## Mixer State

The first arrangement mixer panel should be a UI shell and may keep fader, mute, solo, meter, and effect-slot values as local or mock UI state.

Do not silently introduce persisted mixer semantics in a UI-only feature. When mixer routing is implemented, track and master mixer state should become serializable project data or serializable app-model data while runtime audio objects remain outside project JSON.

The first functional mixer implementation keeps track mixer settings as app-model state keyed by `trackId`, with a separate master mixer state. This remains serializable and can move into the future persisted `Project` shape without storing Web Audio nodes.

Recommended first mixer state:

```ts
export interface TrackMixerState {
  trackId: string;
  volumeDb: number;
  muted: boolean;
  solo: boolean;
  effectSlot: TrackEffectState;
}

export interface MasterMixerState {
  volumeDb: number;
}
```

Default values should be `volumeDb: 0`, `muted: false`, `solo: false`, and master `volumeDb: 0`.

The first fader range is `-60 dB` to `+6 dB`. `-60 dB` is treated as silent for practical gain calculation.

Use a simple, testable solo rule:

```text
anySolo = at least one track has solo = true
trackAudible = (!anySolo || track.solo) && !track.muted
```

If a track is both muted and soloed, muted wins and the track remains silent.

`GainNode`, `AnalyserNode`, effect nodes, meter buffers, and active routing graphs are runtime-only audio-engine data. Project JSON should store only settings and stable IDs. Level meter values are runtime display data and should not be persisted.

The basic mixer effects feature should introduce one serializable track insert
effect slot. The slot stores effect kind, enabled state, and parameter values;
it does not store Web Audio nodes.

Illustrative first effect state:

```ts
export type TrackEffectKind = "none" | "filter" | "delay" | "distortion";

export interface TrackEffectState {
  id: "track-insert-1";
  kind: TrackEffectKind;
  enabled: boolean;
  parameters:
    | FilterEffectParameters
    | DelayEffectParameters
    | DistortionEffectParameters
    | null;
}
```

Existing projects that do not have effect state should migrate to a disabled
`none` slot. Multiple slots, effect chains, sends, automation, and presets are
separate features.

## M1 Clip Collection and Sidebar Membership

The M1 browser app should maintain an ordered collection of reusable hybrid clips. This may live in app-level project state before full export/import exists, but the data itself should be serializable and compatible with the future `Project.clips` field.

Runtime UI selection, such as `selectedClipId` and the selected sidebar item, may remain app state. The clip list, clip names, drum lane settings, pitched instrument membership, drum events, and note events should be serializable.

Every hybrid clip has a mandatory `Drums` child item in the sidebar. The `Drums` item represents the clip's `drumLanes` and `drumEvents`; it is not stored as a pitched instrument and should not be removable in the first sidebar management feature.

New clips start with only the mandatory `Drums` child item. Pitched instruments such as `Default Synth` and `Iowa Piano` are added explicitly and then stored in `pitchedInstrumentIds`.

Pitched instruments that are available inside a clip should be stored by serializable ID, for example:

```ts
export interface HybridClip {
  id: string;
  kind: "hybrid";
  name: string;
  lengthTicks: Tick;
  drumStepSubdivision: 1 | 2 | 3;
  drumLanes: DrumLaneDefinition[];
  drumEvents: DrumEvent[];
  pitchedInstrumentIds: string[];
  noteEvents: NoteEvent[];
}
```

`pitchedInstrumentIds` controls which pitched instrument child items appear under the clip. `NoteEvent.instrumentId` still owns each note, so multiple pitched instruments can coexist inside one hybrid clip and play together.

The first sidebar management implementation allows a clip to have zero pitched instruments. When this happens, the piano roll should display `-` as the instrument name and avoid creating pitched notes until an instrument is added.

Deleting a pitched instrument from a clip must deliberately handle notes owned by that instrument. Prefer requiring confirmation before deleting those notes. If confirmation UI is not available, disable deletion while owned notes exist and make the reason clear.

## Clip Duplication

Duplicating a clip creates a new reusable source clip. It should not create or mutate arrangement `ClipInstance` objects.

Hybrid clip duplication should deep-copy serializable musical content while assigning a new stable clip ID:

- `lengthTicks`.
- `drumStepSubdivision`.
- ordered `drumLanes`.
- `drumEvents`.
- `pitchedInstrumentIds`.
- `noteEvents`.

Duplicated drum and note events should receive new stable IDs when event IDs are stored. If drum event IDs are deterministic, regenerate them from the duplicated clip ID, lane ID, and start tick.

Audio clip duplication should create a new audio clip record with its own clip ID while sharing the same `sampleId`, source file metadata, and project-scoped imported blob record. Do not duplicate imported media bytes, decoded buffers, object URLs, or `AudioBuffer` instances.

Arrangement placements remain separate. Existing `ClipInstance` records should continue to reference the original source clip unless the user explicitly places the duplicate later.

## Imported Audio Clips

Imported WAV files should create audio clips that reference serializable sample metadata.

The model should keep these concepts separate:

- Source media metadata: file name, MIME type, display name, duration, byte length, content hash, source BPM, and stable sample ID.
- Clip identity: the reusable audio clip shown in the sidebar.
- Runtime media data: `File`, `Blob`, object URL, decoded `AudioBuffer`, and active source nodes.
- Future arrangement placement: where a clip instance appears in song time and how long that instance lasts.

Imported file bytes and decoded sample data are not project JSON. IndexedDB persistence stores imported blobs outside the project document and connects them back through stable sample IDs. If a JSON-only project import does not include the source WAV bytes, imported audio clips should show a missing-source state until the user relinks matching WAV files.

The IndexedDB persistence implementation stores each project document separately
from imported sample blobs. The project document may include clips, arrangement
tracks, clip instances, loop range, sample metadata, tempo, track mixer state,
and master mixer state. Imported sample blobs are stored in a project-scoped blob
store and are not embedded inside the project document.

Illustrative shape:

```ts
export interface AudioClip {
  id: string;
  kind: "audio";
  name: string;
  sampleId: string;
  sourceFileName: string;
  durationSeconds: number;
}
```

`durationSeconds` describes the source media. It is acceptable here because it is not a musical event position. Arrangement positions and clip instance lengths should still use ticks.

Imported sample metadata should include stable file identity fields when available. `contentHashSha256` identifies the WAV bytes, not decoded audio data.

BPM-aware imported audio playback requires new imported WAV clips to include a user-entered source BPM. Store that value as source media metadata, for example `sourceBpm` on imported sample metadata. The app should not try to infer BPM automatically in the first implementation.

`sourceBpm` is serializable metadata about the source file's intended tempo. It is not an event position, and it does not replace tick-based arrangement placement. Playback derives a stretch rate from `project.tempoBpm / sourceBpm` at scheduling time.

Illustrative shape:

```ts
export interface ImportedSampleSource {
  kind: "imported";
  fileName: string;
  mimeType?: string;
  byteLength?: number;
  contentHashSha256?: string;
  sourceBpm?: number;
}
```

Newly imported WAV clips should have `sourceBpm`. Existing or imported project files may still lack it; those clips should show a clear missing-source-BPM state or provide an edit path before tempo-synced playback.

Arrangement clip trim and fade editing should be non-destructive. The arrangement stores trim/fade decisions on `ClipInstance`, for example `lengthTicks`, optional `sourceOffsetSeconds`, `fadeInTicks`, and `fadeOutTicks`, instead of modifying the source clip, imported audio clip, or embedded file. Without a dedicated time-stretching feature, resizing an imported audio clip instance should mean trimming/cropping playback or showing silence after the source ends; it should not imply tempo-matched stretching.

Arrangement multi-clip selection should not change the `ClipInstance` shape. Selected instance IDs, selection marquee geometry, last arrangement edit position, and app-local arrangement clipboard contents are runtime UI state. Copy/paste creates new serializable `ClipInstance` objects with new IDs and references the same source `clipId`; it must not duplicate source clips or store clipboard data in project JSON.

## Project File Export and Import

Project JSON export should serialize editable project data and imported sample metadata, but not imported WAV bytes.

JSON-only import should:

- Create a new browser-local project instead of overwriting the active project.
- Preserve internal clip IDs, arrangement instance IDs, and sample IDs where possible.
- Generate a new local project ID if the exported project ID collides with an existing local project.
- Mark imported samples as missing when no blob is available.

Missing imported samples can be relinked by selecting a local WAV file. The app should compute the selected file's SHA-256 hash and attach the blob to the existing project-scoped `sampleId` when the hash matches `contentHashSha256`. Filename, byte length, and duration are secondary fallback checks for older projects that do not have hash metadata.

Project bundle export should produce an app-owned ZIP file with `project.json` and imported WAV blobs. Recommended entries:

```text
project.json
samples/imported/<sampleId>.wav
```

Bundle import should restore the project document and save each bundled WAV blob under the imported project's local project ID and original `sampleId`. Bundle entries should be verified against `contentHashSha256` when available. Missing or mismatched entries should leave the relevant sample in a missing-source state rather than embedding runtime media in project JSON.

## Arrangement Clip Placement

The arrangement view places reusable clips on tracks using `ClipInstance` objects.

`Clip` owns reusable source content:

- Hybrid clip drum and note events.
- Audio clip source metadata.
- Clip name and source identity.

`ClipInstance` owns song placement:

- Which source clip is placed.
- Which track contains it.
- Where it starts in arrangement ticks.
- How long the placed instance lasts in arrangement ticks.
- Optional source offset for audio clips.
- Optional fade-in and fade-out durations in arrangement ticks.

`ArrangementState` owns arrangement-level song settings such as:

- Total arrangement length in bars.
- Current loop range.

Arrangement length is serializable state represented as `lengthBars`. The first implementation defaults to 16 bars, keeps a minimum of 1 bar, and uses 128 bars as the practical maximum. The arrangement ruler, grid, scroll width, loop bounds, playback bounds, persistence, and export duration should derive from this state.

`ArrangementLoopRange` owns the current song playback loop boundaries:

- Loop start tick.
- Loop end tick.
- Boundaries should snap to 4/4 bar boundaries in the first implementation.

Illustrative shape:

```ts
export interface ClipInstance {
  id: string;
  clipId: string;
  trackId: string;
  startTick: Tick;
  lengthTicks: Tick;
  sourceOffsetSeconds?: number;
  fadeInTicks?: Tick;
  fadeOutTicks?: Tick;
}

export interface ArrangementLoopRange {
  startTick: Tick;
  endTick: Tick;
}

export interface ArrangementState {
  lengthBars: number;
  loopRange: ArrangementLoopRange;
}
```

The first arrangement placement feature should create, move, select, and delete `ClipInstance` objects without mutating the source `Clip`. Deleting a placed clip from the arrangement removes only that instance. It does not delete the sidebar clip.

Deleting a source clip from the sidebar removes that clip and all of its arrangement `ClipInstance` placements. The UI should require confirmation when the source clip has musical events, is an imported audio clip, or has one or more arrangement placements.

The first implementation keeps arrangement length, arrangement tracks, clip instances, and loop range in app-level state. The data is still serializable and should map directly into future `Project.tracks`, `Project.clipInstances`, and arrangement transport fields when export/import is implemented.

When reducing `lengthBars`, clip instances that would extend beyond the new end should not be deleted silently. The first implementation confirms the destructive action and removes out-of-range arrangement placements without trimming source clips.

Default instance lengths:

- Hybrid clip: use the source clip's `lengthTicks`, initially 1920 ticks for a 1-bar clip.
- Audio clip: derive an initial `lengthTicks` from `durationSeconds` and current `tempoBpm` when placed, or use an equivalent helper that keeps arrangement placement tick-based.

Without time stretching, imported audio playback runs at original speed. If an audio clip instance is shorter than the source, playback is cropped. If it is longer than the source, playback may end naturally and leave silence.

Imported WAV clips with valid `sourceBpm` may be pitch-preserving stretched at scheduling time so they follow the project BPM. The source clip and `ClipInstance` still store arrangement positions and lengths in ticks. The runtime audio engine owns decoded buffers and stretch nodes.

Snap and movement should update tick values, not pixel positions. UI geometry is derived from `startTick`, `lengthTicks`, track order, and timeline constants.

Clip-instance trim should not delete source clip events or rewrite imported audio bytes. For hybrid clips, trim limits which drum and note events are visible and playable in the placed instance window. For imported audio clips, start trim may advance `sourceOffsetSeconds`; end trim reduces `lengthTicks`. Fade durations should be stored as tick values on the `ClipInstance` and applied as runtime gain ramps during `SONG` playback and arrangement WAV export.

## Arrangement Track Management

Arrangement tracks are serializable project data. Track order is the order of the `tracks` array, but track identity must come from stable `trackId` values rather than array indexes.

Track rename and reorder operations should preserve `trackId` so existing `ClipInstance.trackId`, mixer settings, effect settings, and playback routing stay attached to the intended track.

Deleting a track with placed clip instances or meaningful mixer/effect state should require explicit confirmation. The first deletion policy is to remove the deleted track and the clip instances owned by that track after confirmation. It should not silently move clip instances to another track.

The app should keep at least one arrangement track available unless a later feature explicitly supports zero-track projects. Runtime mixer nodes and meters for removed tracks must be cleaned up by the audio engine and must not be serialized.

## Bundled Drum Sample Naming and Display

Bundled drum sample files live under `public/samples/drums/`.

Use descriptive `.wav` file names with words separated by underscores, for example:

```text
Fred_Kick_1.wav
Fred_Closed_Hi-Hat.wav
```

The app derives sample metadata from the file name:

- Sample IDs are the file stem lowercased with underscores replaced by hyphens.
- Display names remove `.wav`, replace underscores with spaces, and uppercase the result.

Examples:

- `Fred_Kick_1.wav` -> sample ID `fred-kick-1`, display name `FRED KICK 1`.
- `Fred_Closed_Hi-Hat.wav` -> sample ID `fred-closed-hi-hat`, display name `FRED CLOSED HI-HAT`.

## Initial Drum Clip Implementation

The drum step sequencer stores lane settings and drum hits in the selected hybrid clip. A 16-step-per-bar grid maps step indices to ticks with `stepIndex * 120`; longer clips extend this same mapping across the selected clip length.

The clip stores `drumLanes` as an ordered array. That array controls both visual lane order and the current sample assigned to each lane. Reordering lanes or changing a lane's sample must update serializable clip state, not runtime-only audio state.

Initial drum lanes map to bundled sample IDs:

- `kick` -> `fred-kick-1`
- `snare` -> `fred-snare-1`
- `closedHat` -> `fred-closed-hi-hat`
- `openHat` -> `fred-open-hi-hat`

Drum event IDs are deterministic within a clip using the clip ID, lane ID, and start tick. Runtime playback converts these serializable events into audio engine sample loop events; the project model itself does not store `AudioBuffer` or other Web Audio objects.

When a lane sample changes, existing `DrumEvent` objects for that lane should be updated to the new `sampleId` so playback and project export reflect the visible lane setting.

Drum event velocity is serializable event data. Use a normalized first range of `0` to `1`, where `1` is full event gain and `0` is silent. Editing velocity must not change event timing, lane ID, or sample ID.

## Drum Step Subdivisions

The sequencer may keep the visible `1` through `16` primary step labels while allowing each primary step to split into smaller substeps.

For the first subdivision feature, support clip-level subdivision values `1`, `2`, and `3`:

- `1`: current 16-step behavior.
- `2`: two substeps per primary step.
- `3`: three substeps per primary step.

The primary step length remains 120 ticks. Substep length is derived from the selected subdivision:

```text
substepTicks = 120 / drumStepSubdivision
```

At PPQ 480:

- subdivision `1` -> 120 ticks.
- subdivision `2` -> 60 ticks.
- subdivision `3` -> 40 ticks.

`DrumEvent.startTick` remains the source of truth. UI step indexes are derived from ticks and should not replace tick storage.

A clip may store the selected subdivision as serializable state:

```ts
drumStepSubdivision: 1 | 2 | 3;
```

Changing subdivision should not rewrite existing drum event tick positions. Events that align with the selected subdivision can render as active substeps. Events that do not align with the selected subdivision should be preserved rather than silently deleted.

## Bundled Piano Sample Naming and Display

Bundled pitched instrument samples may live under `public/samples/pitched_instruments/`.

The initial piano roll uses the Iowa Piano sample set under:

```text
public/samples/pitched_instruments/Iowa_Piano/
```

The initial bundled files cover C4 through C5:

```text
C4.wav
Db4.wav
D4.wav
Eb4.wav
E4.wav
F4.wav
Gb4.wav
G4.wav
Ab4.wav
A4.wav
Bb4.wav
B4.wav
C5.wav
```

Sample IDs use the stable prefix `iowa-piano-` plus the lowercased pitch name, for example:

- `C4.wav` -> `iowa-piano-c4`
- `Db4.wav` -> `iowa-piano-db4`

The piano roll uses these files to define the initial C4-C5 pitch range and keep bundled sample metadata available. `Default Synth` remains the oscillator-based fallback instrument, while `Iowa Piano` uses the bundled WAV files for sample-based note playback.

## Pitched Instruments

Pitched instrument selection should distinguish the sound source used for `NoteEvent` playback from the notes themselves.

Initial pitched instrument IDs:

- `default-synth`: oscillator-based playback. It can hold notes for arbitrary durations.
- `iowa-piano`: sample-based playback using bundled Iowa Piano WAV files.

Built-in oscillator instruments use the same pitched instrument list rather than a separate UI concept. They should be represented as serializable synth preset metadata, not as rendered WAV files or runtime Web Audio node objects.

The oscillator preset audition branch currently exposes temporary candidate IDs:

- `audition-sub-bass`.
- `audition-acid-lead`.
- `audition-soft-pad`.
- `audition-pluck`.

These IDs should be treated as review candidates until the user selects which presets belong in the final app.

Instrument selection may start as selected-clip or runtime UI state during early M1 work. If it becomes part of saved project behavior, store only serializable IDs and metadata, not runtime audio objects.

Each `NoteEvent` stores the serializable `instrumentId` that owns that note. This allows multiple pitched instruments, such as `Default Synth` and `Iowa Piano`, to have notes at the same tick and pitch inside one hybrid clip and play simultaneously.

Built-in oscillator synth presets may define oscillator, envelope, and optional filter settings:

```ts
export interface SynthPresetMeta {
  oscillator: SynthOscillatorMeta;
  envelope: SynthEnvelopeMeta;
  filter?: SynthFilterMeta;
}

export interface SynthOscillatorMeta {
  type: "sine" | "square" | "sawtooth" | "triangle";
  detuneCents?: number;
  gain?: number;
}

export interface SynthEnvelopeMeta {
  attackSeconds: number;
  releaseSeconds: number;
  sustainGain?: number;
}

export interface SynthFilterMeta {
  type: "lowpass" | "highpass";
  frequencyHz: number;
  q?: number;
}
```

The exact implementation may refine these fields, but the boundary should stay the same: project data stores serializable preset IDs and numeric parameters; the audio engine creates `OscillatorNode`, `BiquadFilterNode`, and `GainNode` instances at runtime.

Iowa Piano can use sample zones to map MIDI notes to bundled samples and optional sustain loop metadata:

```ts
export interface PitchedInstrumentMeta {
  id: "default-synth" | "iowa-piano" | string;
  name: string;
  kind: "synth" | "sample";
  synthPreset?: SynthPresetMeta;
  zones?: SampleZone[];
}

export interface SynthPresetMeta {
  oscillator: SynthOscillatorMeta;
  envelope: SynthEnvelopeMeta;
  filter?: SynthFilterMeta;
}

export interface SynthOscillatorMeta {
  type: "sine" | "square" | "sawtooth" | "triangle";
  detuneCents?: number;
  gain?: number;
}

export interface SynthEnvelopeMeta {
  attackSeconds: number;
  releaseSeconds: number;
  sustainGain?: number;
}

export interface SynthFilterMeta {
  type: "lowpass" | "highpass";
  frequencyHz: number;
  q?: number;
}

export interface SampleZone {
  sampleId: string;
  midiNote: number;
  rootMidiNote: number;
  sampleStartSeconds?: number;
  sampleEndSeconds?: number;
  sustain?: SamplerSustainMeta;
  envelope?: SamplerEnvelopeMeta;
}

export interface SamplerSustainMeta {
  mode: "none" | "forward-loop" | "crossfade-loop";
  loopStartSeconds?: number;
  loopEndSeconds?: number;
  crossfadeSeconds?: number;
}

export interface SamplerEnvelopeMeta {
  attackSeconds?: number;
  releaseSeconds?: number;
}
```

The `sustain` fields are serializable metadata. They describe how the runtime audio engine may configure sample sustain playback. A simple `forward-loop` mode may map to `AudioBufferSourceNode.loopStart` and `loopEnd`; a future `crossfade-loop` mode may require additional scheduled source nodes and gain ramps.

The `sampleStartSeconds` field skips leading silence before note attack. `sampleEndSeconds`, sustain loop points, crossfade length, and envelope values are sample-local seconds because they describe positions or durations inside a sample, not musical event time.

Current Iowa Piano sample zones include explicit `forward-loop` sustain metadata and basic envelope metadata for the bundled 5-second samples. The loop points use a late tail region so short notes can use the natural sample decay and longer notes avoid repeating the audible note attack. These fields are still serializable sample-zone data only. The runtime audio engine validates them against decoded buffer duration and note duration before enabling `AudioBufferSourceNode.loop`; invalid or unsupported metadata falls back to one-shot sample playback.

## Initial Piano Roll Implementation

The initial piano roll stores note events directly in the selected hybrid clip's `noteEvents` array. Notes are serializable data:

- `midiNote`: MIDI note number, initially C4 through C5.
- `instrumentId`: pitched instrument that owns and plays the note.
- `startTick`: note start position inside the clip.
- `durationTicks`: note length.
- `velocity`: normalized gain from 0 to 1.

The initial visual piano roll grid has 32 columns across the 1-bar clip. At PPQ 480, one bar is 1920 ticks, so one piano roll grid column is 60 ticks. Drum sequencing still uses the 16-step grid where each step is 120 ticks.

The UI may allow left-click or drag creation, dragging existing notes to move pitch/time, and right-click deletion. These interactions must update `noteEvents` in serializable clip state. Runtime audio objects used for synth playback or sample decoding must stay outside project JSON.

Multi-note selection should not change the `NoteEvent` shape. Selected note IDs, selection marquee geometry, last edit position, and app-local note clipboard contents are runtime editor state. Copy/paste creates new serializable `NoteEvent` objects with new IDs; it must not store clipboard data in project JSON.

Note velocity is serializable event data. Editing note velocity should update only `NoteEvent.velocity`; it must not change note timing, pitch, instrument ownership, or duration.

## Illustrative Types

These snippets show model intent. Implementation may refine names and fields, but changes to model semantics must update this document.

```ts
export type Tick = number;

export type Clip = HybridClip | AudioClip;

export interface Project {
  id: string;
  version: number;
  name: string;
  tempoBpm: number;
  timeSignature: {
    numerator: 4;
    denominator: 4;
  };
  ppq: 480;
  arrangement: ArrangementState;
  tracks: Track[];
  clips: Clip[];
  samples: SampleMeta[];
  instruments?: PitchedInstrumentMeta[];
  masterMixer?: MasterMixerState;
}

export interface Track {
  id: string;
  name: string;
  kind: "hybrid" | "drum" | "instrument" | "audio";
  clipInstances: ClipInstance[];
  mixer?: TrackMixerState;
}

export interface HybridClip {
  id: string;
  kind: "hybrid";
  name: string;
  lengthTicks: Tick;
  drumStepSubdivision: 1 | 2 | 3;
  drumLanes: DrumLaneDefinition[];
  drumEvents: DrumEvent[];
  pitchedInstrumentIds: string[];
  noteEvents: NoteEvent[];
}

export interface AudioClip {
  id: string;
  kind: "audio";
  name: string;
  sampleId: string;
  sourceFileName: string;
  durationSeconds: number;
}

export interface DrumLaneDefinition {
  id: "kick" | "snare" | "closedHat" | "openHat";
  label: string;
  sampleId: string;
}

export interface ClipInstance {
  id: string;
  clipId: string;
  trackId: string;
  startTick: Tick;
  lengthTicks: Tick;
  sourceOffsetSeconds?: number;
  fadeInTicks?: Tick;
  fadeOutTicks?: Tick;
}

export interface ArrangementState {
  lengthBars: number;
  loopRange: ArrangementLoopRange;
}

export interface ArrangementLoopRange {
  startTick: Tick;
  endTick: Tick;
}

export interface DrumEvent {
  id: string;
  laneId: "kick" | "snare" | "closedHat" | "openHat" | string;
  startTick: Tick;
  velocity: number;
  sampleId: string;
}

export interface NoteEvent {
  id: string;
  instrumentId: "default-synth" | "iowa-piano" | string;
  midiNote: number;
  startTick: Tick;
  durationTicks: Tick;
  velocity: number;
}

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
    sourceBpm?: number;
  };
}

export interface TrackMixerState {
  trackId: string;
  volumeDb: number;
  muted: boolean;
  solo: boolean;
  effectSlot: TrackEffectState;
}

export interface MasterMixerState {
  volumeDb: number;
}

export type TrackEffectKind = "none" | "filter" | "delay" | "distortion";

export interface TrackEffectState {
  id: "track-insert-1";
  kind: TrackEffectKind;
  enabled: boolean;
  parameters:
    | FilterEffectParameters
    | DelayEffectParameters
    | DistortionEffectParameters
    | null;
}

export interface FilterEffectParameters {
  type: "lowpass" | "highpass";
  frequencyHz: number;
  q: number;
}

export interface DelayEffectParameters {
  delayTimeSeconds: number;
  feedback: number;
  wetMix: number;
}

export interface DistortionEffectParameters {
  drive: number;
  wetMix: number;
}

export interface PitchedInstrumentMeta {
  id: "default-synth" | "iowa-piano" | string;
  name: string;
  kind: "synth" | "sample";
  zones?: SampleZone[];
}

export interface SampleZone {
  sampleId: string;
  midiNote: number;
  rootMidiNote: number;
  sampleStartSeconds?: number;
  sampleEndSeconds?: number;
  sustain?: SamplerSustainMeta;
  envelope?: SamplerEnvelopeMeta;
}

export interface SamplerSustainMeta {
  mode: "none" | "forward-loop" | "crossfade-loop";
  loopStartSeconds?: number;
  loopEndSeconds?: number;
  crossfadeSeconds?: number;
}

export interface SamplerEnvelopeMeta {
  attackSeconds?: number;
  releaseSeconds?: number;
}
```

## Runtime-only Audio Data

`AudioBuffer` and decoded sample data are runtime-only. Project files should reference samples by stable IDs, paths, or metadata. They must not embed `AudioBuffer`, `AudioNode`, object URLs, or decoded sample contents.

Use a runtime sample cache keyed by `sampleId` when playback needs decoded audio.

After restoring an imported audio clip from IndexedDB, the app should decode the stored blob back into the audio engine runtime cache on demand, such as when previewing the clip or starting arrangement playback.

After importing a JSON-only project file, imported audio clips may exist without their blobs. Runtime playback and arrangement export should report missing sample sources clearly until the user relinks matching WAV files or imports a bundle that contains those blobs.
