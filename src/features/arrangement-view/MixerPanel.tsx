import { useState, type CSSProperties } from "react";

import type { MixerLevelSnapshot } from "../../audio";
import {
  DELAY_MAX_FEEDBACK,
  DELAY_MAX_TIME_SECONDS,
  DELAY_MIN_FEEDBACK,
  DELAY_MIN_TIME_SECONDS,
  DISTORTION_MAX_DRIVE,
  DISTORTION_MIN_DRIVE,
  EFFECT_MAX_WET_MIX,
  EFFECT_MIN_WET_MIX,
  FILTER_MAX_FREQUENCY_HZ,
  FILTER_MIN_FREQUENCY_HZ,
  MIXER_MAX_VOLUME_DB,
  MIXER_MIN_VOLUME_DB,
  createTrackEffectState,
  getTrackMixerState,
  normalizeDelayEffectParameters,
  normalizeDistortionEffectParameters,
  normalizeFilterEffectParameters,
  updateTrackEffectState,
  type MasterMixerState,
  type TrackEffectKind,
  type TrackEffectState,
  type TrackMixerState,
} from "../../model";
import styles from "./MixerPanel.module.css";

export interface MixerTrack {
  id: string;
  name: string;
  active: boolean;
}

interface MixerPanelProps {
  masterMixerState: MasterMixerState;
  mixerLevels: MixerLevelSnapshot;
  onMasterVolumeChange: (volumeDb: number) => void;
  onTrackEffectChange: (trackId: string, effectSlot: TrackEffectState) => void;
  onTrackMuteToggle: (trackId: string) => void;
  onTrackSoloToggle: (trackId: string) => void;
  onTrackVolumeChange: (trackId: string, volumeDb: number) => void;
  tracks: readonly MixerTrack[];
  trackMixerStates: readonly TrackMixerState[];
}

interface MixerChannel {
  active: boolean;
  id: string;
  level: number;
  name: string;
  role: "track" | "master";
  state: MasterMixerState | TrackMixerState;
}

const MASTER_CHANNEL_ID = "master";
const FADER_STEP_DB = 1;

