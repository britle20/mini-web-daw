import {
  DEFAULT_PPQ,
  TICKS_PER_4_4_BAR,
  audioTimeToTick,
  tickToAudioTime,
  type Tick,
} from "../utils";

export type SchedulerStatus = "stopped" | "playing" | "paused";

export interface TickEvent {
  durationTicks?: Tick;
  id: string;
  scheduleWhenOverlappingStart?: boolean;
  startTick: Tick;
}

export interface ScheduledTickEvent<TEvent extends TickEvent> {
  event: TEvent;
  audioTime: number;
  absoluteTick: Tick;
  loopIteration: number;
  loopTick: Tick;
  tempoBpm: number;
}

export interface SchedulerSnapshot {
  status: SchedulerStatus;
  tempoBpm: number;
  currentTick: Tick;
  loopStartTick: Tick;
  loopEndTick: Tick;
  nextScheduleTick: Tick;
  audioStartTime: number | null;
}

export interface ScheduleWindowOptions<TEvent extends TickEvent> {
  audioStartTime: number;
  events: readonly TEvent[];
  loopEndTick?: Tick;
  loopStartTick?: Tick;
  ppq?: number;
  startTick?: Tick;
  tempoBpm: number;
  windowEndTick: Tick;
  windowStartTick: Tick;
}

export interface LookaheadSchedulerOptions<TEvent extends TickEvent> {
  events: readonly TEvent[];
  getAudioTime: () => number;
  scheduleEvent: (scheduledEvent: ScheduledTickEvent<TEvent>) => void;
  clearIntervalFn?: ClearSchedulerInterval;
  lookaheadMs?: number;
  loopEndTick?: Tick;
  loopStartTick?: Tick;
  ppq?: number;
  scheduleAheadTime?: number;
  setIntervalFn?: SetSchedulerInterval;
  startDelaySeconds?: number;
  tempoBpm: number;
}

export interface StartSchedulerOptions {
  startTick?: Tick;
}

const DEFAULT_LOOKAHEAD_MS = 25;
const DEFAULT_SCHEDULE_AHEAD_TIME = 0.1;

type SchedulerTimerId = ReturnType<typeof globalThis.setInterval>;
type SetSchedulerInterval = (
  handler: () => void,
  timeoutMs: number,
) => SchedulerTimerId;
type ClearSchedulerInterval = (timerId: SchedulerTimerId) => void;

const defaultSetSchedulerInterval: SetSchedulerInterval = (handler, timeoutMs) =>
  globalThis.setInterval(handler, timeoutMs);
const defaultClearSchedulerInterval: ClearSchedulerInterval = (timerId) =>
  globalThis.clearInterval(timerId);

export function collectScheduledEventsForWindow<TEvent extends TickEvent>({
  audioStartTime,
  events,
  loopEndTick = TICKS_PER_4_4_BAR,
  loopStartTick = 0,
  ppq = DEFAULT_PPQ,
  startTick = loopStartTick,
  tempoBpm,
  windowEndTick,
  windowStartTick,
}: ScheduleWindowOptions<TEvent>): ScheduledTickEvent<TEvent>[] {
  validateLoopRange(loopStartTick, loopEndTick);

  if (windowEndTick <= windowStartTick) {
    return [];
  }

  const loopLengthTicks = loopEndTick - loopStartTick;
  const scheduledEvents: ScheduledTickEvent<TEvent>[] = [];

  for (const event of events) {
    if (event.startTick < loopStartTick || event.startTick >= loopEndTick) {
      continue;
    }

    const eventOffsetTicks = event.startTick - loopStartTick;
    const overlappingStartLoopIteration = getOverlappingStartLoopIteration({
      eventDurationTicks: event.durationTicks,
      eventOffsetTicks,
      loopLengthTicks,
      loopStartTick,
      scheduleWhenOverlappingStart: event.scheduleWhenOverlappingStart,
      startTick,
      windowStartTick,
    });

    if (overlappingStartLoopIteration !== null) {
      const absoluteTick =
        loopStartTick +
        overlappingStartLoopIteration * loopLengthTicks +
        eventOffsetTicks;

      scheduledEvents.push(
        createScheduledEvent({
          absoluteTick,
          audioStartTime,
          event,
          loopIteration: overlappingStartLoopIteration,
          ppq,
          startTick,
          tempoBpm,
        }),
      );
    }

    const distanceToWindowStartTicks =
      windowStartTick - loopStartTick - eventOffsetTicks;
    const firstLoopIteration = Math.max(
      0,
      Math.ceil(distanceToWindowStartTicks / loopLengthTicks),
    );
    let loopIteration = firstLoopIteration;

    while (true) {
      const absoluteTick =
        loopStartTick + loopIteration * loopLengthTicks + eventOffsetTicks;

      if (absoluteTick >= windowEndTick) {
        break;
      }

      if (absoluteTick < windowStartTick) {
        loopIteration += 1;
        continue;
      }

      scheduledEvents.push(
        createScheduledEvent({
          absoluteTick,
          audioStartTime,
          event,
          loopIteration,
          ppq,
          startTick,
          tempoBpm,
        }),
      );

      loopIteration += 1;
    }
  }

  return scheduledEvents.sort((left, right) => left.absoluteTick - right.absoluteTick);
}

