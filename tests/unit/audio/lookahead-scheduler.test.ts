import { describe, expect, it } from "vitest";

import {
  LookaheadScheduler,
  collectScheduledEventsForWindow,
  getLoopTickAtAbsoluteTick,
  type ScheduledTickEvent,
  type TickEvent,
} from "../../../src/audio/lookahead-scheduler";

interface TestEvent extends TickEvent {
  label: string;
}

const events: TestEvent[] = [
  { id: "start", label: "start", startTick: 0 },
  { id: "last-step", label: "last-step", startTick: 1800 },
  { id: "loop-end", label: "loop-end", startTick: 1920 },
];

describe("collectScheduledEventsForWindow", () => {
  it("schedules events inside the loop and excludes the loop end", () => {
    const scheduledEvents = collectScheduledEventsForWindow({
      audioStartTime: 10,
      events,
      tempoBpm: 120,
      windowEndTick: 1920,
      windowStartTick: 0,
    });

    expect(scheduledEvents.map((scheduledEvent) => scheduledEvent.event.id)).toEqual([
      "start",
      "last-step",
    ]);
    expect(scheduledEvents[0]?.audioTime).toBeCloseTo(10);
    expect(scheduledEvents[1]?.audioTime).toBeCloseTo(11.875);
  });

  it("does not double-trigger loop boundary events across adjacent windows", () => {
    const firstWindow = collectScheduledEventsForWindow({
      audioStartTime: 0,
      events,
      tempoBpm: 120,
      windowEndTick: 1920,
      windowStartTick: 0,
    });
    const secondWindow = collectScheduledEventsForWindow({
      audioStartTime: 0,
      events,
      tempoBpm: 120,
      windowEndTick: 3840,
      windowStartTick: 1920,
    });

    expect(firstWindow.map((scheduledEvent) => scheduledEvent.absoluteTick)).toEqual([
      0,
      1800,
    ]);
    expect(secondWindow.map((scheduledEvent) => scheduledEvent.absoluteTick)).toEqual([
      1920,
      3720,
    ]);
  });

  it("wraps absolute ticks to loop ticks", () => {
    expect(getLoopTickAtAbsoluteTick({ absoluteTick: 0 })).toBe(0);
    expect(getLoopTickAtAbsoluteTick({ absoluteTick: 1919 })).toBe(1919);
    expect(getLoopTickAtAbsoluteTick({ absoluteTick: 1920 })).toBe(0);
    expect(getLoopTickAtAbsoluteTick({ absoluteTick: 2040 })).toBe(120);
  });
});

