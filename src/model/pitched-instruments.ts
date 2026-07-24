import {
  PIANO_ROLL_PITCHES,
  type PitchedInstrumentId,
} from "./drum-clip";

export { DEFAULT_PITCHED_INSTRUMENT_ID } from "./drum-clip";
export type { PitchedInstrumentId } from "./drum-clip";

export interface PitchedInstrumentMeta {
  id: PitchedInstrumentId;
  kind: "sample" | "synth";
  name: string;
  synthPreset?: SynthPresetMeta;
  zones?: readonly SampleZone[];
}

export interface SynthPresetMeta {
  envelope: SynthEnvelopeMeta;
  filter?: SynthFilterMeta;
  filterEnvelope?: SynthFilterEnvelopeMeta;
  oscillator: SynthOscillatorMeta;
}

export interface SynthOscillatorMeta {
  detuneCents?: number;
  gain?: number;
  type: SynthOscillatorType;
}

export type SynthOscillatorType = "sawtooth" | "sine" | "square" | "triangle";

export interface SynthEnvelopeMeta {
  attackSeconds: number;
  releaseSeconds: number;
  sustainGain?: number;
}

export interface SynthFilterMeta {
  frequencyHz: number;
  q?: number;
  type: "highpass" | "lowpass";
}

export interface SynthFilterEnvelopeMeta {
  attackSeconds?: number;
  decaySeconds: number;
  peakFrequencyHz: number;
  sustainFrequencyHz?: number;
}

export interface SampleZone {
  envelope?: SamplerEnvelopeMeta;
  midiNote: number;
  rootMidiNote: number;
  sampleEndSeconds?: number;
  sampleStartSeconds?: number;
  sampleId: string;
  sustain?: SamplerSustainMeta;
}

export interface SamplerSustainMeta {
  crossfadeSeconds?: number;
  loopEndSeconds?: number;
  loopStartSeconds?: number;
  mode: "crossfade-loop" | "forward-loop" | "none";
}

export interface SamplerEnvelopeMeta {
  attackSeconds?: number;
  releaseSeconds?: number;
}

const IOWA_PIANO_SAMPLE_START_SECONDS: Readonly<Record<number, number>> = {
  60: 0.525,
  61: 0.562,
  62: 0.699,
  63: 0.574,
  64: 0.678,
  65: 0.597,
  66: 0.393,
  67: 0.67,
  68: 0.526,
  69: 0.26,
  70: 0.44,
  71: 0.474,
  72: 0.219,
};
const IOWA_PIANO_LOOP_START_SECONDS = 3.4;
const IOWA_PIANO_LOOP_END_SECONDS = 4.8;
const IOWA_PIANO_ENVELOPE = {
  attackSeconds: 0.012,
  releaseSeconds: 0.09,
} as const satisfies SamplerEnvelopeMeta;

export const DEFAULT_SYNTH_PRESET = {
  envelope: {
    attackSeconds: 0.01,
    releaseSeconds: 0.04,
    sustainGain: 1,
  },
  oscillator: {
    gain: 1,
    type: "triangle",
  },
} as const satisfies SynthPresetMeta;

export const DEFAULT_SYNTH_INSTRUMENT = {
  id: "default-synth",
  kind: "synth",
  name: "Default Synth",
  synthPreset: DEFAULT_SYNTH_PRESET,
} as const satisfies PitchedInstrumentMeta;

export const AUDITION_SUB_BASS_INSTRUMENT = {
  id: "audition-sub-bass",
  kind: "synth",
  name: "Audition Sub Bass",
  synthPreset: {
    envelope: {
      attackSeconds: 0.006,
      releaseSeconds: 0.1,
      sustainGain: 0.85,
    },
    filter: {
      frequencyHz: 420,
      q: 0.7,
      type: "lowpass",
    },
    oscillator: {
      gain: 1.1,
      type: "triangle",
    },
  },
} as const satisfies PitchedInstrumentMeta;