function createScheduledEvent<TEvent extends TickEvent>({
  absoluteTick,
  audioStartTime,
  event,
  loopIteration,
  ppq,
  startTick,
  tempoBpm,
}: {
  absoluteTick: Tick;
  audioStartTime: number;
  event: TEvent;
  loopIteration: number;
  ppq: number;
  startTick: Tick;
  tempoBpm: number;
}): ScheduledTickEvent<TEvent> {
  return {
    absoluteTick,
    audioTime: tickToAudioTime({
      audioStartTime,
      ppq,
      startTick,
      tempoBpm,
      tick: absoluteTick,
    }),
    event,
    loopIteration,
    loopTick: event.startTick,
    tempoBpm,
  };
}

function getOverlappingStartLoopIteration({
  eventDurationTicks,
  eventOffsetTicks,
  loopLengthTicks,
  loopStartTick,
  scheduleWhenOverlappingStart,
  startTick,
  windowStartTick,
}: {
  eventDurationTicks: Tick | undefined;
  eventOffsetTicks: Tick;
  loopLengthTicks: Tick;
  loopStartTick: Tick;
  scheduleWhenOverlappingStart: boolean | undefined;
  startTick: Tick;
  windowStartTick: Tick;
}): number | null {
  if (
    !scheduleWhenOverlappingStart ||
    typeof eventDurationTicks !== "number" ||
    eventDurationTicks <= 0 ||
    windowStartTick !== startTick
  ) {
    return null;
  }

  const loopIteration = Math.floor(
    (windowStartTick - loopStartTick - eventOffsetTicks) / loopLengthTicks,
  );

  if (loopIteration < 0) {
    return null;
  }

  const absoluteTick =
    loopStartTick + loopIteration * loopLengthTicks + eventOffsetTicks;

  if (
    absoluteTick < windowStartTick &&
    absoluteTick + eventDurationTicks > windowStartTick
  ) {
    return loopIteration;
  }

  return null;
}

export function getLoopTickAtAbsoluteTick({
  absoluteTick,
  loopEndTick = TICKS_PER_4_4_BAR,
  loopStartTick = 0,
}: {
  absoluteTick: Tick;
  loopEndTick?: Tick;
  loopStartTick?: Tick;
}): Tick {
  validateLoopRange(loopStartTick, loopEndTick);

  const loopLengthTicks = loopEndTick - loopStartTick;
  const loopOffsetTicks =
    ((absoluteTick - loopStartTick) % loopLengthTicks + loopLengthTicks) %
    loopLengthTicks;

  return loopStartTick + loopOffsetTicks;
}

