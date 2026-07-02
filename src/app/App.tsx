import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import {
  BUNDLED_DRUM_SAMPLES,
  createAudioEngine,
  expandClipInstancesForPlayback,
  renderArrangementToWav,
  type BundledSampleMeta,
  type MixerLevelSnapshot,
  type NoteLoopEvent,
  type SampleLoopEvent,
} from "../audio";
import {
  AudioClipDetails,
  ArrangementView,
  DrumSequencer,
  PianoRoll,
  ProjectSidebar,
  TransportBar,
  type InstrumentId,
  type TransportMode,
  type TransportState,
} from "../features";
import { Icon } from "../components";
import {
  DEFAULT_PITCHED_INSTRUMENT_ID,
  DEFAULT_ARRANGEMENT_LENGTH_BARS,
  HYBRID_CLIP_LENGTH_BARS,
  MAX_ARRANGEMENT_LENGTH_BARS,
  MIN_ARRANGEMENT_LENGTH_BARS,
  addPitchedInstrumentToClip,
  addNoteEvent,
  createClipInstance,
  createDefaultArrangementLoopRange,
  createDefaultArrangementTracks,
  createDefaultMasterMixerState,
  createDefaultTrackMixerStates,
  createImportedAudioClipDraft,
  createImportedAudioIds,
  createEmptyHybridClip,
  deleteClipInstance,
  deleteNoteEvent,
  duplicateClip,
  getClipDeleteConfirmationMessage,
  getHybridClipBarCount,
  getHybridClipLengthTicks,
  getClipInstancesOutsideArrangementLength,
  getPitchedInstrument,
  hasHybridClipEventsOutsideLength,
  hasNoteEventsForPitchedInstrument,
  isAudioClip,
  isHybridClip,
  moveDrumLane,
  moveClipInstance,
  moveNoteEvent,
  normalizeArrangementLengthBars,
  normalizeArrangementLoopRange,
  removeClipInstancesOutsideArrangementLength,
  removePitchedInstrumentFromClip,
  renameClip,
  toggleDrumSubstep,
  validateImportedWavFile,
  updateMasterMixerState,
  updateDrumLaneSample,
  updateDrumStepSubdivision,
  updateHybridClipLength,
  updateTrackMixerState,
  type ArrangementLoopRange,
  type ArrangementTrack,
  type AudioClip,
  type Clip,
  type ClipInstance,
  type DrumEvent,
  type DrumLaneId,
  type DrumStepSubdivision,
  type HybridClip,
  type HybridClipLengthBars,
  type MasterMixerState,
  type NoteEvent,
  type PitchedInstrumentId,
  type SampleMeta,
  type TrackMixerState,
  type TrackEffectState,
} from "../model";
import {
  createIndexedDbProjectStore,
  createProjectId,
  createPersistedProjectDocument,
  getImportedSampleIds,
  type PersistedProjectDocument,
  type ProjectSummary,
} from "../persistence";
import { DEFAULT_TEMPO_BPM, clampTempoBpm, type Tick } from "../utils";
import styles from "./App.module.css";

const audioEngine = createAudioEngine();
const projectStore = createIndexedDbProjectStore();
const DEFAULT_CLIP_ID = "clip-1";
const DEFAULT_PROJECT_NAME = "Project 1";
const AUTOSAVE_DEBOUNCE_MS = 600;

type PersistenceStatus = "error" | "loading" | "saved" | "saving";

type PendingConfirmation =
  | {
      clipId: string;
      confirmLabel: string;
      detail: string;
      kind: "clip-delete";
      message: string;
      title: string;
    }
  | {
      barCount: HybridClipLengthBars;
      clipId: string;
      confirmLabel: string;
      detail: string;
      kind: "clip-length-trim";
      message: string;
      title: string;
    }
  | {
      clipId: string;
      confirmLabel: string;
      detail: string;
      instrumentId: PitchedInstrumentId;
      kind: "instrument-remove";
      message: string;
      title: string;
    }
  | {
      confirmLabel: string;
      detail: string;
      kind: "arrangement-length-trim";
      lengthBars: number;
      message: string;
      title: string;
    };

function drumEventsToSampleLoopEvents(
  drumEvents: readonly DrumEvent[],
): SampleLoopEvent[] {
  return drumEvents.map((event) => ({
    gain: event.velocity,
    id: event.id,
    sampleId: event.sampleId,
    startTick: event.startTick,
  }));
}

function noteEventsToNoteLoopEvents(
  noteEvents: readonly NoteEvent[],
): NoteLoopEvent[] {
  return noteEvents.map((event) => ({
    durationTicks: event.durationTicks,
    gain: event.velocity,
    id: event.id,
    instrumentId: event.instrumentId,
    midiNote: event.midiNote,
    startTick: event.startTick,
  }));
}

function createEmptyMixerLevels(
  tracks: readonly ArrangementTrack[],
): MixerLevelSnapshot {
  return {
    masterLevel: 0,
    trackLevels: Object.fromEntries(tracks.map((track) => [track.id, 0])),
  };
}

function createNextHybridClip(clips: readonly Clip[]): HybridClip {
  const nextClipNumber =
    clips.reduce((highestClipNumber, clip) => {
      const match = /^clip-(\d+)$/.exec(clip.id);
      const clipNumber = match ? Number.parseInt(match[1] ?? "", 10) : 0;

      return Math.max(highestClipNumber, Number.isNaN(clipNumber) ? 0 : clipNumber);
    }, 0) + 1;

  return createEmptyHybridClip({
    id: `clip-${nextClipNumber}`,
    name: `Clip ${nextClipNumber}`,
  });
}

function createBlankProjectDocument({
  existingProjectIds,
  name,
  now = Date.now(),
}: {
  existingProjectIds: readonly string[];
  name: string;
  now?: number;
}): PersistedProjectDocument {
  const arrangementTracks = createDefaultArrangementTracks();

  return createPersistedProjectDocument({
    arrangementLengthBars: DEFAULT_ARRANGEMENT_LENGTH_BARS,
    arrangementLoopRange: createDefaultArrangementLoopRange(
      DEFAULT_ARRANGEMENT_LENGTH_BARS,
    ),
    arrangementTracks,
    clipInstances: [],
    clips: [createEmptyHybridClip({ id: DEFAULT_CLIP_ID, name: "Clip 1" })],
    createdAt: now,
    id: createProjectId(existingProjectIds),
    masterMixerState: createDefaultMasterMixerState(),
    name,
    sampleMetas: [],
    savedAt: now,
    tempoBpm: DEFAULT_TEMPO_BPM,
    trackMixerStates: createDefaultTrackMixerStates(arrangementTracks),
  });
}

function createArrangementExportFileName(projectName: string): string {
  const safeProjectName =
    projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "mini-daw";
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");

  return `${safeProjectName}-arrangement-${timestamp}.wav`;
}

