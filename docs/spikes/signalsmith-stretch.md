# Spike: Signalsmith Stretch

## Purpose

Evaluate whether `signalsmith-stretch` can support pitch-preserving tempo sync for imported WAV audio clips in the browser app.

## Outcome

The local spike confirmed that `signalsmith-stretch` can produce the desired pitch-preserving stretch sound for manual WAV playback in the browser.

The tested rate formula was:

```text
stretchRate = projectBpm / sourceBpm
```

With `semitones = 0`, the preview could make imported audio faster or slower while keeping pitch close to the original.

## Product Implication

The library is a viable candidate for BPM-aware imported audio playback. Production integration should be done through the audio engine, not directly from React components.

If adopted, `signalsmith-stretch` becomes a justified production dependency because the Web Audio API does not provide high-quality pitch-preserving time stretching natively.

## Known Limitations

- The spike tested manual file playback, not full arrangement integration.
- It did not test multiple simultaneous stretched clips.
- It did not test `OfflineAudioContext`.
- Tight AudioWorklet start scheduling could occasionally fail to advance playback. Production code should use a conservative schedule lead time or retry behavior.
- The spike did not add source BPM metadata to the real project model.

## Follow-up Features

- `docs/features/27-bpm-aware-imported-audio-playback.md`
- `docs/features/28-bpm-aware-imported-audio-wav-export.md`
