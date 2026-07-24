# Feature: 29 Oscillator Synth Instrument Presets

Related issue: #17

## Status

Planned

## Goal

Add a small set of useful oscillator-based synth instrument presets for piano roll notes.

The implementation should create several candidate sounds for user audition, then keep only the user-approved presets in the final app.

## Context

`Default Synth` already uses Web Audio oscillator playback. It is useful because it can sustain notes for their full tick-based duration without relying on WAV sample length or sampler loop metadata.

The project can expand this path into more built-in synth instruments such as basses, leads, or soft pads by combining oscillator type, optional detune, filter, and envelope settings. These should be serializable preset definitions. Runtime `OscillatorNode`, `BiquadFilterNode`, and `GainNode` objects must stay inside the audio engine.

This feature is about oscillator synth presets, not bundled WAV sample instruments. Use "candidate presets" or "audition presets" when discussing temporary sounds to avoid confusing them with audio sample files.

## Scope

Included:

- Define a small serializable synth preset model for built-in oscillator instruments.
- Preserve `Default Synth` behavior.
- Create several temporary oscillator preset candidates during implementation for user audition.
- Let the user listen to the candidates before finalizing names and parameters.
- Keep only user-approved presets in the final UI.
- Add selected presets to the available pitched instrument list.
- Allow selected presets to be added to clips from the existing sidebar instrument picker.
- Play selected preset notes from piano roll `PAT` playback.
- Play selected preset notes from arrangement `SONG` playback.
- Include selected preset notes in arrangement WAV export.
- Add focused tests for preset metadata, instrument lookup, and scheduling/export routing where practical.

Excluded:

- Bundled WAV files for these synth instruments.
- User-created arbitrary synth patch editing.
- Preset browser, patch library, or plugin-style synth editor windows.
- Automation, modulation matrix UI, arpeggiators, or MIDI controller mapping.
- Changes to `Iowa Piano` sampler behavior.
- New third-party synth or DSP dependencies unless the implementation PR gives a clear reason.

## Constraints

- React components must not create or own Web Audio nodes.
- Exact timing remains in the audio engine and scheduler.
- Musical note positions and durations remain stored in ticks.
- Project data must stay serializable.
- Runtime oscillator, filter, gain, and analyser nodes must not be stored in project JSON.
- Temporary audition candidates that the user rejects must be removed before the implementation PR is finalized.
- Keep the first selected preset set small. Prefer quality and usefulness over many similar choices.

## Candidate Audition Flow

The implementation branch may temporarily expose several candidate presets so the user can listen and choose.

Recommended candidate families:

- Bass: stable low-frequency patch using sine or triangle waves.
- Lead: brighter patch using sawtooth or square waves with a short attack.
- Pad or soft keys: slower attack/release patch using sine or triangle waves and filtering.
- Pluck: short envelope patch using square or sawtooth waves.

The final PR should document which candidates were accepted and remove rejected candidates from production UI and model lists.

## Data Model Notes

Built-in synth presets should be represented as serializable metadata, for example:

```ts
export interface SynthPresetMeta {
  envelope: SynthEnvelopeMeta;
  filter?: SynthFilterMeta;
  oscillator: SynthOscillatorMeta;
}

export interface SynthOscillatorMeta {
  type: "sine" | "square" | "sawtooth" | "triangle";
  detuneCents?: number;
  gain?: number;
}
```

Implementation may refine names and fields, but any model semantics must be reflected in `docs/data-model.md`.

## Done when

- A documented serializable synth preset model exists.
- `Default Synth` still works as before.
- User-approved oscillator synth presets appear as available pitched instruments.
- Rejected audition candidates do not appear in the final UI.
- Users can add selected presets to a clip from the sidebar instrument picker.
- Piano roll notes owned by selected presets play in `PAT` playback.
- Arrangement playback includes selected preset notes in `SONG` mode.
- Arrangement WAV export includes selected preset notes.
- Existing sample-based `Iowa Piano` behavior remains intact.

## Verification

Run:

- `npm run typecheck --if-present`
- `npm run lint --if-present`
- `npm run test --if-present`
- `npm run build --if-present`

Manual check:

- Add each selected synth preset to a clip.
- Draw short and long notes for each selected preset.
- Confirm each selected preset has a distinct useful sound.
- Confirm rejected candidates are absent from the final instrument picker.
- Confirm `Default Synth` and `Iowa Piano` still play.
- Confirm `PAT` playback, `SONG` playback, and arrangement WAV export include selected synth preset notes.

## PR notes

- List candidate presets that were auditioned.
- List presets selected for the final app.
- Explain any rejected candidates that were removed.
- Mention that arbitrary synth patch editing is intentionally deferred.