export const AUDITION_ACID_LEAD_INSTRUMENT = {
  id: "audition-acid-lead",
  kind: "synth",
  name: "Audition Acid Lead",
  synthPreset: {
    envelope: {
      attackSeconds: 0.002,
      releaseSeconds: 0.045,
      sustainGain: 0.42,
    },
    filter: {
      frequencyHz: 520,
      q: 12,
      type: "lowpass",
    },
    filterEnvelope: {
      attackSeconds: 0.004,
      decaySeconds: 0.16,
      peakFrequencyHz: 4200,
      sustainFrequencyHz: 520,
    },
    oscillator: {
      gain: 0.74,
      type: "sawtooth",
    },
  },
} as const satisfies PitchedInstrumentMeta;

export const AUDITION_SOFT_PAD_INSTRUMENT = {
  id: "audition-soft-pad",
  kind: "synth",
  name: "Audition Soft Pad",
  synthPreset: {
    envelope: {
      attackSeconds: 0.18,
      releaseSeconds: 0.45,
      sustainGain: 0.76,
    },
    filter: {
      frequencyHz: 900,
      q: 0.8,
      type: "lowpass",
    },
    oscillator: {
      gain: 0.62,
      type: "sine",
    },
  },
} as const satisfies PitchedInstrumentMeta;

export const AUDITION_PLUCK_INSTRUMENT = {
  id: "audition-pluck",
  kind: "synth",
  name: "Audition Pluck",
  synthPreset: {
    envelope: {
      attackSeconds: 0.002,
      releaseSeconds: 0.18,
      sustainGain: 0.18,
    },
    filter: {
      frequencyHz: 2600,
      q: 1.2,
      type: "lowpass",
    },
    oscillator: {
      gain: 0.72,
      type: "square",
    },
  },
} as const satisfies PitchedInstrumentMeta;

export const IOWA_PIANO_INSTRUMENT = {
  id: "iowa-piano",
  kind: "sample",
  name: "Iowa Piano",
  zones: PIANO_ROLL_PITCHES.map((pitch) => {
    const sampleStartSeconds =
      IOWA_PIANO_SAMPLE_START_SECONDS[pitch.midiNote] ?? 0;

    return {
      envelope: IOWA_PIANO_ENVELOPE,
      midiNote: pitch.midiNote,
      rootMidiNote: pitch.midiNote,
      sampleStartSeconds,
      sampleId: pitch.sampleId,
      sustain: {
        loopEndSeconds: IOWA_PIANO_LOOP_END_SECONDS,
        loopStartSeconds: IOWA_PIANO_LOOP_START_SECONDS,
        mode: "forward-loop",
      },
    };
  }),
} as const satisfies PitchedInstrumentMeta;

export const PITCHED_INSTRUMENTS = [
  DEFAULT_SYNTH_INSTRUMENT,
  IOWA_PIANO_INSTRUMENT,
  AUDITION_SUB_BASS_INSTRUMENT,
  AUDITION_ACID_LEAD_INSTRUMENT,
  AUDITION_SOFT_PAD_INSTRUMENT,
  AUDITION_PLUCK_INSTRUMENT,
] as const satisfies readonly PitchedInstrumentMeta[];

export function getPitchedInstrument(
  instrumentId: PitchedInstrumentId,
): PitchedInstrumentMeta {
  const instrument = PITCHED_INSTRUMENTS.find(
    (candidate) => candidate.id === instrumentId,
  );

  if (!instrument) {
    throw new Error(`Unknown pitched instrument ID: ${instrumentId}`);
  }

  return instrument;
}

export function getSampleZoneForMidiNote({
  instrument,
  midiNote,
}: {
  instrument: PitchedInstrumentMeta;
  midiNote: number;
}): SampleZone | undefined {
  return instrument.zones?.find((zone) => zone.midiNote === midiNote);
}

export function getSynthPresetForInstrument(
  instrument: PitchedInstrumentMeta,
): SynthPresetMeta {
  return instrument.synthPreset ?? DEFAULT_SYNTH_PRESET;
}
