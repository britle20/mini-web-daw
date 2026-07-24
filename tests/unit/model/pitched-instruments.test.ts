import { describe, expect, it } from "vitest";

import {
  AUDITION_ACID_LEAD_INSTRUMENT,
  AUDITION_PLUCK_INSTRUMENT,
  AUDITION_SOFT_PAD_INSTRUMENT,
  AUDITION_SUB_BASS_INSTRUMENT,
  DEFAULT_PITCHED_INSTRUMENT_ID,
  DEFAULT_SYNTH_INSTRUMENT,
  DEFAULT_SYNTH_PRESET,
  IOWA_PIANO_INSTRUMENT,
  PITCHED_INSTRUMENTS,
  getPitchedInstrument,
  getSampleZoneForMidiNote,
  getSynthPresetForInstrument,
} from "../../../src/model";

describe("pitched instruments", () => {
  it("defines Default Synth, audition synths, and Iowa Piano as serializable metadata", () => {
    expect(DEFAULT_PITCHED_INSTRUMENT_ID).toBe("default-synth");
    expect(PITCHED_INSTRUMENTS).toEqual([
      DEFAULT_SYNTH_INSTRUMENT,
      IOWA_PIANO_INSTRUMENT,
      AUDITION_SUB_BASS_INSTRUMENT,
      AUDITION_ACID_LEAD_INSTRUMENT,
      AUDITION_SOFT_PAD_INSTRUMENT,
      AUDITION_PLUCK_INSTRUMENT,
    ]);
    expect(DEFAULT_SYNTH_INSTRUMENT).toEqual({
      id: "default-synth",
      kind: "synth",
      name: "Default Synth",
      synthPreset: DEFAULT_SYNTH_PRESET,
    });
    expect(IOWA_PIANO_INSTRUMENT).toMatchObject({
      id: "iowa-piano",
      kind: "sample",
      name: "Iowa Piano",
    });
  });

  it("maps Iowa Piano MIDI notes to bundled C4 through C5 sample zones", () => {
    expect(IOWA_PIANO_INSTRUMENT.zones).toHaveLength(13);
    const c4Zone = getSampleZoneForMidiNote({
      instrument: IOWA_PIANO_INSTRUMENT,
      midiNote: 60,
    });
    const c5Zone = getSampleZoneForMidiNote({
      instrument: IOWA_PIANO_INSTRUMENT,
      midiNote: 72,
    });

    expect(c4Zone).toMatchObject({
      envelope: {
        attackSeconds: 0.012,
        releaseSeconds: 0.09,
      },
      midiNote: 60,
      rootMidiNote: 60,
      sampleStartSeconds: 0.525,
      sampleId: "iowa-piano-c4",
      sustain: {
        mode: "forward-loop",
      },
    });
    expect(c4Zone?.sustain?.loopStartSeconds).toBeCloseTo(3.4);
    expect(c4Zone?.sustain?.loopEndSeconds).toBeCloseTo(4.8);
    expect(c4Zone).not.toHaveProperty("loopEndSeconds");
    expect(c4Zone).not.toHaveProperty("loopStartSeconds");
    expect(c5Zone).toMatchObject({
      midiNote: 72,
      rootMidiNote: 72,
      sampleStartSeconds: 0.219,
      sampleId: "iowa-piano-c5",
      sustain: {
        mode: "forward-loop",
      },
    });
    expect(c5Zone?.sustain?.loopStartSeconds).toBeCloseTo(3.4);
    expect(c5Zone?.sustain?.loopEndSeconds).toBeCloseTo(4.8);
    expect(c5Zone).not.toHaveProperty("loopEndSeconds");
    expect(c5Zone).not.toHaveProperty("loopStartSeconds");
    expect(
      getSampleZoneForMidiNote({
        instrument: IOWA_PIANO_INSTRUMENT,
        midiNote: 59,
      }),
    ).toBeUndefined();
  });

  it("looks up pitched instruments by ID", () => {
    expect(getPitchedInstrument("default-synth")).toBe(DEFAULT_SYNTH_INSTRUMENT);
    expect(getPitchedInstrument("audition-sub-bass")).toBe(
      AUDITION_SUB_BASS_INSTRUMENT,
    );
    expect(getPitchedInstrument("audition-acid-lead")).toBe(
      AUDITION_ACID_LEAD_INSTRUMENT,
    );
    expect(getPitchedInstrument("audition-soft-pad")).toBe(
      AUDITION_SOFT_PAD_INSTRUMENT,
    );
    expect(getPitchedInstrument("audition-pluck")).toBe(
      AUDITION_PLUCK_INSTRUMENT,
    );
    expect(getPitchedInstrument("iowa-piano")).toBe(IOWA_PIANO_INSTRUMENT);
  });

  it("resolves synth preset metadata for oscillator instruments", () => {
    expect(getSynthPresetForInstrument(DEFAULT_SYNTH_INSTRUMENT)).toEqual({
      envelope: {
        attackSeconds: 0.01,
        releaseSeconds: 0.04,
        sustainGain: 1,
      },
      oscillator: {
        gain: 1,
        type: "triangle",
      },
    });
    expect(getSynthPresetForInstrument(AUDITION_ACID_LEAD_INSTRUMENT)).toMatchObject({
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
    });
  });

  it("keeps pitched instrument metadata JSON serializable", () => {
    expect(JSON.parse(JSON.stringify(PITCHED_INSTRUMENTS))).toEqual(
      PITCHED_INSTRUMENTS,
    );
  });
});
