import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Icon } from "../../components";
import { MAX_TEMPO_BPM, MIN_TEMPO_BPM } from "../../utils";
import styles from "./TransportBar.module.css";
import {
  createSuggestedProjectName,
  trimProjectName,
  validateProjectName,
} from "./project-dialogs";

export type TransportState = "paused" | "playing" | "stopped";
export type TransportMode = "pattern" | "song";

interface ProjectMenuProject {
  id: string;
  name: string;
  updatedAt: number;
}

interface TransportBarProps {
  activeProjectId: string;
  bpm: number;
  isProjectFileProcessing?: boolean;
  isProjectOperationPending?: boolean;
  mode: TransportMode;
  persistenceStatusLabel?: string;
  persistenceStatusTitle?: string;
  persistenceStatusTone?: "default" | "error";
  projectName: string;
  projects: readonly ProjectMenuProject[];
  transportState: TransportState;
  onBpmChange: (bpm: number) => void;
  onModeChange: (mode: TransportMode) => void;
  onProjectCreate: (projectName: string) => void;
  onProjectDelete: () => void;
  onProjectFileImport: (file: File) => void;
  onProjectRename: (projectName: string) => void;
  onProjectSelect: (projectId: string) => void;
  onTransportStateChange: (state: TransportState) => void;
}

type ProjectDialogMode = "create" | "delete" | "rename";

