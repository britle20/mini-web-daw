import type {
  ArrangementLoopRange,
  ArrangementTrack,
  Clip,
  ClipInstance,
  MasterMixerState,
  SampleMeta,
  TrackMixerState,
} from "../model";
import {
  DEFAULT_ARRANGEMENT_LENGTH_BARS,
  normalizeTrackMixerState,
  normalizeArrangementLengthBars,
} from "../model";

export const ACTIVE_PROJECT_ID = "active-project";
export const DEFAULT_PROJECT_ID = "project-1";
export const PROJECT_DOCUMENT_VERSION = 1;

const DATABASE_NAME = "mini-daw-project-store";
const DATABASE_VERSION = 2;
const PROJECT_STORE_NAME = "projects";
const PROJECT_META_STORE_NAME = "projectMeta";
const LEGACY_SAMPLE_BLOB_STORE_NAME = "sampleBlobs";
const PROJECT_SAMPLE_BLOB_STORE_NAME = "projectSampleBlobs";
const PROJECT_COLLECTION_ID = "project-collection";
const SAMPLE_BLOB_KEY_SEPARATOR = "::";

export interface ProjectSummary {
  createdAt: number;
  id: string;
  name: string;
  updatedAt: number;
}

export interface ProjectCollectionState {
  activeProjectId: string;
  projects: ProjectSummary[];
}

export interface PersistedProjectDocument {
  arrangementLengthBars: number;
  arrangementLoopRange: ArrangementLoopRange;
  arrangementTracks: ArrangementTrack[];
  clipInstances: ClipInstance[];
  clips: Clip[];
  createdAt: number;
  id: string;
  masterMixerState: MasterMixerState;
  name: string;
  sampleMetas: SampleMeta[];
  savedAt: number;
  tempoBpm: number;
  trackMixerStates: TrackMixerState[];
  version: typeof PROJECT_DOCUMENT_VERSION;
}

export interface CreatePersistedProjectDocumentOptions {
  arrangementLengthBars: number;
  arrangementLoopRange: ArrangementLoopRange;
  arrangementTracks: readonly ArrangementTrack[];
  clipInstances: readonly ClipInstance[];
  clips: readonly Clip[];
  createdAt?: number;
  id: string;
  masterMixerState: MasterMixerState;
  name: string;
  sampleMetas: readonly SampleMeta[];
  savedAt?: number;
  tempoBpm: number;
  trackMixerStates: readonly TrackMixerState[];
}

export interface ImportedSampleBlobRecord {
  blob: Blob;
  fileName?: string;
  id: string;
  mimeType?: string;
  projectId: string;
  sampleId: string;
  updatedAt: number;
}

export interface SaveImportedSampleBlobOptions {
  blob: Blob;
  fileName?: string;
  mimeType?: string;
  projectId: string;
  sampleId: string;
  updatedAt?: number;
}

export interface ProjectStore {
  deleteProject(projectId: string): Promise<ProjectCollectionState>;
  loadActiveProject(): Promise<PersistedProjectDocument | null>;
  loadImportedSampleBlob(projectId: string, sampleId: string): Promise<Blob | null>;
  loadProject(projectId: string): Promise<PersistedProjectDocument | null>;
  loadProjectCollection(): Promise<ProjectCollectionState>;
  saveActiveProject(project: PersistedProjectDocument): Promise<void>;
  saveImportedSampleBlob(options: SaveImportedSampleBlobOptions): Promise<void>;
  saveProject(project: PersistedProjectDocument): Promise<void>;
  setActiveProjectId(projectId: string): Promise<ProjectCollectionState>;
}