describe("LookaheadScheduler", () => {
  it("starts, schedules ahead, and stops", () => {
    let audioTime = 0;
    let intervalHandler: (() => void) | undefined;
    let clearCount = 0;
    const scheduledEvents: ScheduledTickEvent<TestEvent>[] = [];
    const scheduler = new LookaheadScheduler<TestEvent>({
      clearIntervalFn: () => {
        clearCount += 1;
        intervalHandler = undefined;
      },
      events: [{ id: "start", label: "start", startTick: 0 }],
      getAudioTime: () => audioTime,
      scheduleAheadTime: 0.2,
      scheduleEvent: (scheduledEvent) => {
        scheduledEvents.push(scheduledEvent);
      },
      setIntervalFn: (handler) => {
        intervalHandler = handler;
        return 1;
      },
      tempoBpm: 120,
    });

    expect(scheduler.start().status).toBe("playing");
    expect(scheduledEvents.map((scheduledEvent) => scheduledEvent.absoluteTick)).toEqual([
      0,
    ]);

    audioTime = 1.95;
    const runInterval = intervalHandler;

    expect(runInterval).toBeDefined();
    runInterval?.();

    expect(scheduledEvents.map((scheduledEvent) => scheduledEvent.absoluteTick)).toEqual([
      0,
      1920,
    ]);
    expect(scheduler.stop().status).toBe("stopped");
    expect(clearCount).toBe(1);
  });

  it("uses updated events for later scheduling windows", () => {
    let audioTime = 0;
    let intervalHandler: (() => void) | undefined;
    const scheduledEvents: ScheduledTickEvent<TestEvent>[] = [];
    const scheduler = new LookaheadScheduler<TestEvent>({
      clearIntervalFn: () => {
        intervalHandler = undefined;
      },
      events: [],
      getAudioTime: () => audioTime,
      scheduleAheadTime: 0.2,
      scheduleEvent: (scheduledEvent) => {
        scheduledEvents.push(scheduledEvent);
      },
      setIntervalFn: (handler) => {
        intervalHandler = handler;
        return 1;
      },
      tempoBpm: 120,
    });

    scheduler.start();
    scheduler.setEvents([{ id: "start", label: "start", startTick: 0 }]);

    audioTime = 1.95;
    intervalHandler?.();

    expect(scheduledEvents.map((scheduledEvent) => scheduledEvent.absoluteTick)).toEqual([
      1920,
    ]);
  });

  it("starts from a non-zero loop tick", () => {
    const scheduledEvents: ScheduledTickEvent<TestEvent>[] = [];
    const scheduler = new LookaheadScheduler<TestEvent>({
      events: [
        { id: "before-start", label: "before-start", startTick: 0 },
        { id: "at-start", label: "at-start", startTick: 480 },
      ],
      getAudioTime: () => 10,
      scheduleAheadTime: 0.1,
      scheduleEvent: (scheduledEvent) => {
        scheduledEvents.push(scheduledEvent);
      },
      setIntervalFn: () => 1,
      tempoBpm: 120,
    });

    const snapshot = scheduler.start({ startTick: 480 });

    expect(snapshot.currentTick).toBe(480);
    expect(
      scheduledEvents.map((scheduledEvent) => [
        scheduledEvent.event.id,
        scheduledEvent.absoluteTick,
        scheduledEvent.audioTime,
      ]),
    ).toEqual([["at-start", 480, 10]]);
  });

  it("can delay transport audio start while keeping the current tick stable", () => {
    let audioTime = 10;
    const scheduledEvents: ScheduledTickEvent<TestEvent>[] = [];
    const scheduler = new LookaheadScheduler<TestEvent>({
      events: [{ id: "start", label: "start", startTick: 0 }],
      getAudioTime: () => audioTime,
      scheduleAheadTime: 0.25,
      scheduleEvent: (scheduledEvent) => {
        scheduledEvents.push(scheduledEvent);
      },
      setIntervalFn: () => 1,
      startDelaySeconds: 0.12,
      tempoBpm: 120,
    });

    const snapshot = scheduler.start();

    expect(snapshot.currentTick).toBe(0);
    expect(snapshot.audioStartTime).toBeCloseTo(10.12);
    expect(scheduledEvents[0]?.audioTime).toBeCloseTo(10.12);

    audioTime = 10.06;

    expect(scheduler.getSnapshot().currentTick).toBe(0);
  });

  it("pauses at the current loop tick and resumes from that tick", () => {
    let audioTime = 0;
    let intervalHandler: (() => void) | undefined;
    let clearCount = 0;
    const scheduledEvents: ScheduledTickEvent<TestEvent>[] = [];
    const scheduler = new LookaheadScheduler<TestEvent>({
      clearIntervalFn: () => {
        clearCount += 1;
        intervalHandler = undefined;
      },
      events: [
        { id: "first-beat", label: "first-beat", startTick: 480 },
        { id: "second-beat", label: "second-beat", startTick: 960 },
      ],
      getAudioTime: () => audioTime,
      scheduleAheadTime: 0.1,
      scheduleEvent: (scheduledEvent) => {
        scheduledEvents.push(scheduledEvent);
      },
      setIntervalFn: (handler) => {
        intervalHandler = handler;
        return 1;
      },
      tempoBpm: 120,
    });

    scheduler.start();
    audioTime = 0.5;

    const pausedSnapshot = scheduler.pause();

    expect(pausedSnapshot.status).toBe("paused");
    expect(pausedSnapshot.currentTick).toBe(480);
    expect(clearCount).toBe(1);
    expect(intervalHandler).toBeUndefined();

    audioTime = 1;
    scheduler.start({ startTick: pausedSnapshot.currentTick });

    expect(scheduler.getSnapshot().currentTick).toBe(480);
    expect(scheduledEvents.map((scheduledEvent) => scheduledEvent.absoluteTick)).toEqual([
      480,
    ]);
  });

  it("updates tempo for future scheduling windows while preserving current tick", () => {
    let audioTime = 0;
    let intervalHandler: (() => void) | undefined;
    const scheduledEvents: ScheduledTickEvent<TestEvent>[] = [];
    const scheduler = new LookaheadScheduler<TestEvent>({
      events: [{ id: "future-note", label: "future-note", startTick: 720 }],
      getAudioTime: () => audioTime,
      scheduleAheadTime: 0.1,
      scheduleEvent: (scheduledEvent) => {
        scheduledEvents.push(scheduledEvent);
      },
      setIntervalFn: (handler) => {
        intervalHandler = handler;
        return 1;
      },
      tempoBpm: 120,
    });

    scheduler.start();
    audioTime = 0.5;

    const tempoSnapshot = scheduler.setTempoBpm(60);

    expect(tempoSnapshot.status).toBe("playing");
    expect(tempoSnapshot.currentTick).toBe(480);
    expect(tempoSnapshot.tempoBpm).toBe(60);

    audioTime = 1;
    intervalHandler?.();

    expect(
      scheduledEvents.map((scheduledEvent) => [
        scheduledEvent.event.id,
        scheduledEvent.absoluteTick,
        scheduledEvent.audioTime,
        scheduledEvent.tempoBpm,
      ]),
    ).toEqual([["future-note", 720, 1, 60]]);
    expect(scheduler.getSnapshot().currentTick).toBe(720);
  });

  it("rejects invalid tempo updates", () => {
    const scheduler = new LookaheadScheduler<TestEvent>({
      events: [],
      getAudioTime: () => 0,
      scheduleEvent: () => {},
      tempoBpm: 120,
    });

    expect(() => scheduler.setTempoBpm(0)).toThrow(
      "tempoBpm must be a positive finite number",
    );
  });
});