export class LookaheadScheduler<TEvent extends TickEvent> {
  private readonly clearIntervalFn: ClearSchedulerInterval;
  private readonly getAudioTime: () => number;
  private readonly lookaheadMs: number;
  private readonly scheduleAheadTime: number;
  private readonly scheduleEvent: (scheduledEvent: ScheduledTickEvent<TEvent>) => void;
  private readonly setIntervalFn: SetSchedulerInterval;
  private readonly startDelaySeconds: number;
  private audioStartTime: number | null = null;
  private events: readonly TEvent[];
  private nextScheduleTick: Tick;
  private startTick: Tick;
  private status: SchedulerStatus = "stopped";
  private tempoBpm: number;
  private timerId: SchedulerTimerId | null = null;

  readonly loopEndTick: Tick;
  readonly loopStartTick: Tick;
  readonly ppq: number;

  constructor({
    clearIntervalFn = defaultClearSchedulerInterval,
    events,
    getAudioTime,
    lookaheadMs = DEFAULT_LOOKAHEAD_MS,
    loopEndTick = TICKS_PER_4_4_BAR,
    loopStartTick = 0,
    ppq = DEFAULT_PPQ,
    scheduleAheadTime = DEFAULT_SCHEDULE_AHEAD_TIME,
    scheduleEvent,
    setIntervalFn = defaultSetSchedulerInterval,
    startDelaySeconds = 0,
    tempoBpm,
  }: LookaheadSchedulerOptions<TEvent>) {
    validateLoopRange(loopStartTick, loopEndTick);
    validateTempoBpm(tempoBpm);
    validateStartDelaySeconds(startDelaySeconds);

    this.clearIntervalFn = clearIntervalFn;
    this.events = events;
    this.getAudioTime = getAudioTime;
    this.lookaheadMs = lookaheadMs;
    this.loopEndTick = loopEndTick;
    this.loopStartTick = loopStartTick;
    this.nextScheduleTick = loopStartTick;
    this.ppq = ppq;
    this.scheduleAheadTime = scheduleAheadTime;
    this.scheduleEvent = scheduleEvent;
    this.setIntervalFn = setIntervalFn;
    this.startDelaySeconds = startDelaySeconds;
    this.startTick = loopStartTick;
    this.tempoBpm = tempoBpm;
  }

  start({ startTick = this.loopStartTick }: StartSchedulerOptions = {}): SchedulerSnapshot {
    if (this.status === "playing") {
      return this.getSnapshot();
    }

    this.startTick = this.normalizeLoopTick(startTick);
    this.audioStartTime = this.getAudioTime() + this.startDelaySeconds;
    this.nextScheduleTick = this.startTick;
    this.status = "playing";
    this.scheduleNextWindow();
    this.timerId = this.setIntervalFn(
      () => this.scheduleNextWindow(),
      this.lookaheadMs,
    );

    return this.getSnapshot();
  }

  pause(): SchedulerSnapshot {
    if (this.status !== "playing") {
      return this.getSnapshot();
    }

    this.startTick = this.getCurrentTick();
    this.clearTimer();
    this.status = "paused";
    this.nextScheduleTick = this.startTick;
    this.audioStartTime = null;

    return this.getSnapshot();
  }

  stop(): SchedulerSnapshot {
    this.clearTimer();

    this.status = "stopped";
    this.nextScheduleTick = this.loopStartTick;
    this.startTick = this.loopStartTick;
    this.audioStartTime = null;

    return this.getSnapshot();
  }

  setEvents(events: readonly TEvent[]): void {
    this.events = events;
  }

  setTempoBpm(tempoBpm: number): SchedulerSnapshot {
    validateTempoBpm(tempoBpm);

    if (this.status === "playing" && this.audioStartTime !== null) {
      const currentAudioTime = this.getAudioTime();
      const currentAbsoluteTick = this.getCurrentAbsoluteTickAtAudioTime(
        currentAudioTime,
      );

      this.audioStartTime = currentAudioTime;
      this.nextScheduleTick = Math.max(this.nextScheduleTick, currentAbsoluteTick);
      this.startTick = currentAbsoluteTick;
    }

    this.tempoBpm = tempoBpm;
    return this.getSnapshot();
  }