export function createPersistedProjectDocument({
  arrangementLengthBars,
  arrangementLoopRange,
  arrangementTracks,
  clipInstances,
  clips,
  createdAt,
  id,
  masterMixerState,
  name,
  sampleMetas,
  savedAt = Date.now(),
  tempoBpm,
  trackMixerStates,
}: CreatePersistedProjectDocumentOptions): PersistedProjectDocument {
  return {
    arrangementLengthBars: normalizeArrangementLengthBars(arrangementLengthBars),
    arrangementLoopRange,
    arrangementTracks: [...arrangementTracks],
    clipInstances: [...clipInstances],
    clips: [...clips],
    createdAt: createdAt ?? savedAt,
    id,
    masterMixerState: { ...masterMixerState },
    name,
    sampleMetas: [...sampleMetas],
    savedAt,
    tempoBpm,
    trackMixerStates: trackMixerStates.map((state) =>
      normalizeTrackMixerState(state),
    ),
    version: PROJECT_DOCUMENT_VERSION,
  };
}

export function createProjectId(existingProjectIds: readonly string[]): string {
  const existingProjectIdSet = new Set(existingProjectIds);
  let nextProjectNumber = existingProjectIds.reduce((highestProjectNumber, id) => {
    const match = /^project-(\d+)$/u.exec(id);
    const projectNumber = match ? Number.parseInt(match[1] ?? "", 10) : 0;

    return Math.max(
      highestProjectNumber,
      Number.isNaN(projectNumber) ? 0 : projectNumber,
    );
  }, 0) + 1;
  let projectId = `project-${nextProjectNumber}`;

  while (existingProjectIdSet.has(projectId)) {
    nextProjectNumber += 1;
    projectId = `project-${nextProjectNumber}`;
  }

  return projectId;
}

export function createProjectSummary(
  project: Pick<PersistedProjectDocument, "createdAt" | "id" | "name" | "savedAt">,
): ProjectSummary {
  return {
    createdAt: project.createdAt,
    id: project.id,
    name: project.name,
    updatedAt: project.savedAt,
  };
}

export function createProjectCollectionState({
  activeProjectId,
  projects,
}: {
  activeProjectId: string;
  projects: readonly ProjectSummary[];
}): ProjectCollectionState {
  const normalizedProjects = dedupeProjectSummaries(projects);
  const activeProjectExists = normalizedProjects.some(
    (project) => project.id === activeProjectId,
  );

  return {
    activeProjectId: activeProjectExists
      ? activeProjectId
      : normalizedProjects[0]?.id ?? "",
    projects: normalizedProjects,
  };
}

export function upsertProjectSummary({
  collection,
  project,
}: {
  collection: ProjectCollectionState;
  project: PersistedProjectDocument;
}): ProjectCollectionState {
  const summary = createProjectSummary(project);
  const hasProject = collection.projects.some(
    (candidate) => candidate.id === project.id,
  );
  const projects = hasProject
    ? collection.projects.map((candidate) =>
        candidate.id === project.id ? summary : candidate,
      )
    : [...collection.projects, summary];

  return createProjectCollectionState({
    activeProjectId: collection.activeProjectId || project.id,
    projects,
  });
}

export function removeProjectSummary({
  collection,
  projectId,
}: {
  collection: ProjectCollectionState;
  projectId: string;
}): ProjectCollectionState {
  const projects = collection.projects.filter((project) => project.id !== projectId);

  return createProjectCollectionState({
    activeProjectId:
      collection.activeProjectId === projectId
        ? projects[0]?.id ?? ""
        : collection.activeProjectId,
    projects,
  });
}

export function getImportedSampleIds(
  project: Pick<PersistedProjectDocument, "sampleMetas">,
): string[] {
  return project.sampleMetas
    .filter((sampleMeta) => sampleMeta.source.kind === "imported")
    .map((sampleMeta) => sampleMeta.id);
}

