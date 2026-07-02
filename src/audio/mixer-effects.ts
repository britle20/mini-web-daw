import {
  normalizeDelayEffectParameters,
  normalizeDistortionEffectParameters,
  normalizeFilterEffectParameters,
  normalizeTrackEffectState,
  type TrackEffectState,
} from "../model";

const DISTORTION_CURVE_SAMPLE_COUNT = 1024;

export function connectMixerEffectGraph({
  audioContext,
  effectSlot,
  inputNode,
  outputNode,
}: {
  audioContext: BaseAudioContext;
  effectSlot: TrackEffectState;
  inputNode: AudioNode;
  outputNode: AudioNode;
}): AudioNode[] {
  const normalizedEffectSlot = normalizeTrackEffectState(effectSlot);

  if (!normalizedEffectSlot.enabled || normalizedEffectSlot.kind === "none") {
    inputNode.connect(outputNode);
    return [];
  }

  if (normalizedEffectSlot.kind === "filter") {
    const parameters = normalizeFilterEffectParameters(
      normalizedEffectSlot.parameters,
    );
    const filterNode = audioContext.createBiquadFilter();

    filterNode.type = parameters.type;
    filterNode.frequency.value = parameters.frequencyHz;
    filterNode.Q.value = parameters.q;
    inputNode.connect(filterNode);
    filterNode.connect(outputNode);

    return [filterNode];
  }

  if (normalizedEffectSlot.kind === "delay") {
    const parameters = normalizeDelayEffectParameters(
      normalizedEffectSlot.parameters,
    );
    const dryGainNode = audioContext.createGain();
    const delayNode = audioContext.createDelay(parameters.delayTimeSeconds);
    const feedbackGainNode = audioContext.createGain();
    const wetGainNode = audioContext.createGain();
    const outputMixNode = audioContext.createGain();

    dryGainNode.gain.value = 1 - parameters.wetMix;
    delayNode.delayTime.value = parameters.delayTimeSeconds;
    feedbackGainNode.gain.value = parameters.feedback;
    wetGainNode.gain.value = parameters.wetMix;

    inputNode.connect(dryGainNode);
    dryGainNode.connect(outputMixNode);
    inputNode.connect(delayNode);
    delayNode.connect(wetGainNode);
    wetGainNode.connect(outputMixNode);
    delayNode.connect(feedbackGainNode);
    feedbackGainNode.connect(delayNode);
    outputMixNode.connect(outputNode);

    return [
      dryGainNode,
      delayNode,
      feedbackGainNode,
      wetGainNode,
      outputMixNode,
    ];
  }

  const parameters = normalizeDistortionEffectParameters(
    normalizedEffectSlot.parameters,
  );
  const dryGainNode = audioContext.createGain();
  const distortionNode = audioContext.createWaveShaper();
  const wetGainNode = audioContext.createGain();
  const outputMixNode = audioContext.createGain();

  dryGainNode.gain.value = 1 - parameters.wetMix;
  distortionNode.curve = createDistortionCurve(parameters.drive);
  distortionNode.oversample = "2x";
  wetGainNode.gain.value = parameters.wetMix;

  inputNode.connect(dryGainNode);
  dryGainNode.connect(outputMixNode);
  inputNode.connect(distortionNode);
  distortionNode.connect(wetGainNode);
  wetGainNode.connect(outputMixNode);
  outputMixNode.connect(outputNode);

  return [dryGainNode, distortionNode, wetGainNode, outputMixNode];
}

export function createDistortionCurve(
  drive: number,
  sampleCount = DISTORTION_CURVE_SAMPLE_COUNT,
): Float32Array<ArrayBuffer> {
  const curve: Float32Array<ArrayBuffer> = new Float32Array(
    new ArrayBuffer(sampleCount * Float32Array.BYTES_PER_ELEMENT),
  );
  const amount = Math.max(1, drive) * 20;

  for (let index = 0; index < sampleCount; index += 1) {
    const x = (index * 2) / (sampleCount - 1) - 1;

    curve[index] =
      ((3 + amount) * x * 20 * (Math.PI / 180)) /
      (Math.PI + amount * Math.abs(x));
  }

  return curve;
}