export function MixerPanel({
  masterMixerState,
  mixerLevels,
  onMasterVolumeChange,
  onTrackEffectChange,
  onTrackMuteToggle,
  onTrackSoloToggle,
  onTrackVolumeChange,
  tracks,
  trackMixerStates,
}: MixerPanelProps) {
  const [openEffectTrackId, setOpenEffectTrackId] = useState<string | null>(null);
  const mixerChannels: MixerChannel[] = [
    ...tracks.map((track) => ({
      active: track.active,
      id: track.id,
      level: mixerLevels.trackLevels[track.id] ?? 0,
      name: track.name,
      role: "track" as const,
      state: getTrackMixerState(trackMixerStates, track.id),
    })),
    {
      active: true,
      id: MASTER_CHANNEL_ID,
      level: mixerLevels.masterLevel,
      name: "Master",
      role: "master" as const,
      state: masterMixerState,
    },
  ];
  const openEffectChannel = mixerChannels.find(
    (channel) => channel.id === openEffectTrackId && channel.role === "track",
  );
  const openEffectTrackState = openEffectChannel
    ? (openEffectChannel.state as TrackMixerState)
    : null;

  return (
    <section className={styles.mixerPanel} aria-label="Arrangement mixer panel">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MIXER</p>
        </div>
        <p className={styles.statusText}>Live routing / runtime meters</p>
      </header>

      <div className={styles.stripScroller}>
        <div className={styles.stripRow}>
          {mixerChannels.map((channel) => {
            const isTrackChannel = channel.role === "track";
            const trackState = isTrackChannel
              ? (channel.state as TrackMixerState)
              : null;
            const volumeDb = channel.state.volumeDb;

            return (
              <article
                className={`${styles.channelStrip} ${
                  channel.role === "master" ? styles.masterStrip : ""
                } ${channel.active ? "" : styles.inactiveStrip}`}
                key={channel.id}
              >
                <header className={styles.channelHeader}>
                  <span className={styles.trackName}>{channel.name}</span>
                </header>

                <div className={styles.controlsGrid}>
                  <LevelMeter
                    isMuted={trackState?.muted ?? false}
                    level={channel.level}
                  />
                  <label className={styles.faderGroup}>
                    <span className={styles.faderLabel}>Vol</span>
                    <input
                      aria-label={`${channel.name} volume`}
                      className={styles.fader}
                      max={MIXER_MAX_VOLUME_DB}
                      min={MIXER_MIN_VOLUME_DB}
                      onChange={(event) => {
                        const nextVolumeDb = Number(event.currentTarget.value);

                        if (isTrackChannel) {
                          onTrackVolumeChange(channel.id, nextVolumeDb);
                          return;
                        }

                        onMasterVolumeChange(nextVolumeDb);
                      }}
                      step={FADER_STEP_DB}
                      type="range"
                      value={volumeDb}
                    />
                    <span className={styles.volumeValue}>
                      {formatVolumeDb(volumeDb)}
                    </span>
                  </label>
                </div>

                {trackState ? (
                  <div className={styles.toggleRow}>
                    <button
                      aria-label={`Mute ${channel.name}`}
                      aria-pressed={trackState.muted}
                      className={`${styles.toggleButton} ${
                        trackState.muted ? styles.muteActive : ""
                      }`}
                      onClick={() => onTrackMuteToggle(channel.id)}
                      type="button"
                    >
                      M
                    </button>
                    <button
                      aria-label={`Solo ${channel.name}`}
                      aria-pressed={trackState.solo}
                      className={`${styles.toggleButton} ${
                        trackState.solo ? styles.soloActive : ""
                      }`}
                      onClick={() => onTrackSoloToggle(channel.id)}
                      type="button"
                    >
                      S
                    </button>
                  </div>
                ) : (
                  <p className={styles.masterLabel}>MASTER OUT</p>
                )}

                {trackState ? (
                  <EffectSlotControl
                    channelName={channel.name}
                    effectSlot={trackState.effectSlot}
                    isOpen={openEffectTrackId === channel.id}
                    onEffectSelect={(effectSlot) => {
                      onTrackEffectChange(channel.id, effectSlot);
                      setOpenEffectTrackId(
                        effectSlot.kind === "none" ? null : channel.id,
                      );
                    }}
                    onPanelToggle={() =>
                      setOpenEffectTrackId((currentTrackId) =>
                        currentTrackId === channel.id ? null : channel.id,
                      )
                    }
                  />
                ) : (
                  <div className={styles.effectSpacer} aria-hidden="true" />
                )}
              </article>
            );
          })}
        </div>
      </div>

      {openEffectChannel &&
      openEffectTrackState &&
      openEffectTrackState.effectSlot.kind !== "none" ? (
        <EffectParameterPanel
          channelName={openEffectChannel.name}
          effectSlot={openEffectTrackState.effectSlot}
          onClose={() => setOpenEffectTrackId(null)}
          onEffectChange={(effectSlot) =>
            onTrackEffectChange(openEffectChannel.id, effectSlot)
          }
        />
      ) : null}
    </section>
  );
}

function EffectSlotControl({
  channelName,
  effectSlot,
  isOpen,
  onEffectSelect,
  onPanelToggle,
}: {
  channelName: string;
  effectSlot: TrackEffectState;
  isOpen: boolean;
  onEffectSelect: (effectSlot: TrackEffectState) => void;
  onPanelToggle: () => void;
}) {
  return (
    <div className={styles.effectSlotControl}>
      <select
        aria-label={`${channelName} effect type`}
        className={styles.effectSlotSelect}
        onChange={(event) =>
          onEffectSelect(
            createTrackEffectState(event.currentTarget.value as TrackEffectKind),
          )
        }
        value={effectSlot.kind}
      >
        <option value="none">No FX</option>
        <option value="filter">Filter</option>
        <option value="delay">Delay</option>
        <option value="distortion">Distort</option>
      </select>
      <button
        aria-expanded={isOpen}
        aria-label={`Open ${channelName} effect controls`}
        className={styles.effectPanelButton}
        disabled={effectSlot.kind === "none"}
        onClick={onPanelToggle}
        type="button"
      >
        ...
      </button>
    </div>
  );
}