export function TransportBar({
  activeProjectId,
  bpm,
  isProjectFileProcessing = false,
  isProjectOperationPending = false,
  mode,
  persistenceStatusLabel = "Saved",
  persistenceStatusTitle,
  persistenceStatusTone = "default",
  projectName,
  projects,
  transportState,
  onBpmChange,
  onModeChange,
  onProjectCreate,
  onProjectDelete,
  onProjectFileImport,
  onProjectRename,
  onProjectSelect,
  onTransportStateChange,
}: TransportBarProps) {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] =
    useState<ProjectDialogMode | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const projectDeleteCancelButtonRef = useRef<HTMLButtonElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const existingProjectNames = useMemo(
    () => projects.map((project) => project.name),
    [projects],
  );
  const suggestedProjectName = useMemo(
    () => createSuggestedProjectName(existingProjectNames),
    [existingProjectNames],
  );
  const isPlaying = transportState === "playing";
  const isNameDialog =
    projectDialogMode === "create" || projectDialogMode === "rename";
  const projectNameValidationError = isNameDialog
    ? validateProjectName({
        currentProjectName:
          projectDialogMode === "rename" ? projectName : undefined,
        existingProjectNames,
        name: projectNameDraft,
      })
    : null;
  const statusText =
    transportState === "playing"
      ? "Playing"
      : transportState === "paused"
        ? "Paused"
        : "Stopped";

  useEffect(() => {
    if (isNameDialog) {
      projectNameInputRef.current?.focus();
      projectNameInputRef.current?.select();
      return;
    }

    if (projectDialogMode === "delete") {
      projectDeleteCancelButtonRef.current?.focus();
    }
  }, [isNameDialog, projectDialogMode]);

  function openProjectDialog(mode: ProjectDialogMode) {
    setIsProjectMenuOpen(false);
    setProjectDialogMode(mode);
    setProjectNameDraft(mode === "create" ? suggestedProjectName : projectName);
  }

  function closeProjectDialog() {
    setProjectDialogMode(null);
    setProjectNameDraft("");
  }

  function handleProjectDialogKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }

    event.stopPropagation();
    closeProjectDialog();
  }

  function handleProjectNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isNameDialog || projectNameValidationError) {
      return;
    }

    const nextProjectName = trimProjectName(projectNameDraft);

    closeProjectDialog();

    if (projectDialogMode === "create") {
      onProjectCreate(nextProjectName);
      return;
    }

    if (nextProjectName !== trimProjectName(projectName)) {
      onProjectRename(nextProjectName);
    }
  }

  function handleProjectDeleteConfirm() {
    closeProjectDialog();
    onProjectDelete();
  }

  function handleProjectFileImportClick() {
    setIsProjectMenuOpen(false);
    projectFileInputRef.current?.click();
  }

  function handleProjectFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    onProjectFileImport(file);
  }

  return (
    <header className={styles.transportBar}>
      <div className={styles.brandGroup}>
        <div className={styles.logoMark}>m</div>
        <div>
          <p className={styles.appLabel}>mini DAW</p>
          <p className={styles.statusText}>{statusText}</p>
        </div>
      </div>

      <div className={styles.transportGroup} aria-label="Transport controls">
        <button
          aria-label={isPlaying ? "Pause" : "Play"}
          className={`${styles.iconButton} ${isPlaying ? styles.iconButtonActive : ""}`}
          onClick={() => onTransportStateChange(isPlaying ? "paused" : "playing")}
          type="button"
        >
          <Icon name={isPlaying ? "pause" : "play_arrow"} />
        </button>
        <button
          aria-label="Stop"
          className={`${styles.iconButton} ${
            transportState === "stopped" ? styles.iconButtonActive : ""
          }`}
          onClick={() => onTransportStateChange("stopped")}
          type="button"
        >
          <Icon name="stop" />
        </button>
        <button
          aria-label="Record"
          className={`${styles.iconButton} ${styles.recordButton}`}
          type="button"
        >
          <Icon name="radio_button_checked" />
        </button>
      </div>

      <div className={styles.bpmControl}>
        <span className={styles.bpmValue}>{bpm}</span>
        <span className={styles.bpmLabel}>BPM</span>
        <input
          aria-label="BPM"
          className={styles.bpmSlider}
          max={MAX_TEMPO_BPM}
          min={MIN_TEMPO_BPM}
          onChange={(event) => onBpmChange(Number(event.target.value))}
          type="range"
          value={bpm}
        />
      </div>

      <div className={styles.modeToggle} aria-label="Playback mode">
        <button
          aria-pressed={mode === "pattern"}
          className={`${styles.modeButton} ${mode === "pattern" ? styles.modeButtonActive : ""}`}
          onClick={() => onModeChange("pattern")}
          type="button"
        >
          PAT
        </button>
        <button
          aria-pressed={mode === "song"}
          className={`${styles.modeButton} ${mode === "song" ? styles.modeButtonActive : ""}`}
          onClick={() => onModeChange("song")}
          type="button"
        >
          SONG
        </button>
      </div>

      <div className={styles.rightStatus}>
        <span
          className={`${styles.saveStatus} ${
            persistenceStatusTone === "error" ? styles.saveStatusError : ""
          }`}
          title={persistenceStatusTitle}
        >
          {persistenceStatusLabel}
        </span>
        <div className={styles.projectMenuRoot}>
          <button
            aria-expanded={isProjectMenuOpen}
            aria-haspopup="menu"
            className={styles.projectButton}
            disabled={isProjectOperationPending}
            onClick={() => setIsProjectMenuOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span className={styles.projectName}>
              {projectName || "Untitled Project"}
            </span>
            <Icon name="expand_more" />
          </button>

          {isProjectMenuOpen ? (
            <div className={styles.projectMenu} role="menu">
              <p className={styles.projectMenuLabel}>Local Projects</p>
              <div className={styles.projectMenuList}>
                {projects.map((project) => (
                  <button
                    aria-current={
                      project.id === activeProjectId ? "page" : undefined
                    }
                    className={`${styles.projectMenuItem} ${
                      project.id === activeProjectId
                        ? styles.projectMenuItemActive
                        : ""
                    }`}
                    disabled={isProjectOperationPending}
                    key={project.id}
                    onClick={() => {
                      setIsProjectMenuOpen(false);
                      onProjectSelect(project.id);
                    }}
                    role="menuitem"
                    title={`Last saved ${new Date(project.updatedAt).toLocaleString()}`}
                    type="button"
                  >
                    <span>{project.name}</span>
                  </button>
                ))}
              </div>

              <div className={styles.projectMenuActions}>
                <button
                  className={styles.projectMenuAction}
                  disabled={isProjectOperationPending}
                  onClick={() => {
                    openProjectDialog("create");
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="add" />
                  <span>New Project</span>
                </button>
                <button
                  className={styles.projectMenuAction}
                  disabled={isProjectFileProcessing || isProjectOperationPending}
                  onClick={handleProjectFileImportClick}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="upload_file" />
                  <span>Import Project File</span>
                </button>
                <button
                  className={styles.projectMenuAction}
                  disabled={isProjectOperationPending || !activeProjectId}
                  onClick={() => {
                    openProjectDialog("rename");
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="edit" />
                  <span>Rename</span>
                </button>
                <button
                  className={`${styles.projectMenuAction} ${styles.projectMenuDangerAction}`}
                  disabled={isProjectOperationPending || !activeProjectId}
                  onClick={() => {
                    openProjectDialog("delete");
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="delete" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ) : null}
          <input
            ref={projectFileInputRef}
            accept=".json,.zip,application/json,application/zip,application/x-zip-compressed"
            className={styles.hiddenFileInput}
            onChange={handleProjectFileChange}
            type="file"
          />
        </div>
      </div>

      {projectDialogMode ? (
        <div
          className={styles.dialogOverlay}
          onMouseDown={closeProjectDialog}
          role="presentation"
        >
          {isNameDialog ? (
            <form
              aria-labelledby="project-dialog-title"
              aria-modal="true"
              className={styles.dialogCard}
              onKeyDown={handleProjectDialogKeyDown}
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={handleProjectNameSubmit}
              role="dialog"
            >
              <div className={styles.dialogHeader}>
                <h2 className={styles.dialogTitle} id="project-dialog-title">
                  {projectDialogMode === "create"
                    ? "New Project"
                    : "Rename Project"}
                </h2>
                <button
                  aria-label="Close project dialog"
                  className={styles.dialogIconButton}
                  onClick={closeProjectDialog}
                  type="button"
                >
                  <Icon name="close" />
                </button>
              </div>

              <label className={styles.dialogLabel} htmlFor="project-name-input">
                Project name
              </label>
              <input
                aria-describedby={
                  projectNameValidationError
                    ? "project-name-error"
                    : "project-name-help"
                }
                aria-invalid={projectNameValidationError ? "true" : undefined}
                className={styles.dialogInput}
                disabled={isProjectOperationPending}
                id="project-name-input"
                onChange={(event) => setProjectNameDraft(event.target.value)}
                ref={projectNameInputRef}
                type="text"
                value={projectNameDraft}
              />
              {projectNameValidationError ? (
                <p className={styles.dialogError} id="project-name-error">
                  {projectNameValidationError}
                </p>
              ) : (
                <p className={styles.dialogHelp} id="project-name-help">
                  Project names are trimmed and must be unique.
                </p>
              )}

              <div className={styles.dialogActions}>
                <button
                  className={styles.dialogSecondaryButton}
                  onClick={closeProjectDialog}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={styles.dialogPrimaryButton}
                  disabled={
                    isProjectOperationPending || Boolean(projectNameValidationError)
                  }
                  type="submit"
                >
                  {projectDialogMode === "create" ? "Create" : "Rename"}
                </button>
              </div>
            </form>
          ) : (
            <div
              aria-labelledby="project-dialog-title"
              aria-modal="true"
              className={styles.dialogCard}
              onKeyDown={handleProjectDialogKeyDown}
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className={styles.dialogHeader}>
                <h2 className={styles.dialogTitle} id="project-dialog-title">
                  Delete Project
                </h2>
                <button
                  aria-label="Close project dialog"
                  className={styles.dialogIconButton}
                  onClick={closeProjectDialog}
                  type="button"
                >
                  <Icon name="close" />
                </button>
              </div>

              <p className={styles.dialogBody}>
                Delete <strong>{projectName || "Untitled Project"}</strong>? This
                removes the browser-local project and its imported sample data.
              </p>

              <div className={styles.dialogActions}>
                <button
                  className={styles.dialogSecondaryButton}
                  onClick={closeProjectDialog}
                  ref={projectDeleteCancelButtonRef}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={styles.dialogDangerButton}
                  disabled={isProjectOperationPending}
                  onClick={handleProjectDeleteConfirm}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}