export function migratePersistedProjectDocument(
  value: unknown,
): PersistedProjectDocument | null {
  if (!isRecord(value) || value.version !== PROJECT_DOCUMENT_VERSION) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.savedAt !== "number" ||
    typeof value.tempoBpm !== "number" ||
    !Array.isArray(value.arrangementTracks) ||
    !Array.isArray(value.clipInstances) ||
    !Array.isArray(value.clips) ||
    !Array.isArray(value.sampleMetas) ||
    !Array.isArray(value.trackMixerStates) ||
    !isRecord(value.arrangementLoopRange) ||
    !isRecord(value.masterMixerState)
  ) {
    return null;
  }

  return {
    ...(value as unknown as PersistedProjectDocument),
    arrangementLengthBars:
      typeof value.arrangementLengthBars === "number"
        ? normalizeArrangementLengthBars(value.arrangementLengthBars)
        : DEFAULT_ARRANGEMENT_LENGTH_BARS,
    createdAt:
      typeof value.createdAt === "number" ? value.createdAt : value.savedAt,
    trackMixerStates: value.trackMixerStates
      .filter((state): state is TrackMixerState => isRecord(state))
      .map((state) => normalizeTrackMixerState(state)),
  };
}

export function migrateProjectCollectionState(
  value: unknown,
): ProjectCollectionState | null {
  if (
    !isRecord(value) ||
    typeof value.activeProjectId !== "string" ||
    !Array.isArray(value.projects)
  ) {
    return null;
  }

  const projects = value.projects.filter(isProjectSummary);

  if (projects.length !== value.projects.length) {
    return null;
  }

  return createProjectCollectionState({
    activeProjectId: value.activeProjectId,
    projects,
  });
}

export function createProjectSampleBlobId(
  projectId: string,
  sampleId: string,
): string {
  return `${projectId}${SAMPLE_BLOB_KEY_SEPARATOR}${sampleId}`;
}

export function createIndexedDbProjectStore(
  databaseName = DATABASE_NAME,
): ProjectStore {
  return new IndexedDbProjectStore(databaseName);
}