function createRuntimeImportedSampleKey(projectId: string, sampleId: string): string {
  return `${projectId}::${sampleId}`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function getPersistenceStatusLabel(status: PersistenceStatus): string {
  if (status === "loading") {
    return "Loading project";
  }

  if (status === "saving") {
    return "Saving";
  }

  if (status === "error") {
    return "Save failed";
  }

  return "Saved";
}

export function App() {
  const [transportState, setTransportState] = useState<TransportState>("stopped");
  const [transportMode, setTransportMode] = useState<TransportMode>("pattern");
  const [bpm, setBpm] = useState(DEFAULT_TEMPO_BPM);
  const bpmRef = useRef(DEFAULT_TEMPO_BPM);
  const [clips, setClips] = useState<Clip[]>(() => [
    createEmptyHybridClip({ id: DEFAULT_CLIP_ID, name: "Clip 1" }),
  ]);
  const clipsRef = useRef<Clip[]>(clips);
  const [arrangementTracks, setArrangementTracks] = useState<ArrangementTrack[]>(() =>
    createDefaultArrangementTracks(),
  );
  const [arrangementLengthBars, setArrangementLengthBars] = useState(
    DEFAULT_ARRANGEMENT_LENGTH_BARS,
  );
  const arrangementLengthBarsRef = useRef(arrangementLengthBars);
  const [trackMixerStates, setTrackMixerStates] = useState<TrackMixerState[]>(
    () => createDefaultTrackMixerStates(arrangementTracks),
  );
  const trackMixerStatesRef = useRef<TrackMixerState[]>(trackMixerStates);
  const [masterMixerState, setMasterMixerState] = useState<MasterMixerState>(() =>
    createDefaultMasterMixerState(),
  );
  const masterMixerStateRef = useRef<MasterMixerState>(masterMixerState);
  const [mixerLevels, setMixerLevels] = useState<MixerLevelSnapshot>(() =>
    createEmptyMixerLevels(arrangementTracks),
  );
  const [arrangementLoopRange, setArrangementLoopRange] =
    useState<ArrangementLoopRange>(() =>
      createDefaultArrangementLoopRange(arrangementLengthBars),
    );
  const arrangementLoopRangeRef =
    useRef<ArrangementLoopRange>(arrangementLoopRange);
  const [clipInstances, setClipInstances] = useState<ClipInstance[]>([]);
  const clipInstancesRef = useRef<ClipInstance[]>(clipInstances);
  const [selectedClipInstanceId, setSelectedClipInstanceId] = useState<
    string | null
  >(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const confirmationCancelButtonRef = useRef<HTMLButtonElement>(null);
  const [sampleMetas, setSampleMetas] = useState<SampleMeta[]>([]);
  const sampleMetasRef = useRef<SampleMeta[]>(sampleMetas);
  const [isClipImporting, setIsClipImporting] = useState(false);
  const [clipImportError, setClipImportError] = useState<string | null>(null);
  const [isArrangementExporting, setIsArrangementExporting] = useState(false);
  const [arrangementExportError, setArrangementExportError] = useState<
    string | null
  >(null);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] =
    useState<PersistenceStatus>("loading");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [isProjectOperationPending, setIsProjectOperationPending] =
    useState(false);
  const durablePersistenceErrorRef = useRef<string | null>(null);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const projectSummariesRef = useRef<ProjectSummary[]>(projectSummaries);
  const [activeProjectId, setActiveProjectId] = useState("");
  const activeProjectIdRef = useRef(activeProjectId);
  const [activeProjectCreatedAt, setActiveProjectCreatedAt] = useState(Date.now());
  const activeProjectCreatedAtRef = useRef(activeProjectCreatedAt);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const projectNameRef = useRef(projectName);
  const importedSampleBlobsRef = useRef<Map<string, Blob>>(new Map());
  const runtimeImportedSampleKeysRef = useRef<Set<string>>(new Set());
  const [selectedClipId, setSelectedClipId] = useState(DEFAULT_CLIP_ID);
  const [selectedInstrumentId, setSelectedInstrumentId] =
    useState<InstrumentId>("drums");
  const [selectedPitchedInstrumentId, setSelectedPitchedInstrumentId] =
    useState<PitchedInstrumentId>(DEFAULT_PITCHED_INSTRUMENT_ID);
  const selectedClip =
    clips.find((clip) => clip.id === selectedClipId) ?? clips[0]!;
  const selectedClipRef = useRef<Clip>(selectedClip);
  const selectedHybridClip = isHybridClip(selectedClip) ? selectedClip : null;
  const selectedAudioClip = isAudioClip(selectedClip) ? selectedClip : null;
  const selectedSampleMeta = selectedAudioClip
    ? sampleMetas.find((sampleMeta) => sampleMeta.id === selectedAudioClip.sampleId)
    : undefined;
  const [playheadTick, setPlayheadTick] = useState<Tick>(0);
  const playheadTickRef = useRef<Tick>(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isAudioClipPreviewPlaying, setIsAudioClipPreviewPlaying] =
    useState(false);
  const shouldShowPlayhead = transportState !== "stopped";
  const hasSelectedPitchedInstrument =
    selectedHybridClip?.pitchedInstrumentIds.includes(selectedPitchedInstrumentId) ??
    false;
  const selectedPitchedInstrumentName = hasSelectedPitchedInstrument
    ? getPitchedInstrument(selectedPitchedInstrumentId).name
    : "-";
  const selectedPitchedNoteEvents = hasSelectedPitchedInstrument
    ? selectedHybridClip?.noteEvents.filter(
        (event) => event.instrumentId === selectedPitchedInstrumentId,
      ) ?? []
    : [];

  useEffect(() => {
    clipsRef.current = clips;
    selectedClipRef.current = selectedClip;
  }, [clips, selectedClip]);

  useEffect(() => {
    clipInstancesRef.current = clipInstances;
  }, [clipInstances]);

  useEffect(() => {
    arrangementLengthBarsRef.current = arrangementLengthBars;
  }, [arrangementLengthBars]);

  useEffect(() => {
    arrangementLoopRangeRef.current = arrangementLoopRange;
  }, [arrangementLoopRange]);

  useEffect(() => {
    sampleMetasRef.current = sampleMetas;
  }, [sampleMetas]);

  useEffect(() => {
    projectSummariesRef.current = projectSummaries;
  }, [projectSummaries]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    activeProjectCreatedAtRef.current = activeProjectCreatedAt;
  }, [activeProjectCreatedAt]);

  useEffect(() => {
    projectNameRef.current = projectName;
  }, [projectName]);

  useEffect(() => {
    let isCancelled = false;

    async function restoreProject() {
      let shouldEnableAutosave = true;

      try {
        let collection = await projectStore.loadProjectCollection();
        let persistedProject = collection.activeProjectId
          ? await projectStore.loadProject(collection.activeProjectId)
          : null;

        if (isCancelled) {
          return;
        }

        if (!persistedProject && collection.projects[0]) {
          persistedProject = await projectStore.loadProject(collection.projects[0].id);
          collection = await projectStore.setActiveProjectId(
            persistedProject?.id ?? collection.projects[0].id,
          );
        }

        if (!persistedProject) {
          persistedProject = createBlankProjectDocument({
            existingProjectIds: collection.projects.map((project) => project.id),
            name: DEFAULT_PROJECT_NAME,
          });
          await projectStore.saveProject(persistedProject);
          collection = await projectStore.setActiveProjectId(persistedProject.id);
        }

        const { blobMap, missingSampleIds } =
          await loadImportedSampleBlobMap(persistedProject);

        if (isCancelled) {
          return;
        }

        applyProjectDocument({
          importedSampleBlobs: blobMap,
          project: persistedProject,
        });
        projectSummariesRef.current = collection.projects;
        setProjectSummaries(collection.projects);
        reportMissingImportedSampleIds(missingSampleIds);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        shouldEnableAutosave = false;
        const message =
          error instanceof Error ? error.message : "Project restore failed.";
        durablePersistenceErrorRef.current = message;
        setPersistenceStatus("error");
        setPersistenceError(message);
      } finally {
        if (!isCancelled && shouldEnableAutosave) {
          setIsPersistenceReady(true);
        }
      }
    }

    void restoreProject();

    return () => {
      isCancelled = true;
    };
    // Restore once before autosave starts; project switch handlers own later loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isPersistenceReady || isProjectOperationPending || !activeProjectId) {
      return;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(() => {
      const projectDocument = createPersistedProjectDocument({
        arrangementLengthBars,
        arrangementLoopRange,
        arrangementTracks,
        clipInstances,
        clips,
        createdAt: activeProjectCreatedAt,
        id: activeProjectId,
        masterMixerState,
        name: projectName,
        sampleMetas,
        tempoBpm: bpm,
        trackMixerStates,
      });

      setPersistenceStatus("saving");
      projectStore
        .saveProject(projectDocument)
        .then(async () => {
          if (isCancelled) {
            return;
          }

          const collection = await projectStore.loadProjectCollection();

          if (isCancelled) {
            return;
          }

          projectSummariesRef.current = collection.projects;
          setProjectSummaries(collection.projects);

          if (durablePersistenceErrorRef.current) {
            setPersistenceStatus("error");
            setPersistenceError(durablePersistenceErrorRef.current);
          } else {
            setPersistenceStatus("saved");
            setPersistenceError(null);
          }
        })
        .catch((error: unknown) => {
          if (isCancelled) {
            return;
          }

          setPersistenceStatus("error");
          setPersistenceError(
            error instanceof Error ? error.message : "Project autosave failed.",
          );
        });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    arrangementLoopRange,
    arrangementLengthBars,
    arrangementTracks,
    activeProjectCreatedAt,
    activeProjectId,
    bpm,
    clipInstances,
    clips,
    isProjectOperationPending,
    isPersistenceReady,
    masterMixerState,
    projectName,
    sampleMetas,
    trackMixerStates,
  ]);

  useEffect(() => {
    trackMixerStatesRef.current = trackMixerStates;
    audioEngine.setTrackMixerStates(trackMixerStates);
  }, [trackMixerStates]);

  useEffect(() => {
    masterMixerStateRef.current = masterMixerState;
    audioEngine.setMasterMixerState(masterMixerState);
  }, [masterMixerState]);

  useEffect(() => {
    return () => {
      audioEngine.stopCachedSamplePreview();
    };
  }, []);

  useEffect(() => {
    if (transportState !== "playing") {
      return;
    }

    let animationFrameId = 0;

    function updatePlayhead() {
      const currentTick = audioEngine.getTransportSnapshot().currentTick;

      playheadTickRef.current = currentTick;
      setPlayheadTick(currentTick);
      animationFrameId = window.requestAnimationFrame(updatePlayhead);
    }

    animationFrameId = window.requestAnimationFrame(updatePlayhead);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [transportState]);

  useEffect(() => {
    if (transportMode !== "song" || transportState !== "playing") {
      return;
    }

    let animationFrameId = 0;
    const trackIds = arrangementTracks.map((track) => track.id);

    function updateMixerLevels() {
      setMixerLevels(audioEngine.getMixerLevels(trackIds));
      animationFrameId = window.requestAnimationFrame(updateMixerLevels);
    }

    animationFrameId = window.requestAnimationFrame(updateMixerLevels);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [arrangementTracks, transportMode, transportState]);

  useEffect(() => {
    if (!pendingConfirmation) {
      return;
    }

    confirmationCancelButtonRef.current?.focus();
  }, [pendingConfirmation]);

  function commitSelectedClip(
    nextClip: HybridClip,
    { syncPlayback = true }: { syncPlayback?: boolean } = {},
  ) {
    const nextClips = clipsRef.current.map((clip) =>
      clip.id === nextClip.id ? nextClip : clip,
    );

    selectedClipRef.current = nextClip;
    clipsRef.current = nextClips;
    setClips(nextClips);

    if (!syncPlayback) {
      return;
    }

    if (transportState === "playing" && transportMode === "song") {
      void updatePlayingArrangementEvents(nextClips);
    } else if (transportState === "playing") {
      void updatePlayingClipEvents(nextClip);
    }
  }

  function commitAnyClip(nextClip: Clip) {
    const nextClips = clipsRef.current.map((clip) =>
      clip.id === nextClip.id ? nextClip : clip,
    );

    clipsRef.current = nextClips;
    setClips(nextClips);

    if (nextClip.id === selectedClipRef.current.id) {
      selectedClipRef.current = nextClip;

      if (transportState === "playing" && transportMode === "song") {
        void updatePlayingArrangementEvents(nextClips);
      } else if (transportState === "playing" && isHybridClip(nextClip)) {
        void updatePlayingClipEvents(nextClip);
      }
    }
  }

  function commitClip(nextClip: HybridClip) {
    commitAnyClip(nextClip);
  }

  function selectClipAndInstrument(
    clip: HybridClip,
    instrumentId: Exclude<InstrumentId, "audio">,
  ) {
    selectedClipRef.current = clip;
    setSelectedClipId(clip.id);
    setSelectedInstrumentId(instrumentId);

    if (instrumentId !== "drums") {
      setSelectedPitchedInstrumentId(instrumentId);
      return;
    }

    setSelectedPitchedInstrumentId(
      clip.pitchedInstrumentIds[0] ?? DEFAULT_PITCHED_INSTRUMENT_ID,
    );
  }

  function selectClipDefault(clip: Clip) {
    selectedClipRef.current = clip;
    setSelectedClipId(clip.id);

    if (isAudioClip(clip)) {
      setSelectedInstrumentId("audio");
      return;
    }

    selectClipAndInstrument(clip, clip.pitchedInstrumentIds[0] ?? "drums");
  }

  function commitPlayheadTick(nextTick: Tick) {
    playheadTickRef.current = nextTick;
    setPlayheadTick(nextTick);
  }

  function commitBpm(nextBpm: number) {
    const normalizedBpm = clampTempoBpm(nextBpm);
    const snapshot = audioEngine.setTempoBpm(normalizedBpm);

    bpmRef.current = snapshot.tempoBpm;
    setBpm(snapshot.tempoBpm);
    commitPlayheadTick(snapshot.currentTick);
  }

  function commitClipInstances(nextClipInstances: ClipInstance[]) {
    clipInstancesRef.current = nextClipInstances;
    setClipInstances(nextClipInstances);
  }

  function commitArrangementLoopRange(
    nextLoopRange: ArrangementLoopRange,
    lengthBars = arrangementLengthBarsRef.current,
  ) {
    const normalizedLoopRange = normalizeArrangementLoopRange(
      nextLoopRange,
      lengthBars,
    );

    arrangementLoopRangeRef.current = normalizedLoopRange;
    setArrangementLoopRange(normalizedLoopRange);
  }

  function handleTrackVolumeChange(trackId: string, volumeDb: number) {
    setTrackMixerStates((currentStates) =>
      updateTrackMixerState(currentStates, trackId, { volumeDb }),
    );
  }

  function handleTrackMuteToggle(trackId: string) {
    setTrackMixerStates((currentStates) => {
      const currentState = currentStates.find(
        (state) => state.trackId === trackId,
      );

      return updateTrackMixerState(currentStates, trackId, {
        muted: !(currentState?.muted ?? false),
      });
    });
  }

  function handleTrackSoloToggle(trackId: string) {
    setTrackMixerStates((currentStates) => {
      const currentState = currentStates.find(
        (state) => state.trackId === trackId,
      );

      return updateTrackMixerState(currentStates, trackId, {
        solo: !(currentState?.solo ?? false),
      });
    });
  }

  function handleTrackEffectChange(
    trackId: string,
    effectSlot: TrackEffectState,
  ) {
    setTrackMixerStates((currentStates) =>
      updateTrackMixerState(currentStates, trackId, { effectSlot }),
    );
  }

  function handleMasterVolumeChange(volumeDb: number) {
    setMasterMixerState((currentState) =>
      updateMasterMixerState(currentState, { volumeDb }),
    );
  }

  function getSelectedHybridClip(): HybridClip | null {
    const clip = selectedClipRef.current;

    return isHybridClip(clip) ? clip : null;
  }

  function markAudioClipPreviewStopped() {
    setIsAudioClipPreviewPlaying(false);
  }

  function stopAudioClipPreview() {
    audioEngine.stopCachedSamplePreview();
    markAudioClipPreviewStopped();
  }

  function reportPersistenceError(message: string) {
    setPersistenceStatus("error");
    setPersistenceError(message);
  }

  function reportMissingImportedSampleIds(missingSampleIds: readonly string[]) {
    if (missingSampleIds.length > 0) {
      const message = `Missing imported audio data for ${missingSampleIds.join(
        ", ",
      )}.`;

      durablePersistenceErrorRef.current = message;
      setPersistenceStatus("error");
      setPersistenceError(message);
      return;
    }

    durablePersistenceErrorRef.current = null;
    setPersistenceStatus("saved");
    setPersistenceError(null);
  }

  function createCurrentProjectDocument({
    name = projectNameRef.current,
    savedAt = Date.now(),
  }: {
    name?: string;
    savedAt?: number;
  } = {}): PersistedProjectDocument | null {
    if (!activeProjectIdRef.current) {
      return null;
    }

    return createPersistedProjectDocument({
      arrangementLengthBars: arrangementLengthBarsRef.current,
      arrangementLoopRange: arrangementLoopRangeRef.current,
      arrangementTracks,
      clipInstances: clipInstancesRef.current,
      clips: clipsRef.current,
      createdAt: activeProjectCreatedAtRef.current,
      id: activeProjectIdRef.current,
      masterMixerState: masterMixerStateRef.current,
      name,
      sampleMetas: sampleMetasRef.current,
      savedAt,
      tempoBpm: bpmRef.current,
      trackMixerStates: trackMixerStatesRef.current,
    });
  }

  async function saveCurrentProjectNow({
    name,
  }: {
    name?: string;
  } = {}): Promise<PersistedProjectDocument | null> {
    const projectDocument = createCurrentProjectDocument({ name });

    if (!projectDocument) {
      return null;
    }

    setPersistenceStatus("saving");
    await projectStore.saveProject(projectDocument);
    const collection = await projectStore.loadProjectCollection();

    projectSummariesRef.current = collection.projects;
    setProjectSummaries(collection.projects);

    if (durablePersistenceErrorRef.current) {
      setPersistenceStatus("error");
      setPersistenceError(durablePersistenceErrorRef.current);
    } else {
      setPersistenceStatus("saved");
      setPersistenceError(null);
    }

    return projectDocument;
  }

  async function loadImportedSampleBlobMap(
    project: PersistedProjectDocument,
  ): Promise<{
    blobMap: Map<string, Blob>;
    missingSampleIds: string[];
  }> {
    const importedSampleIds = getImportedSampleIds(project);
    const importedSampleBlobs = await Promise.all(
      importedSampleIds.map(async (sampleId) => ({
        blob: await projectStore.loadImportedSampleBlob(project.id, sampleId),
        sampleId,
      })),
    );
    const blobMap = new Map<string, Blob>();
    const missingSampleIds: string[] = [];

    for (const { blob, sampleId } of importedSampleBlobs) {
      if (blob) {
        blobMap.set(sampleId, blob);
      } else {
        missingSampleIds.push(sampleId);
      }
    }

    return {
      blobMap,
      missingSampleIds,
    };
  }

  function applyProjectDocument({
    importedSampleBlobs,
    project,
  }: {
    importedSampleBlobs: Map<string, Blob>;
    project: PersistedProjectDocument;
  }) {
    const restoredTracks =
      project.arrangementTracks.length > 0
        ? project.arrangementTracks
        : createDefaultArrangementTracks();
    const restoredClips =
      project.clips.length > 0
        ? project.clips
        : [createEmptyHybridClip({ id: DEFAULT_CLIP_ID, name: "Clip 1" })];
    const restoredBpm = clampTempoBpm(project.tempoBpm);
    const restoredArrangementLengthBars = normalizeArrangementLengthBars(
      project.arrangementLengthBars,
    );
    const restoredLoopRange = normalizeArrangementLoopRange(
      project.arrangementLoopRange,
      restoredArrangementLengthBars,
    );
    const restoredTrackMixerStates =
      project.trackMixerStates.length > 0
        ? project.trackMixerStates
        : createDefaultTrackMixerStates(restoredTracks);
    const restoredMasterMixerState =
      project.masterMixerState ?? createDefaultMasterMixerState();
    const restoredClip = restoredClips[0]!;

    stopAudioClipPreview();
    audioEngine.stopLoop();
    setTransportState("stopped");
    commitPlayheadTick(0);
    bpmRef.current = audioEngine.setTempoBpm(restoredBpm).tempoBpm;
    activeProjectIdRef.current = project.id;
    activeProjectCreatedAtRef.current = project.createdAt;
    projectNameRef.current = project.name;
    clipsRef.current = restoredClips;
    arrangementLengthBarsRef.current = restoredArrangementLengthBars;
    arrangementLoopRangeRef.current = restoredLoopRange;
    clipInstancesRef.current = project.clipInstances;
    sampleMetasRef.current = project.sampleMetas;
    selectedClipRef.current = restoredClip;
    trackMixerStatesRef.current = restoredTrackMixerStates;
    masterMixerStateRef.current = restoredMasterMixerState;
    importedSampleBlobsRef.current = importedSampleBlobs;
    runtimeImportedSampleKeysRef.current = new Set();

    setActiveProjectId(project.id);
    setActiveProjectCreatedAt(project.createdAt);
    setProjectName(project.name);
    setBpm(bpmRef.current);
    setClips(restoredClips);
    setArrangementTracks(restoredTracks);
    setArrangementLengthBars(restoredArrangementLengthBars);
    setArrangementLoopRange(restoredLoopRange);
    setClipInstances(project.clipInstances);
    setSampleMetas(project.sampleMetas);
    setTrackMixerStates(restoredTrackMixerStates);
    setMasterMixerState(restoredMasterMixerState);
    setMixerLevels(createEmptyMixerLevels(restoredTracks));
    setSelectedClipId(restoredClip.id);
    setSelectedClipInstanceId(null);
    setAudioError(null);
    setClipImportError(null);
    setArrangementExportError(null);
    setIsAudioClipPreviewPlaying(false);

    if (isAudioClip(restoredClip)) {
      setSelectedInstrumentId("audio");
    } else {
      setSelectedInstrumentId(restoredClip.pitchedInstrumentIds[0] ?? "drums");
      setSelectedPitchedInstrumentId(
        restoredClip.pitchedInstrumentIds[0] ?? DEFAULT_PITCHED_INSTRUMENT_ID,
      );
    }
  }

  async function openProject(projectId: string) {
    const project = await projectStore.loadProject(projectId);

    if (!project) {
      throw new Error("The selected project could not be loaded.");
    }

    const { blobMap, missingSampleIds } = await loadImportedSampleBlobMap(project);
    const collection = await projectStore.setActiveProjectId(project.id);

    applyProjectDocument({
      importedSampleBlobs: blobMap,
      project,
    });
    projectSummariesRef.current = collection.projects;
    setProjectSummaries(collection.projects);
    reportMissingImportedSampleIds(missingSampleIds);
  }

  async function runProjectOperation(operation: () => Promise<void>) {
    setIsProjectOperationPending(true);
    setIsPersistenceReady(false);
    stopAudioClipPreview();
    audioEngine.stopLoop();
    setTransportState("stopped");
    commitPlayheadTick(0);
    setMixerLevels(createEmptyMixerLevels(arrangementTracks));

    try {
      await operation();
    } catch (error) {
      reportPersistenceError(
        error instanceof Error ? error.message : "Project operation failed.",
      );
    } finally {
      setIsPersistenceReady(true);
      setIsProjectOperationPending(false);
    }
  }

  function handleProjectCreate(projectName: string) {
    const nextProjectName = projectName.trim();

    if (!nextProjectName || isProjectOperationPending) {
      return;
    }

    void runProjectOperation(async () => {
      await saveCurrentProjectNow();

      const project = createBlankProjectDocument({
        existingProjectIds: projectSummariesRef.current.map(
          (projectSummary) => projectSummary.id,
        ),
        name: nextProjectName,
      });

      await projectStore.saveProject(project);
      await openProject(project.id);
    });
  }

  function handleProjectSelect(projectId: string) {
    if (projectId === activeProjectIdRef.current || isProjectOperationPending) {
      return;
    }

    void runProjectOperation(async () => {
      await saveCurrentProjectNow();
      await openProject(projectId);
    });
  }

  function handleProjectRename(projectName: string) {
    const nextProjectName = projectName.trim();

    if (
      !nextProjectName ||
      nextProjectName === projectNameRef.current ||
      isProjectOperationPending
    ) {
      return;
    }

    void runProjectOperation(async () => {
      const savedProject = await saveCurrentProjectNow({
        name: nextProjectName,
      });

      if (!savedProject) {
        throw new Error("No active project is available to rename.");
      }

      projectNameRef.current = savedProject.name;
      setProjectName(savedProject.name);
    });
  }

  function handleProjectDelete() {
    const projectId = activeProjectIdRef.current;

    if (!projectId || isProjectOperationPending) {
      return;
    }

    void runProjectOperation(async () => {
      let collection = await projectStore.deleteProject(projectId);

      if (!collection.activeProjectId) {
        const project = createBlankProjectDocument({
          existingProjectIds: collection.projects.map(
            (projectSummary) => projectSummary.id,
          ),
          name: DEFAULT_PROJECT_NAME,
        });

        await projectStore.saveProject(project);
        collection = await projectStore.setActiveProjectId(project.id);
      }

      await openProject(collection.activeProjectId);
    });
  }

  async function persistImportedSampleBlob(sampleId: string, file: File) {
    try {
      const projectId = activeProjectIdRef.current;

      if (!projectId) {
        throw new Error("No active project is available for imported audio.");
      }

      await projectStore.saveImportedSampleBlob({
        blob: file,
        fileName: file.name,
        mimeType: file.type,
        projectId,
        sampleId,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Imported audio file could not be saved locally.";
      durablePersistenceErrorRef.current = message;
      reportPersistenceError(message);
    }
  }

  async function ensureImportedAudioRuntimeSample(
    clip: AudioClip,
  ): Promise<boolean> {
    const projectId = activeProjectIdRef.current;

    if (!projectId) {
      return false;
    }

    const runtimeSampleKey = createRuntimeImportedSampleKey(
      projectId,
      clip.sampleId,
    );

    if (runtimeImportedSampleKeysRef.current.has(runtimeSampleKey)) {
      return true;
    }

    const blob =
      importedSampleBlobsRef.current.get(clip.sampleId) ??
      (await projectStore.loadImportedSampleBlob(projectId, clip.sampleId));

    if (!blob) {
      return false;
    }

    importedSampleBlobsRef.current.set(clip.sampleId, blob);
    await audioEngine.importSampleBlob(clip.sampleId, blob, clip.sourceFileName);
    runtimeImportedSampleKeysRef.current.add(runtimeSampleKey);
    return true;
  }

  async function getImportedSampleBlobsForArrangement(
    instances: readonly ClipInstance[],
  ): Promise<ReadonlyMap<string, Blob>> {
    const importedSampleBlobs = new Map(importedSampleBlobsRef.current);
    const missingClipNames: string[] = [];

    for (const instance of instances) {
      const clip = clipsRef.current.find(
        (candidate) => candidate.id === instance.clipId,
      );

      if (!clip || !isAudioClip(clip) || importedSampleBlobs.has(clip.sampleId)) {
        continue;
      }

      const projectId = activeProjectIdRef.current;
      const blob = projectId
        ? await projectStore.loadImportedSampleBlob(projectId, clip.sampleId)
        : null;

      if (blob) {
        importedSampleBlobs.set(clip.sampleId, blob);
        importedSampleBlobsRef.current.set(clip.sampleId, blob);
        continue;
      }

      missingClipNames.push(clip.name);
    }

    if (missingClipNames.length > 0) {
      throw new Error(
        `Imported audio data is missing for ${missingClipNames.join(
          ", ",
        )}. Re-import the file before exporting.`,
      );
    }

    return importedSampleBlobs;
  }

  async function handleAudioClipPreviewPlay() {
    const clip = selectedClipRef.current;

    if (!isAudioClip(clip)) {
      return;
    }

    setAudioError(null);

    if (transportState !== "stopped") {
      const snapshot = audioEngine.stopLoop();

      setTransportState(snapshot.status);
      commitPlayheadTick(snapshot.currentTick);
    }

    try {
      const hasRuntimeSample = await ensureImportedAudioRuntimeSample(clip);

      if (!hasRuntimeSample) {
        throw new Error(
          `Imported audio data is missing for ${clip.name}. Re-import the file.`,
        );
      }

      await audioEngine.playCachedSample(clip.sampleId, { loop: true });
      setIsAudioClipPreviewPlaying(true);
    } catch (error) {
      markAudioClipPreviewStopped();
      setAudioError(
        error instanceof Error ? error.message : "Audio clip preview failed.",
      );
    }
  }

  function handleDrumStepToggle(
    laneId: DrumLaneId,
    stepIndex: number,
    substepIndex: number,
  ) {
    const clip = getSelectedHybridClip();

    if (!clip) {
      return;
    }

    commitSelectedClip(
      toggleDrumSubstep({
        clip,
        laneId,
        stepIndex,
        substepIndex,
      }),
    );
  }

  function handleDrumStepSubdivisionChange(
    subdivision: DrumStepSubdivision,
  ) {
    const clip = getSelectedHybridClip();

    if (!clip) {
      return;
    }

    commitSelectedClip(
      updateDrumStepSubdivision({
        clip,
        subdivision,
      }),
    );
  }

  function handleClipLengthChange(barCount: HybridClipLengthBars) {
    const clip = getSelectedHybridClip();

    if (!clip) {
      return;
    }

    const lengthTicks = getHybridClipLengthTicks(barCount);

    if (clip.lengthTicks === lengthTicks) {
      return;
    }

    const shouldTrimEvents =
      lengthTicks < clip.lengthTicks &&
      hasHybridClipEventsOutsideLength({
        clip,
        lengthTicks,
      });

    if (shouldTrimEvents) {
      setPendingConfirmation({
        barCount,
        clipId: clip.id,
        confirmLabel: "Shorten Clip",
        detail: clip.name,
        kind: "clip-length-trim",
        message: `Shorten ${clip.name} to ${barCount} bar${
          barCount === 1 ? "" : "s"
        }? Events outside the new length will be removed or trimmed.`,
        title: "Shorten Clip",
      });
      return;
    }

    applyClipLengthChange({
      barCount,
      clipId: clip.id,
      trimEvents: false,
    });
  }

  function applyClipLengthChange({
    barCount,
    clipId,
    trimEvents,
  }: {
    barCount: HybridClipLengthBars;
    clipId: string;
    trimEvents: boolean;
  }) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip || !isHybridClip(clip)) {
      return;
    }

    const lengthTicks = getHybridClipLengthTicks(barCount);

    try {
      const nextClip = updateHybridClipLength({
        clip,
        lengthTicks,
        trimEvents,
      });

      commitSelectedClip(nextClip, {
        syncPlayback: transportMode === "song",
      });
      setAudioError(null);

      if (transportState === "playing" && transportMode !== "song") {
        void restartPatternPlayback(nextClip);
      }
    } catch (error) {
      setAudioError(
        error instanceof Error ? error.message : "Clip length update failed.",
      );
    }
  }

  function handleLaneSampleChange(
    laneId: DrumLaneId,
    sample: BundledSampleMeta,
  ) {
    const clip = getSelectedHybridClip();

    if (!clip) {
      return;
    }

    commitSelectedClip(
      updateDrumLaneSample({
        clip,
        label: sample.name,
        laneId,
        sampleId: sample.id,
      }),
    );
  }

  function handleLaneMove(laneId: DrumLaneId, targetIndex: number) {
    const clip = getSelectedHybridClip();

    if (!clip) {
      return;
    }

    commitSelectedClip(
      moveDrumLane({
        clip,
        laneId,
        targetIndex,
      }),
    );
  }

  function handleNoteCreate({
    durationTicks,
    midiNote,
    startTick,
  }: {
    durationTicks: Tick;
    midiNote: number;
    startTick: Tick;
  }) {
    const clip = getSelectedHybridClip();

    if (
      !clip ||
      !clip.pitchedInstrumentIds.includes(selectedPitchedInstrumentId)
    ) {
      return;
    }

    commitSelectedClip(
      addNoteEvent({
        clip,
        durationTicks,
        instrumentId: selectedPitchedInstrumentId,
        midiNote,
        startTick,
      }),
    );
  }

  function handleNoteDelete(noteId: string) {
    const clip = getSelectedHybridClip();

    if (!clip) {
      return;
    }

    commitSelectedClip(
      deleteNoteEvent({
        clip,
        noteId,
      }),
    );
  }

  function handleNoteMove({
    midiNote,
    noteId,
    startTick,
  }: {
    midiNote: number;
    noteId: string;
    startTick: Tick;
  }) {
    const clip = getSelectedHybridClip();

    if (!clip) {
      return;
    }

    commitSelectedClip(
      moveNoteEvent({
        clip,
        midiNote,
        noteId,
        startTick,
      }),
    );
  }

  function handleClipAdd() {
    const nextClip = createNextHybridClip(clipsRef.current);
    const nextClips = [...clipsRef.current, nextClip];

    clipsRef.current = nextClips;
    setClips(nextClips);
    selectClipAndInstrument(
      nextClip,
      nextClip.pitchedInstrumentIds[0] ?? "drums",
    );

    if (transportState === "playing" && transportMode !== "song") {
      void updatePlayingClipEvents(nextClip);
    }
  }

  async function handleAudioClipImport(file: File) {
    setAudioError(null);
    setClipImportError(null);
    stopAudioClipPreview();

    try {
      validateImportedWavFile(file);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Only WAV files can be imported.";

      setClipImportError(message);
      setAudioError(message);
      return;
    }

    const { clipId, sampleId } = createImportedAudioIds({
      existingClipIds: clipsRef.current.map((clip) => clip.id),
      existingSampleIds: sampleMetasRef.current.map((sampleMeta) => sampleMeta.id),
      fileName: file.name,
    });

    setIsClipImporting(true);

    try {
      const audioBuffer = await audioEngine.importSampleFile(sampleId, file);
      const { clip, sampleMeta } = createImportedAudioClipDraft({
        clipId,
        durationSeconds: audioBuffer.duration,
        fileName: file.name,
        mimeType: file.type,
        sampleId,
      });
      const nextClips = [...clipsRef.current, clip];
      const nextSampleMetas = [...sampleMetasRef.current, sampleMeta];

      importedSampleBlobsRef.current.set(sampleId, file);
      if (activeProjectIdRef.current) {
        runtimeImportedSampleKeysRef.current.add(
          createRuntimeImportedSampleKey(activeProjectIdRef.current, sampleId),
        );
      }
      clipsRef.current = nextClips;
      sampleMetasRef.current = nextSampleMetas;
      setClips(nextClips);
      setSampleMetas(nextSampleMetas);
      selectClipDefault(clip);
      void persistImportedSampleBlob(sampleId, file);

      if (transportState === "playing" && transportMode !== "song") {
        const snapshot = audioEngine.stopLoop();

        setTransportState(snapshot.status);
        commitPlayheadTick(snapshot.currentTick);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to import the selected WAV file.";

      setClipImportError(message);
      setAudioError(message);
    } finally {
      setIsClipImporting(false);
    }
  }

  async function handleArrangementWavExport() {
    if (isArrangementExporting) {
      return;
    }

    setArrangementExportError(null);
    setAudioError(null);
    setIsArrangementExporting(true);

    try {
      const importedSampleBlobs = await getImportedSampleBlobsForArrangement(
        clipInstancesRef.current,
      );
      const exportResult = await renderArrangementToWav({
        arrangementLengthBars: arrangementLengthBarsRef.current,
        clipInstances: clipInstancesRef.current,
        clips: clipsRef.current,
        importedSampleBlobs,
        masterMixerState: masterMixerStateRef.current,
        tempoBpm: bpmRef.current,
        trackMixerStates: trackMixerStatesRef.current,
      });

      downloadBlob(
        exportResult.blob,
        createArrangementExportFileName(projectNameRef.current),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Arrangement WAV export failed.";

      setArrangementExportError(message);
      setAudioError(message);
    } finally {
      setIsArrangementExporting(false);
    }
  }

  function handleClipSelect(clipId: string) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    stopAudioClipPreview();

    if (isAudioClip(clip)) {
      selectClipDefault(clip);

      if (transportState === "playing" && transportMode !== "song") {
        const snapshot = audioEngine.stopLoop();

        setTransportState(snapshot.status);
        commitPlayheadTick(snapshot.currentTick);
      }

      return;
    }

    const nextInstrumentId =
      selectedInstrumentId !== "drums" &&
      selectedInstrumentId !== "audio" &&
      clip.pitchedInstrumentIds.includes(selectedInstrumentId)
        ? selectedInstrumentId
        : "drums";

    selectClipAndInstrument(clip, nextInstrumentId);

    if (transportState === "playing" && transportMode !== "song") {
      void updatePlayingClipEvents(clip);
    }
  }

  function handleClipRename(clipId: string, name: string) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    commitAnyClip(renameClip({ clip, name }));
  }

  function handleClipDuplicate(clipId: string) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    const duplicatedClip = duplicateClip({
      clip,
      existingClipIds: clipsRef.current.map((candidate) => candidate.id),
      existingClipNames: clipsRef.current.map((candidate) => candidate.name),
    });
    const nextClips = [...clipsRef.current, duplicatedClip];

    stopAudioClipPreview();
    clipsRef.current = nextClips;
    setClips(nextClips);
    selectClipDefault(duplicatedClip);

    if (transportState === "playing" && transportMode !== "song") {
      if (isHybridClip(duplicatedClip)) {
        void updatePlayingClipEvents(duplicatedClip);
        return;
      }

      const snapshot = audioEngine.stopLoop();

      setTransportState(snapshot.status);
      commitPlayheadTick(snapshot.currentTick);
    }
  }

  function handleClipDelete(clipId: string) {
    const currentClips = clipsRef.current;

    if (currentClips.length <= 1) {
      return;
    }

    const clipIndex = currentClips.findIndex((clip) => clip.id === clipId);
    const clip = currentClips[clipIndex];

    if (!clip) {
      return;
    }

    const arrangementInstanceCount = clipInstancesRef.current.filter(
      (instance) => instance.clipId === clipId,
    ).length;
    const confirmationMessage = getClipDeleteConfirmationMessage({
      arrangementInstanceCount,
      clip,
    });

    if (confirmationMessage) {
      setPendingConfirmation({
        clipId,
        confirmLabel: "Delete Clip",
        detail: clip.name,
        kind: "clip-delete",
        message: confirmationMessage,
        title: "Delete Clip",
      });
      return;
    }

    deleteClipById(clipId);
  }

  function cancelConfirmation() {
    setPendingConfirmation(null);
  }

  function confirmPendingAction() {
    const confirmation = pendingConfirmation;

    if (!confirmation) {
      return;
    }

    setPendingConfirmation(null);

    if (confirmation.kind === "clip-delete") {
      deleteClipById(confirmation.clipId);
      return;
    }

    if (confirmation.kind === "clip-length-trim") {
      applyClipLengthChange({
        barCount: confirmation.barCount,
        clipId: confirmation.clipId,
        trimEvents: true,
      });
      return;
    }

    if (confirmation.kind === "instrument-remove") {
      removeInstrumentFromClip({
        clipId: confirmation.clipId,
        instrumentId: confirmation.instrumentId,
        removeOwnedNotes: true,
      });
      return;
    }

    applyArrangementLengthChange(confirmation.lengthBars);
  }

  function handleConfirmationDialogKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }

    event.stopPropagation();
    cancelConfirmation();
  }

  function deleteClipById(clipId: string) {
    const currentClips = clipsRef.current;

    if (currentClips.length <= 1) {
      return;
    }

    const clipIndex = currentClips.findIndex((clip) => clip.id === clipId);
    const clip = currentClips[clipIndex];

    if (!clip) {
      return;
    }

    const nextClips = currentClips.filter((candidate) => candidate.id !== clipId);
    const fallbackClip =
      nextClips[Math.max(0, Math.min(clipIndex, nextClips.length - 1))];

    if (!fallbackClip) {
      return;
    }

    clipsRef.current = nextClips;
    setClips(nextClips);
    const nextClipInstances = clipInstancesRef.current.filter(
      (instance) => instance.clipId !== clipId,
    );

    commitClipInstances(nextClipInstances);

    if (
      selectedClipInstanceId &&
      clipInstancesRef.current.every(
        (instance) => instance.id !== selectedClipInstanceId,
      )
    ) {
      setSelectedClipInstanceId(null);
    }

    if (clipId === selectedClipId) {
      stopAudioClipPreview();
      selectClipDefault(fallbackClip);

      if (
        transportState === "playing" &&
        transportMode !== "song" &&
        isHybridClip(fallbackClip)
      ) {
        void updatePlayingClipEvents(fallbackClip);
      } else if (transportState === "playing" && transportMode !== "song") {
        const snapshot = audioEngine.stopLoop();

        setTransportState(snapshot.status);
        commitPlayheadTick(snapshot.currentTick);
      }
    }

    if (transportState === "playing" && transportMode === "song") {
      void updatePlayingArrangementEvents(nextClips, nextClipInstances);
    }
  }

  function handleInstrumentSelect(clipId: string, instrumentId: InstrumentId) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip || !isHybridClip(clip) || instrumentId === "audio") {
      return;
    }

    const isSelectingDifferentClip = clip.id !== selectedClipRef.current.id;

    selectClipAndInstrument(clip, instrumentId);

    if (
      transportState === "playing" &&
      transportMode !== "song" &&
      isSelectingDifferentClip
    ) {
      void updatePlayingClipEvents(clip);
    }
  }

  function handleInstrumentAdd(
    clipId: string,
    instrumentId: PitchedInstrumentId,
  ) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip || !isHybridClip(clip)) {
      return;
    }

    const nextClip = addPitchedInstrumentToClip({ clip, instrumentId });
    const isSelectingDifferentClip = nextClip.id !== selectedClipRef.current.id;

    commitClip(nextClip);
    selectClipAndInstrument(nextClip, instrumentId);

    if (
      transportState === "playing" &&
      transportMode !== "song" &&
      isSelectingDifferentClip
    ) {
      void updatePlayingClipEvents(nextClip);
    }
  }

  function handleInstrumentRemove(
    clipId: string,
    instrumentId: PitchedInstrumentId,
  ) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip || !isHybridClip(clip)) {
      return;
    }

    const hasOwnedNotes = hasNoteEventsForPitchedInstrument({
      clip,
      instrumentId,
    });

    if (hasOwnedNotes) {
      const instrumentName = getPitchedInstrument(instrumentId)?.name ?? instrumentId;

      setPendingConfirmation({
        clipId,
        confirmLabel: "Remove Instrument",
        detail: `${clip.name} / ${instrumentName}`,
        instrumentId,
        kind: "instrument-remove",
        message:
          "Remove this instrument and delete its piano roll notes from the clip?",
        title: "Remove Instrument",
      });
      return;
    }

    removeInstrumentFromClip({
      clipId,
      instrumentId,
      removeOwnedNotes: false,
    });
  }

  function removeInstrumentFromClip({
    clipId,
    instrumentId,
    removeOwnedNotes,
  }: {
    clipId: string;
    instrumentId: PitchedInstrumentId;
    removeOwnedNotes: boolean;
  }) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip || !isHybridClip(clip)) {
      return;
    }

    const nextClip = removePitchedInstrumentFromClip({
      clip,
      instrumentId,
      removeOwnedNotes,
    });

    commitClip(nextClip);

    if (clip.id === selectedClipId && selectedInstrumentId === instrumentId) {
      selectClipAndInstrument(
        nextClip,
        nextClip.pitchedInstrumentIds[0] ?? "drums",
      );
    }
  }

  function handleArrangementClipDrop({
    clipId,
    startTick,
    trackId,
  }: {
    clipId: string;
    startTick: Tick;
    trackId: string;
  }) {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    const nextInstance = createClipInstance({
      clip,
      existingInstanceIds: clipInstancesRef.current.map(
        (instance) => instance.id,
      ),
      startTick,
      tempoBpm: bpmRef.current,
      trackId,
    });
    const nextClipInstances = [...clipInstancesRef.current, nextInstance];

    commitClipInstances(nextClipInstances);
    setSelectedClipInstanceId(nextInstance.id);
    setAudioError(null);

    if (transportState === "playing" && transportMode === "song") {
      void updatePlayingArrangementEvents(clipsRef.current, nextClipInstances);
    }
  }

  function handleClipInstanceMove({
    instanceId,
    startTick,
    trackId,
  }: {
    instanceId: string;
    startTick: Tick;
    trackId: string;
  }) {
    const nextClipInstances = clipInstancesRef.current.map((instance) =>
      instance.id === instanceId
        ? moveClipInstance({ instance, startTick, trackId })
        : instance,
    );

    commitClipInstances(nextClipInstances);
    setSelectedClipInstanceId(instanceId);

    if (transportState === "playing" && transportMode === "song") {
      void updatePlayingArrangementEvents(clipsRef.current, nextClipInstances);
    }
  }

  function handleClipInstanceDelete(instanceId: string) {
    const nextClipInstances = deleteClipInstance(
      clipInstancesRef.current,
      instanceId,
    );

    commitClipInstances(nextClipInstances);

    if (selectedClipInstanceId === instanceId) {
      setSelectedClipInstanceId(null);
    }

    if (transportState === "playing" && transportMode === "song") {
      void updatePlayingArrangementEvents(clipsRef.current, nextClipInstances);
    }
  }

  function handleArrangementLengthChange(nextLengthBars: number) {
    const normalizedLengthBars = normalizeArrangementLengthBars(nextLengthBars);

    if (normalizedLengthBars === arrangementLengthBarsRef.current) {
      return;
    }

    const currentClipInstances = clipInstancesRef.current;
    const outOfRangeInstances = getClipInstancesOutsideArrangementLength({
      instances: currentClipInstances,
      lengthBars: normalizedLengthBars,
    });

    if (outOfRangeInstances.length > 0) {
      setPendingConfirmation({
        confirmLabel: "Shorten Arrangement",
        detail: `${outOfRangeInstances.length} clip placement${
          outOfRangeInstances.length === 1 ? "" : "s"
        } will be removed`,
        kind: "arrangement-length-trim",
        lengthBars: normalizedLengthBars,
        message: `Shorten arrangement to ${normalizedLengthBars} bar${
          normalizedLengthBars === 1 ? "" : "s"
        }? ${outOfRangeInstances.length} clip placement${
          outOfRangeInstances.length === 1 ? "" : "s"
        } beyond the new end will be removed.`,
        title: "Shorten Arrangement",
      });
      return;
    }

    applyArrangementLengthChange(normalizedLengthBars);
  }

  function applyArrangementLengthChange(nextLengthBars: number) {
    const normalizedLengthBars = normalizeArrangementLengthBars(nextLengthBars);

    if (normalizedLengthBars === arrangementLengthBarsRef.current) {
      return;
    }

    const currentClipInstances = clipInstancesRef.current;
    const outOfRangeInstances = getClipInstancesOutsideArrangementLength({
      instances: currentClipInstances,
      lengthBars: normalizedLengthBars,
    });
    const nextClipInstances =
      outOfRangeInstances.length > 0
        ? removeClipInstancesOutsideArrangementLength({
            instances: currentClipInstances,
            lengthBars: normalizedLengthBars,
          })
        : currentClipInstances;
    const nextLoopRange = normalizeArrangementLoopRange(
      arrangementLoopRangeRef.current,
      normalizedLengthBars,
    );

    arrangementLengthBarsRef.current = normalizedLengthBars;
    setArrangementLengthBars(normalizedLengthBars);
    commitArrangementLoopRange(nextLoopRange, normalizedLengthBars);

    if (nextClipInstances !== currentClipInstances) {
      commitClipInstances(nextClipInstances);

      if (
        selectedClipInstanceId &&
        nextClipInstances.every((instance) => instance.id !== selectedClipInstanceId)
      ) {
        setSelectedClipInstanceId(null);
      }
    }

    setAudioError(null);

    if (transportState === "playing" && transportMode === "song") {
      void restartArrangementPlayback(playheadTickRef.current, nextLoopRange);
    }
  }

  function handleArrangementLoopRangeChange(nextLoopRange: ArrangementLoopRange) {
    const normalizedLoopRange = normalizeArrangementLoopRange(
      nextLoopRange,
      arrangementLengthBarsRef.current,
    );

    commitArrangementLoopRange(normalizedLoopRange);
    setAudioError(null);

    if (transportState === "playing" && transportMode === "song") {
      void restartArrangementPlayback(normalizedLoopRange.startTick, normalizedLoopRange);
    }
  }

  function handleTransportModeChange(nextTransportMode: TransportMode) {
    if (nextTransportMode === transportMode) {
      return;
    }

    stopAudioClipPreview();
    setMixerLevels(createEmptyMixerLevels(arrangementTracks));

    if (transportState !== "stopped") {
      const snapshot = audioEngine.stopLoop();

      setTransportState(snapshot.status);
      commitPlayheadTick(snapshot.currentTick);
    }

    setTransportMode(nextTransportMode);
  }

  async function restartArrangementPlayback(
    startTick: Tick,
    loopRange = arrangementLoopRangeRef.current,
  ) {
    try {
      const snapshot = await startArrangementPlayback(startTick, loopRange);

      setTransportState("playing");
      commitPlayheadTick(snapshot.currentTick);
    } catch (error) {
      setTransportState("stopped");
      commitPlayheadTick(audioEngine.stopLoop().currentTick);
      setMixerLevels(createEmptyMixerLevels(arrangementTracks));
      setAudioError(
        error instanceof Error ? error.message : "Arrangement playback failed.",
      );
    }
  }

  async function startArrangementPlayback(
    startTick: Tick,
    loopRange = arrangementLoopRangeRef.current,
  ) {
    const currentClipInstances = clipInstancesRef.current;
    const normalizedLoopRange = normalizeArrangementLoopRange(
      loopRange,
      arrangementLengthBarsRef.current,
    );

    if (currentClipInstances.length === 0) {
      throw new Error("Place at least one clip in the arrangement before playback.");
    }

    const missingImportedAudioClipNames = await getMissingImportedAudioRuntimeClipNames(
      currentClipInstances,
    );

    if (missingImportedAudioClipNames.length > 0) {
      throw new Error(
        `Imported audio data is missing for ${missingImportedAudioClipNames.join(
          ", ",
        )}. Re-import the file in this session to play it.`,
      );
    }

    const playbackEvents = buildArrangementPlaybackEvents({
      clipInstances: currentClipInstances,
      clips: clipsRef.current,
    });

    audioEngine.setTrackMixerStates(trackMixerStatesRef.current);
    audioEngine.setMasterMixerState(masterMixerStateRef.current);

    return audioEngine.startClipLoop({
      loopEndTick: normalizedLoopRange.endTick,
      loopStartTick: normalizedLoopRange.startTick,
      noteEvents: playbackEvents.noteEvents,
      sampleEvents: playbackEvents.sampleEvents,
      startTick: getArrangementPlaybackStartTick(startTick, normalizedLoopRange),
      tempoBpm: bpmRef.current,
    });
  }

  async function updatePlayingArrangementEvents(
    nextClips = clipsRef.current,
    nextClipInstances = clipInstancesRef.current,
  ) {
    setAudioError(null);

    try {
      const missingImportedAudioClipNames =
        await getMissingImportedAudioRuntimeClipNames(nextClipInstances);

      if (missingImportedAudioClipNames.length > 0) {
        throw new Error(
          `Imported audio data is missing for ${missingImportedAudioClipNames.join(
            ", ",
          )}. Re-import the file in this session to play it.`,
        );
      }

      const playbackEvents = buildArrangementPlaybackEvents({
        clipInstances: nextClipInstances,
        clips: nextClips,
      });

      await audioEngine.updateClipLoopEvents({
        noteEvents: playbackEvents.noteEvents,
        sampleEvents: playbackEvents.sampleEvents,
      });
    } catch (error) {
      setAudioError(
        error instanceof Error
          ? error.message
          : "Arrangement playback update failed.",
      );
    }
  }

  function buildArrangementPlaybackEvents({
    clipInstances: instances,
    clips: sourceClips,
  }: {
    clipInstances: readonly ClipInstance[];
    clips: readonly Clip[];
  }) {
    const playbackEvents = expandClipInstancesForPlayback({
      clipInstances: instances,
      clips: sourceClips,
    });

    if (playbackEvents.missingClipIds.length > 0) {
      throw new Error(
        `Arrangement contains missing source clips: ${playbackEvents.missingClipIds.join(
          ", ",
        )}.`,
      );
    }

    return playbackEvents;
  }

  async function getMissingImportedAudioRuntimeClipNames(
    instances: readonly ClipInstance[],
  ): Promise<string[]> {
    const missingClipNames: string[] = [];

    for (const instance of instances) {
      const clip = clipsRef.current.find(
        (candidate) => candidate.id === instance.clipId,
      );

      if (!clip || !isAudioClip(clip)) {
        continue;
      }

      if (!(await ensureImportedAudioRuntimeSample(clip))) {
        missingClipNames.push(clip.name);
      }
    }

    return missingClipNames;
  }

  function getArrangementPlaybackStartTick(
    startTick: Tick,
    loopRange: ArrangementLoopRange,
  ): Tick {
    if (startTick >= loopRange.startTick && startTick < loopRange.endTick) {
      return startTick;
    }

    return loopRange.startTick;
  }

  async function startPatternPlayback(clip: HybridClip, startTick: Tick) {
    return audioEngine.startClipLoop({
      loopEndTick: clip.lengthTicks,
      noteEvents: noteEventsToNoteLoopEvents(
        clip.noteEvents,
      ),
      sampleEvents: drumEventsToSampleLoopEvents(
        clip.drumEvents,
      ),
      startTick,
      tempoBpm: bpmRef.current,
    });
  }

  async function restartPatternPlayback(
    clip: HybridClip,
    startTick = playheadTickRef.current,
  ) {
    try {
      const snapshot = await startPatternPlayback(clip, startTick);

      setTransportState("playing");
      commitPlayheadTick(snapshot.currentTick);
    } catch (error) {
      setTransportState("stopped");
      commitPlayheadTick(audioEngine.stopLoop().currentTick);
      setAudioError(
        error instanceof Error ? error.message : "Audio playback failed.",
      );
    }
  }

  async function handleTransportStateChange(nextTransportState: TransportState) {
    setAudioError(null);

    if (nextTransportState === "stopped") {
      stopAudioClipPreview();
      const snapshot = audioEngine.stopLoop();
      setTransportState(snapshot.status);
      commitPlayheadTick(snapshot.currentTick);
      setMixerLevels(createEmptyMixerLevels(arrangementTracks));
      return;
    }

    if (nextTransportState === "paused") {
      stopAudioClipPreview();
      const snapshot = audioEngine.pauseLoop();
      setTransportState(snapshot.status);
      commitPlayheadTick(snapshot.currentTick);
      setMixerLevels(createEmptyMixerLevels(arrangementTracks));
      return;
    }

    const startTick = transportState === "paused" ? playheadTickRef.current : 0;
    const clip = selectedClipRef.current;
    stopAudioClipPreview();

    if (transportMode === "song") {
      setTransportState("playing");
      await restartArrangementPlayback(startTick);

      return;
    }

    if (!isHybridClip(clip)) {
      await handleAudioClipPreviewPlay();
      return;
    }

    setTransportState("playing");

    try {
      const snapshot = await startPatternPlayback(clip, startTick);
      commitPlayheadTick(snapshot.currentTick);
    } catch (error) {
      setTransportState("stopped");
      commitPlayheadTick(audioEngine.stopLoop().currentTick);
      setAudioError(
        error instanceof Error ? error.message : "Audio playback failed.",
      );
    }
  }

  async function updatePlayingClipEvents(clip: HybridClip) {
    setAudioError(null);

    try {
      await audioEngine.updateClipLoopEvents({
        noteEvents: noteEventsToNoteLoopEvents(clip.noteEvents),
        sampleEvents: drumEventsToSampleLoopEvents(clip.drumEvents),
      });
    } catch (error) {
      setAudioError(
        error instanceof Error ? error.message : "Audio clip update failed.",
      );
    }
  }

  return (
    <div className={styles.appShell}>
      <TransportBar
        activeProjectId={activeProjectId}
        bpm={bpm}
        isProjectOperationPending={isProjectOperationPending}
        mode={transportMode}
        onBpmChange={commitBpm}
        onModeChange={handleTransportModeChange}
        onProjectCreate={handleProjectCreate}
        onProjectDelete={handleProjectDelete}
        onProjectRename={handleProjectRename}
        onProjectSelect={handleProjectSelect}
        onTransportStateChange={handleTransportStateChange}
        persistenceStatusLabel={getPersistenceStatusLabel(persistenceStatus)}
        persistenceStatusTitle={persistenceError ?? undefined}
        persistenceStatusTone={persistenceStatus === "error" ? "error" : "default"}
        projectName={projectName}
        projects={projectSummaries}
        transportState={transportState}
      />

      <div className={styles.mainLayout}>
        <ProjectSidebar
          arrangementExportError={arrangementExportError}
          clipImportError={clipImportError}
          clips={clips}
          isArrangementExporting={isArrangementExporting}
          isClipImporting={isClipImporting}
          onArrangementExport={handleArrangementWavExport}
          onClipAdd={handleClipAdd}
          onClipDelete={handleClipDelete}
          onClipDuplicate={handleClipDuplicate}
          onClipImport={handleAudioClipImport}
          onClipRename={handleClipRename}
          onClipSelect={handleClipSelect}
          onInstrumentAdd={handleInstrumentAdd}
          onInstrumentRemove={handleInstrumentRemove}
          onInstrumentSelect={handleInstrumentSelect}
          projectName={projectName}
          selectedClipId={selectedClip.id}
          selectedInstrumentId={selectedInstrumentId}
        />

        <main
          className={`${styles.workspace} ${
            transportMode === "song" ? styles.workspaceSong : ""
          }`}
          aria-label={
            transportMode === "song" ? "Arrangement workspace" : "Hybrid clip editor"
          }
        >
          {transportMode === "song" ? (
            <ArrangementView
              arrangementLengthBars={arrangementLengthBars}
              clipInstances={clipInstances}
              clips={clips}
              errorMessage={audioError}
              loopRange={arrangementLoopRange}
              maxArrangementLengthBars={MAX_ARRANGEMENT_LENGTH_BARS}
              minArrangementLengthBars={MIN_ARRANGEMENT_LENGTH_BARS}
              onArrangementLengthChange={handleArrangementLengthChange}
              onClipDrop={handleArrangementClipDrop}
              onClipInstanceDelete={handleClipInstanceDelete}
              onClipInstanceMove={handleClipInstanceMove}
              onClipInstanceSelect={setSelectedClipInstanceId}
              onLoopRangeChange={handleArrangementLoopRangeChange}
              onMasterVolumeChange={handleMasterVolumeChange}
              onTrackEffectChange={handleTrackEffectChange}
              onTrackMuteToggle={handleTrackMuteToggle}
              onTrackSoloToggle={handleTrackSoloToggle}
              onTrackVolumeChange={handleTrackVolumeChange}
              playheadTick={playheadTick}
              masterMixerState={masterMixerState}
              mixerLevels={mixerLevels}
              selectedClipInstanceId={selectedClipInstanceId}
              shouldShowPlayhead={shouldShowPlayhead}
              trackMixerStates={trackMixerStates}
              tracks={arrangementTracks}
            />
          ) : selectedAudioClip ? (
            <>
              <header className={styles.workspaceHeader}>
                <div>
                  <p className={styles.eyebrow}>Imported Audio Clip</p>
                  <h1 className={styles.title}>{selectedAudioClip.name}</h1>
                </div>
                <div className={styles.clipMeta}>
                  <span>WAV</span>
                  <span>{selectedAudioClip.durationSeconds.toFixed(2)} sec</span>
                  <span>Stored locally</span>
                  {audioError ? (
                    <span className={styles.errorMeta}>{audioError}</span>
                  ) : null}
                </div>
              </header>

              <div className={styles.singlePanel}>
                <AudioClipDetails
                  clip={selectedAudioClip}
                  errorMessage={audioError}
                  isPreviewPlaying={isAudioClipPreviewPlaying}
                  onPreviewPlay={handleAudioClipPreviewPlay}
                  onPreviewStop={stopAudioClipPreview}
                  sampleMeta={selectedSampleMeta}
                />
              </div>
            </>
          ) : selectedHybridClip ? (
            <>
              <header className={styles.workspaceHeader}>
                <div>
                  <p className={styles.eyebrow}>M1 Hybrid Clip Editor</p>
                  <h1 className={styles.title}>{selectedHybridClip.name}</h1>
                </div>
                <div className={styles.clipMeta}>
                  <div
                    className={styles.lengthControl}
                    role="group"
                    aria-label="Clip length"
                  >
                    {HYBRID_CLIP_LENGTH_BARS.map((barCount) => {
                      const isSelected =
                        getHybridClipBarCount(selectedHybridClip.lengthTicks) ===
                        barCount;

                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`${styles.lengthButton} ${
                            isSelected ? styles.lengthButtonActive : ""
                          }`}
                          key={barCount}
                          onClick={() => handleClipLengthChange(barCount)}
                          type="button"
                        >
                          {barCount} bar{barCount === 1 ? "" : "s"}
                        </button>
                      );
                    })}
                  </div>
                  <span>4/4</span>
                  <span>PPQ 480</span>
                  <span>{selectedHybridClip.drumEvents.length} drum events</span>
                  <span>{selectedHybridClip.noteEvents.length} note events</span>
                  {audioError ? (
                    <span className={styles.errorMeta}>{audioError}</span>
                  ) : null}
                </div>
              </header>

              <div className={styles.editorStack}>
                <DrumSequencer
                  clipLengthTicks={selectedHybridClip.lengthTicks}
                  drumEvents={selectedHybridClip.drumEvents}
                  drumLanes={selectedHybridClip.drumLanes}
                  drumStepSubdivision={selectedHybridClip.drumStepSubdivision}
                  onLaneMove={handleLaneMove}
                  onLaneSampleChange={handleLaneSampleChange}
                  onSubdivisionChange={handleDrumStepSubdivisionChange}
                  playheadTick={playheadTick}
                  shouldShowPlayhead={shouldShowPlayhead}
                  onStepToggle={handleDrumStepToggle}
                  samples={BUNDLED_DRUM_SAMPLES}
                />
                <PianoRoll
                  clipLengthTicks={selectedHybridClip.lengthTicks}
                  instrumentName={selectedPitchedInstrumentName}
                  noteEvents={selectedPitchedNoteEvents}
                  onNoteCreate={handleNoteCreate}
                  onNoteDelete={handleNoteDelete}
                  onNoteMove={handleNoteMove}
                  playheadTick={playheadTick}
                  shouldShowPlayhead={shouldShowPlayhead}
                />
              </div>
            </>
          ) : (
            null
          )}
        </main>
      </div>

      {pendingConfirmation ? (
        <div
          className={styles.dialogOverlay}
          onMouseDown={cancelConfirmation}
          role="presentation"
        >
          <div
            aria-labelledby="destructive-confirmation-dialog-title"
            aria-modal="true"
            className={styles.dialogCard}
            onKeyDown={handleConfirmationDialogKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className={styles.dialogHeader}>
              <h2
                className={styles.dialogTitle}
                id="destructive-confirmation-dialog-title"
              >
                {pendingConfirmation.title}
              </h2>
              <button
                aria-label="Close confirmation dialog"
                className={styles.dialogCloseButton}
                onClick={cancelConfirmation}
                type="button"
              >
                <Icon name="close" />
              </button>
            </div>

            <p className={styles.dialogBody}>{pendingConfirmation.message}</p>
            <p className={styles.dialogMeta}>{pendingConfirmation.detail}</p>

            <div className={styles.dialogActions}>
              <button
                className={styles.dialogSecondaryButton}
                onClick={cancelConfirmation}
                ref={confirmationCancelButtonRef}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.dialogDangerButton}
                onClick={confirmPendingAction}
                type="button"
              >
                {pendingConfirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