function EffectParameterPanel({
  channelName,
  effectSlot,
  onClose,
  onEffectChange,
}: {
  channelName: string;
  effectSlot: TrackEffectState;
  onClose: () => void;
  onEffectChange: (effectSlot: TrackEffectState) => void;
}) {
  return (
    <aside
      aria-label={`${channelName} effect controls`}
      className={styles.effectParameterPanel}
    >
      <header className={styles.effectPanelHeader}>
        <div>
          <p className={styles.effectPanelEyebrow}>{channelName}</p>
          <h3 className={styles.effectPanelTitle}>
            {formatEffectKind(effectSlot.kind)}
          </h3>
        </div>
        <button
          aria-label="Close effect controls"
          className={styles.effectPanelCloseButton}
          onClick={onClose}
          type="button"
        >
          x
        </button>
      </header>

      <label className={styles.effectToggle}>
        <input
          checked={effectSlot.enabled}
          onChange={(event) =>
            onEffectChange(
              updateTrackEffectState(effectSlot, {
                enabled: event.currentTarget.checked,
              }),
            )
          }
          type="checkbox"
        />
        <span>On</span>
      </label>

      {effectSlot.kind === "filter" ? (
        <FilterEffectControls
          effectSlot={effectSlot}
          onEffectChange={onEffectChange}
        />
      ) : null}
      {effectSlot.kind === "delay" ? (
        <DelayEffectControls
          effectSlot={effectSlot}
          onEffectChange={onEffectChange}
        />
      ) : null}
      {effectSlot.kind === "distortion" ? (
        <DistortionEffectControls
          effectSlot={effectSlot}
          onEffectChange={onEffectChange}
        />
      ) : null}
    </aside>
  );
}

function FilterEffectControls({
  effectSlot,
  onEffectChange,
}: {
  effectSlot: TrackEffectState;
  onEffectChange: (effectSlot: TrackEffectState) => void;
}) {
  const parameters = normalizeFilterEffectParameters(effectSlot.parameters);

  return (
    <>
      <label className={styles.effectField}>
        <span className={styles.effectLabel}>Type</span>
        <select
          className={styles.effectSelect}
          onChange={(event) =>
            onEffectChange(
              updateTrackEffectState(effectSlot, {
                parameters: {
                  ...parameters,
                  type:
                    event.currentTarget.value === "highpass"
                      ? "highpass"
                      : "lowpass",
                },
              }),
            )
          }
          value={parameters.type}
        >
          <option value="lowpass">Low</option>
          <option value="highpass">High</option>
        </select>
      </label>
      <EffectRange
        label="Cut"
        max={FILTER_MAX_FREQUENCY_HZ}
        min={FILTER_MIN_FREQUENCY_HZ}
        onChange={(frequencyHz) =>
          onEffectChange(
            updateTrackEffectState(effectSlot, {
              parameters: {
                ...parameters,
                frequencyHz,
              },
            }),
          )
        }
        step={10}
        value={parameters.frequencyHz}
        valueLabel={`${Math.round(parameters.frequencyHz)} Hz`}
      />
    </>
  );
}