class IndexedDbProjectStore implements ProjectStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly databaseName: string) {}

  async loadProjectCollection(): Promise<ProjectCollectionState> {
    const database = await this.getDatabase();
    const value = await getFromObjectStore(
      database,
      PROJECT_META_STORE_NAME,
      PROJECT_COLLECTION_ID,
    );
    const collection = migrateProjectCollectionState(value);

    if (collection) {
      return collection;
    }

    const legacyProject = await this.loadProject(ACTIVE_PROJECT_ID);

    if (!legacyProject) {
      return createProjectCollectionState({
        activeProjectId: "",
        projects: [],
      });
    }

    const migratedProject: PersistedProjectDocument = {
      ...legacyProject,
      id: DEFAULT_PROJECT_ID,
    };
    const migratedCollection = createProjectCollectionState({
      activeProjectId: migratedProject.id,
      projects: [createProjectSummary(migratedProject)],
    });

    await putIntoObjectStore(database, PROJECT_STORE_NAME, migratedProject);
    await migrateLegacySampleBlobs({
      database,
      project: migratedProject,
    });
    await putIntoObjectStore(
      database,
      PROJECT_META_STORE_NAME,
      createStoredProjectCollection(migratedCollection),
    );

    return migratedCollection;
  }

  async loadActiveProject(): Promise<PersistedProjectDocument | null> {
    const collection = await this.loadProjectCollection();

    if (collection.activeProjectId) {
      const activeProject = await this.loadProject(collection.activeProjectId);

      if (activeProject) {
        return activeProject;
      }
    }

    const fallbackProjectId = collection.projects[0]?.id;

    return fallbackProjectId ? this.loadProject(fallbackProjectId) : null;
  }

  async loadProject(projectId: string): Promise<PersistedProjectDocument | null> {
    const database = await this.getDatabase();
    const value = await getFromObjectStore(database, PROJECT_STORE_NAME, projectId);

    return migratePersistedProjectDocument(value);
  }

  async saveActiveProject(project: PersistedProjectDocument): Promise<void> {
    await this.saveProject(project);
    await this.setActiveProjectId(project.id);
  }

  async saveProject(project: PersistedProjectDocument): Promise<void> {
    const database = await this.getDatabase();

    await putIntoObjectStore(database, PROJECT_STORE_NAME, project);

    const collection = await this.loadProjectCollection();
    const nextCollection = upsertProjectSummary({
      collection,
      project,
    });

    await putIntoObjectStore(
      database,
      PROJECT_META_STORE_NAME,
      createStoredProjectCollection(nextCollection),
    );
  }

  async setActiveProjectId(projectId: string): Promise<ProjectCollectionState> {
    const database = await this.getDatabase();
    const collection = await this.loadProjectCollection();
    const nextCollection = createProjectCollectionState({
      activeProjectId: projectId,
      projects: collection.projects,
    });

    await putIntoObjectStore(
      database,
      PROJECT_META_STORE_NAME,
      createStoredProjectCollection(nextCollection),
    );

    return nextCollection;
  }

  async deleteProject(projectId: string): Promise<ProjectCollectionState> {
    const database = await this.getDatabase();
    const collection = await this.loadProjectCollection();
    const project = await this.loadProject(projectId);
    const nextCollection = removeProjectSummary({
      collection,
      projectId,
    });

    await deleteFromObjectStore(database, PROJECT_STORE_NAME, projectId);
    await deleteProjectSampleBlobs(database, projectId);

    if (
      project &&
      (project.id === DEFAULT_PROJECT_ID || project.id === ACTIVE_PROJECT_ID)
    ) {
      await deleteLegacySampleBlobs({
        database,
        project,
      });
    }

    await putIntoObjectStore(
      database,
      PROJECT_META_STORE_NAME,
      createStoredProjectCollection(nextCollection),
    );

    return nextCollection;
  }

  async loadImportedSampleBlob(
    projectId: string,
    sampleId: string,
  ): Promise<Blob | null> {
    const database = await this.getDatabase();
    const scopedValue = await getFromObjectStore(
      database,
      PROJECT_SAMPLE_BLOB_STORE_NAME,
      createProjectSampleBlobId(projectId, sampleId),
    );

    if (isImportedSampleBlobRecord(scopedValue)) {
      return scopedValue.blob;
    }

    if (projectId !== DEFAULT_PROJECT_ID && projectId !== ACTIVE_PROJECT_ID) {
      return null;
    }

    const legacyValue = await getFromObjectStore(
      database,
      LEGACY_SAMPLE_BLOB_STORE_NAME,
      sampleId,
    );

    return isLegacyImportedSampleBlobRecord(legacyValue)
      ? legacyValue.blob
      : null;
  }

  async saveImportedSampleBlob({
    blob,
    fileName,
    mimeType,
    projectId,
    sampleId,
    updatedAt = Date.now(),
  }: SaveImportedSampleBlobOptions): Promise<void> {
    const database = await this.getDatabase();
    const record: ImportedSampleBlobRecord = {
      blob,
      fileName,
      id: createProjectSampleBlobId(projectId, sampleId),
      mimeType,
      projectId,
      sampleId,
      updatedAt,
    };

    await putIntoObjectStore(database, PROJECT_SAMPLE_BLOB_STORE_NAME, record);
  }

  private getDatabase(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase(this.databaseName);
    return this.databasePromise;
  }
}

interface StoredProjectCollectionState extends ProjectCollectionState {
  id: typeof PROJECT_COLLECTION_ID;
}

interface LegacyImportedSampleBlobRecord {
  blob: Blob;
  fileName?: string;
  mimeType?: string;
  sampleId: string;
  updatedAt: number;
}

function createStoredProjectCollection(
  collection: ProjectCollectionState,
): StoredProjectCollectionState {
  return {
    ...collection,
    id: PROJECT_COLLECTION_ID,
  };
}

function dedupeProjectSummaries(
  projects: readonly ProjectSummary[],
): ProjectSummary[] {
  const projectsById = new Map<string, ProjectSummary>();

  for (const project of projects) {
    projectsById.set(project.id, { ...project });
  }

  return Array.from(projectsById.values()).sort(
    (left, right) => left.createdAt - right.createdAt,
  );
}

