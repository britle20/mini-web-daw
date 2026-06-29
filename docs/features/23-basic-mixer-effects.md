# Feature: 23 Basic Mixer Effects

## Status
Planned

## Goal

Add the first real track-level sound effects to the `SONG` arrangement mixer.

The existing mixer has working volume, mute, solo, master volume, and runtime meters. Its `FX: None` slot should become a compact functional insert slot for simple Web Audio-native effects.

## Context

The mixer panel already belongs to arrangement work. It is the right place for track-level sound shaping because arrangement tracks route scheduled sources through the audio engine mixer.

The first effects feature should stay small. It should not become a plugin host, preset browser, automation system, or advanced mastering tool. It should prove the data model, UI, live Web Audio routing, and offline WAV export path for simple serializable effect settings.

## Scope

Included:

- Add one insert effect slot per arrangement track.
- Support these first effect choices:
  - `None`
  - `Filter`
  - `Delay`
  - `Distortion`
- Add compact mixer strip UI for choosing the effect and editing basic parameters.
- Store effect selection, enabled state, and parameter values as serializable track mixer state.
- Apply enabled effects during live `SONG` arrangement playback.
- Apply the same enabled effects during arrangement WAV export so exported audio matches live playback where practical.
- Keep existing mixer volume, mute, solo, master volume, and meter behavior working with effects enabled.
- Add focused tests for effect state defaults, parameter clamping, state updates, and graph helper behavior where practical.
- Update architecture, data model, audio engine, UI, and testing docs.

Excluded:

- `PAT` mode mixer effects.
- Multiple effect slots per track.
- Arbitrary effect chains or reordering.
- Reverb or convolution effects.
- Send/return effects, buses, groups, sidechain routing, pan, or automation.
- Effect presets.
- Plugin hosting, VST support, AudioWorklet processors, or third-party audio dependencies.
- Large visual effect editors.

## Constraints

- React components must not create, own, or mutate Web Audio nodes directly.
- Runtime effect nodes such as `BiquadFilterNode`, `DelayNode`, `GainNode`, and `WaveShaperNode` must not be stored in project JSON.
- Project data should store only effect type, enabled state, and serializable parameter values.
- Effect parameters should be clamped to safe ranges before reaching the audio engine.
- Delay feedback must stay below runaway values.
- Effects should apply to track-aware `SONG` arrangement playback only.
- Do not introduce production dependencies unless the implementation PR explicitly justifies them.

## Data Model Notes

Extend track mixer state with one serializable insert effect slot.

Illustrative shape:

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

export interface TrackMixerState {
  trackId: string;
  volumeDb: number;
  muted: boolean;
  solo: boolean;
  effectSlot: TrackEffectState;
}
```

Recommended first parameters:

```ts
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
```

Default values should be conservative and musical:

- `None`: `enabled: false`, `parameters: null`.
- `Filter`: low-pass, moderate cutoff, low resonance.
- `Delay`: short delay, feedback below runaway range, partial wet mix.
- `Distortion`: mild drive, partial wet mix.

Existing persisted projects without `effectSlot` should migrate to the `None` default.

## Audio Engine Notes

The audio engine owns the runtime effect graph.

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

When the effect kind is `None` or disabled, the track should bypass effect processing and preserve the dry signal.

Effect implementation notes:

- `Filter` can use `BiquadFilterNode`.
- `Delay` can use `DelayNode`, feedback `GainNode`, and dry/wet gains.
- `Distortion` can use `WaveShaperNode` plus dry/wet gains.
- Parameter changes during playback should update the existing graph where practical and avoid obvious clicks.
- If rebuilding a track effect graph is simpler for the first implementation, it must not leave old nodes connected or active.

Offline WAV export should use equivalent effect settings. It may share pure graph-building helpers with the live engine or implement an offline-specific equivalent, as long as runtime nodes remain outside project JSON.

## UI Notes

Use the existing mixer strip effect slot area.

The first UI may be compact:

- Effect select: `None`, `Filter`, `Delay`, `Distortion`.
- Enable/bypass toggle if the effect kind is not `None`.
- One or two primary controls per effect.

Suggested controls:

- `Filter`: type, cutoff.
- `Delay`: time, feedback, mix.
- `Distortion`: drive, mix.

Avoid full-screen editors or modal effect windows in this first pass. The mixer should remain dense and arrangement-focused.

## Done when

- Each track mixer strip can choose `None`, `Filter`, `Delay`, or `Distortion`.
- Effect settings are serializable and persist across refresh and project switching.
- Enabling `Filter` audibly changes only that track during `SONG` playback.
- Enabling `Delay` produces controlled echoes without runaway feedback.
- Enabling `Distortion` changes only that track and can be bypassed.
- Track faders, mute, solo, master volume, and meters still work with effects enabled.
- Arrangement WAV export includes effect processing or the implementation documents a clear unsupported-export limitation.
- Runtime Web Audio nodes remain inside the audio engine or offline renderer.
- Existing projects without effect settings migrate to safe defaults.
- Relevant tests and docs are updated.

## Verification

Run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

Manual check:

- Place clips on at least two arrangement tracks.
- Enable `Filter` on one track and confirm only that track changes sound.
- Enable `Delay` on one track and confirm repeats are audible and feedback remains controlled.
- Enable `Distortion` on one track and confirm the affected track changes sound.
- Toggle effects off and confirm the dry signal returns.
- Confirm mute, solo, track faders, master fader, and meters still behave correctly.
- Refresh the browser and confirm effect settings restore.
- Switch projects and confirm effect settings remain project-local.
- Export WAV and confirm the render reflects effect settings if export support is included.

## PR notes

- Reference issue #1.
- Explain the serializable effect state shape.
- Explain the live routing graph and any graph rebuild behavior.
- Explain how offline WAV export handles effects.
- Mention deferred items: multiple slots, chains, automation, presets, sends, buses, reverb, and plugins.