  getSnapshot(): SchedulerSnapshot {
    return {
      audioStartTime: this.audioStartTime,
      currentTick: this.getCurrentTick(),
      loopEndTick: this.loopEndTick,
      loopStartTick: this.loopStartTick,
      nextScheduleTick: this.nextScheduleTick,
      status: this.status,
      tempoBpm: this.tempoBpm,
    };
  }

  private getCurrentTick(): Tick {
    return getLoopTickAtAbsoluteTick({
      absoluteTick: this.getCurrentAbsoluteTick(),
      loopEndTick: this.loopEndTick,
      loopStartTick: this.loopStartTick,
    });
  }

  private getCurrentAbsoluteTick(): Tick {
    if (this.status !== "playing" || this.audioStartTime === null) {
      return this.startTick;
    }

    return this.getCurrentAbsoluteTickAtAudioTime(this.getAudioTime());
  }

  private getCurrentAbsoluteTickAtAudioTime(audioTime: number): Tick {
    if (this.audioStartTime === null) {
      return this.startTick;
    }

    if (audioTime <= this.audioStartTime) {
      return this.startTick;
    }

    return audioTimeToTick({
      audioStartTime: this.audioStartTime,
      audioTime,
      ppq: this.ppq,
      startTick: this.startTick,
      tempoBpm: this.tempoBpm,
    });
  }

  private scheduleNextWindow(): void {
    if (this.status !== "playing" || this.audioStartTime === null) {
      return;
    }

    const currentAudioTime = this.getAudioTime();
    const currentAbsoluteTick = audioTimeToTick({
      audioStartTime: this.audioStartTime,
      audioTime: currentAudioTime,
      ppq: this.ppq,
      startTick: this.startTick,
      tempoBpm: this.tempoBpm,
    });
    const scheduleUntilTick = audioTimeToTick({
      audioStartTime: this.audioStartTime,
      audioTime: currentAudioTime + this.scheduleAheadTime,
      ppq: this.ppq,
      startTick: this.startTick,
      tempoBpm: this.tempoBpm,
    });
    const windowStartTick = Math.max(this.nextScheduleTick, currentAbsoluteTick);
    const windowEndTick = Math.max(windowStartTick, scheduleUntilTick);
    const scheduledEvents = collectScheduledEventsForWindow({
      audioStartTime: this.audioStartTime,
      events: this.events,
      loopEndTick: this.loopEndTick,
      loopStartTick: this.loopStartTick,
      ppq: this.ppq,
      startTick: this.startTick,
      tempoBpm: this.tempoBpm,
      windowEndTick,
      windowStartTick,
    });

    for (const scheduledEvent of scheduledEvents) {
      this.scheduleEvent(scheduledEvent);
    }

    this.nextScheduleTick = windowEndTick;
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      this.clearIntervalFn(this.timerId);
      this.timerId = null;
    }
  }

  private normalizeLoopTick(tick: Tick): Tick {
    if (tick === this.loopEndTick) {
      return this.loopStartTick;
    }

    return getLoopTickAtAbsoluteTick({
      absoluteTick: tick,
      loopEndTick: this.loopEndTick,
      loopStartTick: this.loopStartTick,
    });
  }
}

function validateLoopRange(loopStartTick: Tick, loopEndTick: Tick): void {
  if (loopEndTick <= loopStartTick) {
    throw new Error(
      `loopEndTick must be greater than loopStartTick. Received ${loopStartTick}-${loopEndTick}.`,
    );
  }
}

function validateTempoBpm(tempoBpm: number): void {
  if (!Number.isFinite(tempoBpm) || tempoBpm <= 0) {
    throw new Error(`tempoBpm must be a positive finite number. Received ${tempoBpm}.`);
  }
}

function validateStartDelaySeconds(startDelaySeconds: number): void {
  if (!Number.isFinite(startDelaySeconds) || startDelaySeconds < 0) {
    throw new Error(
      `startDelaySeconds must be a non-negative finite number. Received ${startDelaySeconds}.`,
    );
  }
}