async function migrateLegacySampleBlobs({
  database,
  project,
}: {
  database: IDBDatabase;
  project: PersistedProjectDocument;
}): Promise<void> {
  const sampleIds = getImportedSampleIds(project);

  await Promise.all(
    sampleIds.map(async (sampleId) => {
      const legacyValue = await getFromObjectStore(
        database,
        LEGACY_SAMPLE_BLOB_STORE_NAME,
        sampleId,
      );

      if (!isLegacyImportedSampleBlobRecord(legacyValue)) {
        return;
      }

      const record: ImportedSampleBlobRecord = {
        blob: legacyValue.blob,
        fileName: legacyValue.fileName,
        id: createProjectSampleBlobId(project.id, sampleId),
        mimeType: legacyValue.mimeType,
        projectId: project.id,
        sampleId,
        updatedAt: legacyValue.updatedAt,
      };

      await putIntoObjectStore(
        database,
        PROJECT_SAMPLE_BLOB_STORE_NAME,
        record,
      );
    }),
  );
}

async function deleteLegacySampleBlobs({
  database,
  project,
}: {
  database: IDBDatabase;
  project: PersistedProjectDocument;
}): Promise<void> {
  const sampleIds = getImportedSampleIds(project);

  await Promise.all(
    sampleIds.map((sampleId) =>
      deleteFromObjectStore(database, LEGACY_SAMPLE_BLOB_STORE_NAME, sampleId),
    ),
  );
}

async function deleteProjectSampleBlobs(
  database: IDBDatabase,
  projectId: string,
): Promise<void> {
  const records = await getAllFromObjectStore(
    database,
    PROJECT_SAMPLE_BLOB_STORE_NAME,
  );
  const projectRecords = records.filter(
    (record): record is ImportedSampleBlobRecord =>
      isImportedSampleBlobRecord(record) && record.projectId === projectId,
  );

  await Promise.all(
    projectRecords.map((record) =>
      deleteFromObjectStore(database, PROJECT_SAMPLE_BLOB_STORE_NAME, record.id),
    ),
  );
}

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  const indexedDb = window.indexedDB;

  if (!indexedDb) {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, DATABASE_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB."));
    };
    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        database.createObjectStore(PROJECT_STORE_NAME, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(PROJECT_META_STORE_NAME)) {
        database.createObjectStore(PROJECT_META_STORE_NAME, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(LEGACY_SAMPLE_BLOB_STORE_NAME)) {
        database.createObjectStore(LEGACY_SAMPLE_BLOB_STORE_NAME, {
          keyPath: "sampleId",
        });
      }

      if (!database.objectStoreNames.contains(PROJECT_SAMPLE_BLOB_STORE_NAME)) {
        database.createObjectStore(PROJECT_SAMPLE_BLOB_STORE_NAME, {
          keyPath: "id",
        });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function getFromObjectStore(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<unknown> {
  return withObjectStore(database, storeName, "readonly", (store) =>
    store.get(key),
  );
}

function getAllFromObjectStore(
  database: IDBDatabase,
  storeName: string,
): Promise<unknown[]> {
  return withObjectStore(database, storeName, "readonly", (store) =>
    store.getAll(),
  );
}

function putIntoObjectStore(
  database: IDBDatabase,
  storeName: string,
  value: unknown,
): Promise<void> {
  return withObjectStore(database, storeName, "readwrite", (store) =>
    store.put(value),
  ).then(() => undefined);
}

function deleteFromObjectStore(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  return withObjectStore(database, storeName, "readwrite", (store) =>
    store.delete(key),
  ).then(() => undefined);
}

function withObjectStore<TResult>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<TResult>,
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = run(store);

    request.onerror = () => {
      reject(request.error ?? new Error(`IndexedDB ${storeName} request failed.`));
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error(`IndexedDB ${storeName} transaction failed.`),
      );
    };
  });
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isImportedSampleBlobRecord(
  value: unknown,
): value is ImportedSampleBlobRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.sampleId === "string" &&
    value.blob instanceof Blob
  );
}

function isLegacyImportedSampleBlobRecord(
  value: unknown,
): value is LegacyImportedSampleBlobRecord {
  return (
    isRecord(value) &&
    typeof value.sampleId === "string" &&
    value.blob instanceof Blob
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
