import { describe, expect, it } from "vitest";

import {
  MIXER_DEFAULT_VOLUME_DB,
  MIXER_MAX_VOLUME_DB,
  MIXER_MIN_VOLUME_DB,
  createTrackEffectState,
  clampMixerVolumeDb,
  createDefaultMasterMixerState,
  createDefaultTrackMixerState,
  createDefaultTrackMixerStates,
  decibelsToLinearGain,
  getTrackEffectiveGain,
  getTrackMixerState,
  isTrackMixerAudible,
  normalizeDelayEffectParameters,
  normalizeDistortionEffectParameters,
  normalizeFilterEffectParameters,
  normalizeTrackEffectState,
  normalizeTrackMixerState,
  updateTrackEffectState,
  updateMasterMixerState,
  updateTrackMixerState,
} from "../../../src/model";

describe("mixer model", () => {
  it("creates serializable default mixer states", () => {
    expect(createDefaultTrackMixerState("track-1")).toEqual({
      effectSlot: createTrackEffectState("none"),
      muted: false,
      solo: false,
      trackId: "track-1",
      volumeDb: MIXER_DEFAULT_VOLUME_DB,
    });
    expect(
      createDefaultTrackMixerStates([
        { id: "track-1", name: "Track 1" },
        { id: "track-2", name: "Track 2" },
      ]),
    ).toEqual([
      {
        effectSlot: createTrackEffectState("none"),
        muted: false,
        solo: false,
        trackId: "track-1",
        volumeDb: 0,
      },
      {
        effectSlot: createTrackEffectState("none"),
        muted: false,
        solo: false,
        trackId: "track-2",
        volumeDb: 0,
      },
    ]);
    expect(createDefaultMasterMixerState()).toEqual({ volumeDb: 0 });
  });

  it("clamps fader values and converts decibels to linear gain", () => {
    expect(clampMixerVolumeDb(-120)).toBe(MIXER_MIN_VOLUME_DB);
    expect(clampMixerVolumeDb(12)).toBe(MIXER_MAX_VOLUME_DB);
    expect(clampMixerVolumeDb(Number.NaN)).toBe(MIXER_DEFAULT_VOLUME_DB);
    expect(decibelsToLinearGain(MIXER_MIN_VOLUME_DB)).toBe(0);
    expect(decibelsToLinearGain(0)).toBe(1);
    expect(decibelsToLinearGain(6)).toBeCloseTo(1.995, 3);
  });

  it("updates track and master mixer state without mutating existing state", () => {
    const initialStates = [createDefaultTrackMixerState("track-1")];
    const nextStates = updateTrackMixerState(initialStates, "track-1", {
      muted: true,
      volumeDb: -12,
    });

    expect(initialStates[0]).toEqual(createDefaultTrackMixerState("track-1"));
    expect(nextStates[0]).toMatchObject({
      effectSlot: createTrackEffectState("none"),
      muted: true,
      trackId: "track-1",
      volumeDb: -12,
    });
    expect(
      updateTrackMixerState([], "track-2", {
        solo: true,
        volumeDb: 99,
      }),
    ).toEqual([
      {
        effectSlot: createTrackEffectState("none"),
        muted: false,
        solo: true,
        trackId: "track-2",
        volumeDb: MIXER_MAX_VOLUME_DB,
      },
    ]);
    expect(
      updateMasterMixerState(createDefaultMasterMixerState(), { volumeDb: -99 }),
    ).toEqual({ volumeDb: MIXER_MIN_VOLUME_DB });
  });

  it("preserves track effect state when updating mixer controls", () => {
    const effectSlot = createTrackEffectState("delay");
    const initialStates = [
      {
        ...createDefaultTrackMixerState("track-1"),
        effectSlot,
      },
    ];
    const mutedStates = updateTrackMixerState(initialStates, "track-1", {
      muted: true,
    });
    const soloedStates = updateTrackMixerState(mutedStates, "track-1", {
      solo: true,
    });
    const volumeStates = updateTrackMixerState(soloedStates, "track-1", {
      volumeDb: -6,
    });

    expect(mutedStates[0]).toMatchObject({
      effectSlot,
      muted: true,
    });
    expect(soloedStates[0]).toMatchObject({
      effectSlot,
      solo: true,
    });
    expect(volumeStates[0]).toMatchObject({
      effectSlot,
      volumeDb: -6,
    });
  });

  it("uses deterministic mute and solo audibility rules", () => {
    const trackOne = {
      ...createDefaultTrackMixerState("track-1"),
      solo: true,
    };
    const trackTwo = createDefaultTrackMixerState("track-2");
    const mutedSolo = {
      ...createDefaultTrackMixerState("track-3"),
      muted: true,
      solo: true,
    };
    const allTrackStates = [trackOne, trackTwo, mutedSolo];

    expect(
      isTrackMixerAudible({
        allTrackStates,
        trackState: trackOne,
      }),
    ).toBe(true);
    expect(
      isTrackMixerAudible({
        allTrackStates,
        trackState: trackTwo,
      }),
    ).toBe(false);
    expect(
      isTrackMixerAudible({
        allTrackStates,
        trackState: mutedSolo,
      }),
    ).toBe(false);
    expect(
      getTrackEffectiveGain({
        allTrackStates,
        trackState: mutedSolo,
      }),
    ).toBe(0);
  });

  it("returns a default track mixer state for missing tracks", () => {
    expect(getTrackMixerState([], "track-99")).toEqual(
      createDefaultTrackMixerState("track-99"),
    );
  });

  it("creates and updates serializable track effect state", () => {
    expect(createTrackEffectState("none")).toEqual({
      enabled: false,
      id: "track-insert-1",
      kind: "none",
      parameters: null,
    });
    expect(createTrackEffectState("filter")).toMatchObject({
      enabled: true,
      id: "track-insert-1",
      kind: "filter",
      parameters: {
        frequencyHz: 2400,
        q: 0.7,
        type: "lowpass",
      },
    });

    const delay = createTrackEffectState("delay");
    const disabledDelay = updateTrackEffectState(delay, { enabled: false });

    expect(disabledDelay).toMatchObject({
      enabled: false,
      kind: "delay",
    });
  });

  it("normalizes unsafe effect parameters to supported ranges", () => {
    expect(
      normalizeFilterEffectParameters({
        frequencyHz: 99_999,
        q: -1,
        type: "highpass",
      }),
    ).toEqual({
      frequencyHz: 12_000,
      q: 0.1,
      type: "highpass",
    });
    expect(
      normalizeDelayEffectParameters({
        delayTimeSeconds: 10,
        feedback: 2,
        wetMix: -1,
      }),
    ).toEqual({
      delayTimeSeconds: 1,
      feedback: 0.72,
      wetMix: 0,
    });
    expect(
      normalizeDistortionEffectParameters({
        drive: Number.NaN,
        wetMix: 2,
      }),
    ).toEqual({
      drive: 4,
      wetMix: 1,
    });
  });

  it("normalizes older mixer states without effect slots", () => {
    expect(
      normalizeTrackMixerState({
        muted: true,
        solo: false,
        trackId: "track-1",
        volumeDb: -12,
      }),
    ).toEqual({
      effectSlot: createTrackEffectState("none"),
      muted: true,
      solo: false,
      trackId: "track-1",
      volumeDb: -12,
    });
    expect(normalizeTrackEffectState({ kind: "unknown" })).toEqual(
      createTrackEffectState("none"),
    );
  });
});
