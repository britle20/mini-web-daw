declare module "signalsmith-stretch" {
  export interface SignalsmithStretchConfig {
    blockMs?: number | null;
    intervalMs?: number;
    preset?: "cheaper" | "default";
    splitComputation?: boolean;
  }

  export interface SignalsmithStretchScheduleOptions {
    active?: boolean;
    input?: number;
    output?: number;
    outputTime?: number;
    rate?: number;
    semitones?: number;
  }

  export interface SignalsmithStretchNode extends AudioNode {
    addBuffers(buffers: Float32Array[]): Promise<number>;
    configure(config: SignalsmithStretchConfig): Promise<void>;
    dropBuffers(toSeconds?: number): Promise<{ end: number; start: number }>;
    inputTime: number;
    latency(): Promise<number>;
    schedule(
      options: SignalsmithStretchScheduleOptions,
      adjustPrevious?: boolean,
    ): Promise<SignalsmithStretchScheduleOptions>;
    setUpdateInterval(
      seconds: number,
      callback?: (inputTimeSeconds: number) => void,
    ): Promise<void>;
    stop(when?: number): Promise<SignalsmithStretchScheduleOptions>;
  }

  export default function SignalsmithStretch(
    audioContext: BaseAudioContext,
    channelOptions?: AudioWorkletNodeOptions,
  ): Promise<SignalsmithStretchNode>;
}