function DelayEffectControls({
  effectSlot,
  onEffectChange,
}: {
  effectSlot: TrackEffectState;
  onEffectChange: (effectSlot: TrackEffectState) => void;
}) {
  const parameters = normalizeDelayEffectParameters(effectSlot.parameters);

  return (
    <>
      <EffectRange
        label="Time"
        max={DELAY_MAX_TIME_SECONDS}
        min={DELAY_MIN_TIME_SECONDS}
        onChange={(delayTimeSeconds) =>
          onEffectChange(
            updateTrackEffectState(effectSlot, {
              parameters: {
                ...parameters,
                delayTimeSeconds,
              },
            }),
          )
        }
        step={0.01}
        value={parameters.delayTimeSeconds}
        valueLabel={`${parameters.delayTimeSeconds.toFixed(2)}s`}
      />
      <EffectRange
        label="Fbk"
        max={DELAY_MAX_FEEDBACK}
        min={DELAY_MIN_FEEDBACK}
        onChange={(feedback) =>
          onEffectChange(
            updateTrackEffectState(effectSlot, {
              parameters: {
                ...parameters,
                feedback,
              },
            }),
          )
        }
        step={0.01}
        value={parameters.feedback}
        valueLabel={`${Math.round(parameters.feedback * 100)}%`}
      />
      <EffectRange
        label="Mix"
        max={EFFECT_MAX_WET_MIX}
        min={EFFECT_MIN_WET_MIX}
        onChange={(wetMix) =>
          onEffectChange(
            updateTrackEffectState(effectSlot, {
              parameters: {
                ...parameters,
                wetMix,
              },
            }),
          )
        }
        step={0.01}
        value={parameters.wetMix}
        valueLabel={`${Math.round(parameters.wetMix * 100)}%`}
      />
    </>
  );
}

function DistortionEffectControls({
  effectSlot,
  onEffectChange,
}: {
  effectSlot: TrackEffectState;
  onEffectChange: (effectSlot: TrackEffectState) => void;
}) {
  const parameters = normalizeDistortionEffectParameters(effectSlot.parameters);

  return (
    <>
      <EffectRange
        label="Drive"
        max={DISTORTION_MAX_DRIVE}
        min={DISTORTION_MIN_DRIVE}
        onChange={(drive) =>
          onEffectChange(
            updateTrackEffectState(effectSlot, {
              parameters: {
                ...parameters,
                drive,
              },
            }),
          )
        }
        step={0.1}
        value={parameters.drive}
        valueLabel={parameters.drive.toFixed(1)}
      />
      <EffectRange
        label="Mix"
        max={EFFECT_MAX_WET_MIX}
        min={EFFECT_MIN_WET_MIX}
        onChange={(wetMix) =>
          onEffectChange(
            updateTrackEffectState(effectSlot, {
              parameters: {
                ...parameters,
                wetMix,
              },
            }),
          )
        }
        step={0.01}
        value={parameters.wetMix}
        valueLabel={`${Math.round(parameters.wetMix * 100)}%`}
      />
    </>
  );
}

function EffectRange({
  label,
  max,
  min,
  onChange,
  step,
  value,
  valueLabel,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
  valueLabel: string;
}) {
  return (
    <label className={styles.effectField}>
      <span className={styles.effectLabel}>
        {label}
        <span className={styles.effectValue}>{valueLabel}</span>
      </span>
      <input
        className={styles.effectRange}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function LevelMeter({
  isMuted,
  level,
}: {
  isMuted: boolean;
  level: number;
}) {
  const meterStyle = {
    height: `${Math.round((isMuted ? 0 : level) * 100)}%`,
  } satisfies CSSProperties;

  return (
    <div className={styles.meter} aria-label="Runtime level meter">
      <span className={styles.meterFill} style={meterStyle} />
    </div>
  );
}

function formatVolumeDb(volumeDb: number): string {
  if (volumeDb <= MIXER_MIN_VOLUME_DB) {
    return "-60 dB";
  }

  return `${volumeDb > 0 ? "+" : ""}${volumeDb.toFixed(0)} dB`;
}

function formatEffectKind(effectKind: TrackEffectKind): string {
  if (effectKind === "distortion") {
    return "Distort";
  }

  return effectKind[0]!.toUpperCase() + effectKind.slice(1);
}
