import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Icon } from "../../components";
import {
  ARRANGEMENT_CLIP_DRAG_TYPE,
  type Clip,
  PITCHED_INSTRUMENTS,
  type PitchedInstrumentId,
  isAudioClip,
  isHybridClip,
} from "../../model";
import styles from "./ProjectSidebar.module.css";

export type InstrumentId = "audio" | "drums" | PitchedInstrumentId;

export interface MissingImportedSampleItem {
  fileName?: string;
  name: string;
  sampleId: string;
}

interface ProjectSidebarProps {
  arrangementExportError?: string | null;
  clips: readonly Clip[];
  clipImportError?: string | null;
  isArrangementExporting?: boolean;
  isClipImporting?: boolean;
  isProjectFileProcessing?: boolean;
  missingImportedSamples?: readonly MissingImportedSampleItem[];
  projectFileError?: string | null;
  projectFileNotice?: string | null;
  projectName: string;
  selectedClipId: string;
  selectedInstrumentId: InstrumentId;
  onArrangementExport: () => void;
  onClipAdd: () => void;
  onClipDelete: (clipId: string) => void;
  onClipDuplicate: (clipId: string) => void;
  onClipImport: (file: File) => void;
  onClipRename: (clipId: string, name: string) => void;
  onClipSelect: (clipId: string) => void;
  onImportedSampleRelink: (sampleId: string, file: File) => void;
  onInstrumentAdd: (clipId: string, instrumentId: PitchedInstrumentId) => void;
  onInstrumentRemove: (clipId: string, instrumentId: PitchedInstrumentId) => void;
  onInstrumentSelect: (clipId: string, instrumentId: InstrumentId) => void;
  onProjectBundleExport: () => void;
  onProjectFileImport: (file: File) => void;
  onProjectJsonExport: () => void;
}

export function ProjectSidebar({
  arrangementExportError = null,
  clips,
  clipImportError = null,
  isArrangementExporting = false,
  isClipImporting = false,
  isProjectFileProcessing = false,
  missingImportedSamples = [],
  projectFileError = null,
  projectFileNotice = null,
  projectName,
  selectedClipId,
  selectedInstrumentId,
  onArrangementExport,
  onClipAdd,
  onClipDelete,
  onClipDuplicate,
  onClipImport,
  onClipRename,
  onClipSelect,
  onImportedSampleRelink,
  onInstrumentAdd,
  onInstrumentRemove,
  onInstrumentSelect,
  onProjectBundleExport,
  onProjectFileImport,
  onProjectJsonExport,
}: ProjectSidebarProps) {
  const clipFileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const relinkFileInputRef = useRef<HTMLInputElement>(null);
  const relinkingSampleIdRef = useRef<string | null>(null);
  const [addingInstrumentClipId, setAddingInstrumentClipId] =
    useState<string | null>(null);
  const [isClipAddMenuOpen, setIsClipAddMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [expandedClipIds, setExpandedClipIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [openClipActionMenuId, setOpenClipActionMenuId] =
    useState<string | null>(null);
  const [renamingClipId, setRenamingClipId] = useState<string | null>(null);
  const [draftClipName, setDraftClipName] = useState("");
  const shouldIgnoreRenameBlurRef = useRef(false);

  function handleBuildClipClick() {
    setOpenClipActionMenuId(null);
    setIsClipAddMenuOpen(false);
    setIsExportMenuOpen(false);
    onClipAdd();
  }

  function handleImportFileClick() {
    setOpenClipActionMenuId(null);
    setIsClipAddMenuOpen(false);
    setIsExportMenuOpen(false);
    clipFileInputRef.current?.click();
  }

  function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    onClipImport(file);
  }

  function handleProjectFileImportClick() {
    setIsExportMenuOpen(false);
    projectFileInputRef.current?.click();
  }

  function handleProjectJsonExportClick() {
    setIsExportMenuOpen(false);
    onProjectJsonExport();
  }

  function handleProjectBundleExportClick() {
    setIsExportMenuOpen(false);
    onProjectBundleExport();
  }

  function handleArrangementExportClick() {
    setIsExportMenuOpen(false);
    onArrangementExport();
  }

  function handleProjectFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    onProjectFileImport(file);
  }

  function handleRelinkClick(sampleId: string) {
    relinkingSampleIdRef.current = sampleId;
    relinkFileInputRef.current?.click();
  }

  function handleRelinkFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sampleId = relinkingSampleIdRef.current;

    event.target.value = "";
    relinkingSampleIdRef.current = null;

    if (!file || !sampleId) {
      return;
    }

    onImportedSampleRelink(sampleId, file);
  }

  function beginClipRename(clip: Clip) {
    shouldIgnoreRenameBlurRef.current = false;
    setAddingInstrumentClipId(null);
    setOpenClipActionMenuId(null);
    setRenamingClipId(clip.id);
    setDraftClipName(clip.name);
  }

  function cancelClipRename() {
    shouldIgnoreRenameBlurRef.current = true;
    setRenamingClipId(null);
    setDraftClipName("");
  }

  function commitClipRename(clipId: string) {
    if (renamingClipId !== clipId) {
      return;
    }

    onClipRename(clipId, draftClipName);
    shouldIgnoreRenameBlurRef.current = true;
    cancelClipRename();
  }

  function handleRenameBlur(clipId: string) {
    if (shouldIgnoreRenameBlurRef.current) {
      shouldIgnoreRenameBlurRef.current = false;
      return;
    }

    commitClipRename(clipId);
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>, clipId: string) {
    event.preventDefault();
    commitClipRename(clipId);
  }

  function handleRenameKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    clipId: string,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelClipRename();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      commitClipRename(clipId);
    }
  }

  function toggleInstrumentPicker(clipId: string) {
    setOpenClipActionMenuId(null);
    setIsExportMenuOpen(false);
    setRenamingClipId(null);
    setExpandedClipIds((currentClipIds) => {
      const nextClipIds = new Set(currentClipIds);

      nextClipIds.add(clipId);
      return nextClipIds;
    });
    setAddingInstrumentClipId((currentClipId) =>
      currentClipId === clipId ? null : clipId,
    );
  }

  function toggleClipExpanded(clipId: string) {
    setAddingInstrumentClipId(null);
    setOpenClipActionMenuId(null);
    setExpandedClipIds((currentClipIds) => {
      const nextClipIds = new Set(currentClipIds);

      if (nextClipIds.has(clipId)) {
        nextClipIds.delete(clipId);
      } else {
        nextClipIds.add(clipId);
      }

      return nextClipIds;
    });
  }

  function toggleClipActionMenu(clipId: string) {
    setAddingInstrumentClipId(null);
    setIsExportMenuOpen(false);
    setOpenClipActionMenuId((currentClipId) =>
      currentClipId === clipId ? null : clipId,
    );
  }

  function handleClipDuplicateClick(clipId: string) {
    setOpenClipActionMenuId(null);
    onClipDuplicate(clipId);
  }

  function handleClipDeleteClick(clipId: string) {
    setOpenClipActionMenuId(null);
    onClipDelete(clipId);
  }

  function handleClipDragStart(
    event: DragEvent<HTMLButtonElement>,
    clipId: string,
  ) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(ARRANGEMENT_CLIP_DRAG_TYPE, clipId);
  }

  return (
    <aside className={styles.sidebar} aria-label="Project sidebar">
      <div className={styles.projectHeader}>
        <p className={styles.sectionLabel}>Project</p>
        <h2 className={styles.projectName}>{projectName}</h2>
      </div>

      <nav className={styles.clipBrowser} aria-label="Clips and instruments">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>Clips</p>
          <div className={styles.clipAddControl}>
            <button
              aria-expanded={isClipAddMenuOpen}
              aria-label="Add clip"
              className={styles.iconButton}
              disabled={isClipImporting}
              onClick={() => {
                setOpenClipActionMenuId(null);
                setIsExportMenuOpen(false);
                setIsClipAddMenuOpen((isOpen) => !isOpen);
              }}
              type="button"
            >
              <Icon name="add" />
            </button>
            {isClipAddMenuOpen ? (
              <div className={styles.clipAddMenu}>
                <button
                  className={styles.clipAddMenuItem}
                  onClick={handleBuildClipClick}
                  type="button"
                >
                  <Icon name="library_add" />
                  <span>Build a clip</span>
                </button>
                <button
                  className={styles.clipAddMenuItem}
                  onClick={handleImportFileClick}
                  type="button"
                >
                  <Icon name="upload_file" />
                  <span>Import a file</span>
                </button>
              </div>
            ) : null}
            <input
              ref={clipFileInputRef}
              accept=".wav,audio/wav,audio/wave,audio/x-wav,audio/vnd.wave"
              className={styles.hiddenFileInput}
              onChange={handleImportFileChange}
              type="file"
            />
          </div>
        </div>
        {clipImportError ? (
          <p className={styles.importError}>{clipImportError}</p>
        ) : null}

        {clips.map((clip) => {
          const isClipSelected = clip.id === selectedClipId;
          const isHybrid = isHybridClip(clip);
          const isAudio = isAudioClip(clip);
          const isClipExpanded = expandedClipIds.has(clip.id);
          const availableInstruments = isHybrid
            ? PITCHED_INSTRUMENTS.filter(
                (instrument) => !clip.pitchedInstrumentIds.includes(instrument.id),
              )
            : [];

          return (
            <div className={styles.clipGroup} key={clip.id}>
              <div
                className={`${styles.clipHeader} ${
                  isClipSelected ? styles.clipHeaderActive : ""
                }`}
              >
                {renamingClipId === clip.id ? (
                  <form
                    className={styles.renameForm}
                    onSubmit={(event) => handleRenameSubmit(event, clip.id)}
                  >
                    <input
                      aria-label={`Rename ${clip.name}`}
                      autoFocus
                      className={styles.renameInput}
                      onBlur={() => handleRenameBlur(clip.id)}
                      onChange={(event) => setDraftClipName(event.target.value)}
                      onKeyDown={(event) => handleRenameKeyDown(event, clip.id)}
                      value={draftClipName}
                    />
                  </form>
                ) : (
                  <>
                    <button
                      aria-expanded={isClipExpanded}
                      aria-label={
                        isClipExpanded
                          ? `Collapse ${clip.name}`
                          : `Expand ${clip.name}`
                      }
                      className={styles.clipExpandButton}
                      onClick={() => toggleClipExpanded(clip.id)}
                      type="button"
                      disabled={isAudio}
                    >
                      <Icon
                        name={
                          isAudio
                            ? "graphic_eq"
                            : isClipExpanded
                              ? "expand_more"
                              : "chevron_right"
                        }
                      />
                    </button>
                    <button
                      className={styles.clipSelectButton}
                      draggable
                      onDragStart={(event) => handleClipDragStart(event, clip.id)}
                      onClick={() => {
                        setOpenClipActionMenuId(null);
                        onClipSelect(clip.id);
                      }}
                      type="button"
                    >
                      <span>{clip.name}</span>
                    </button>
                  </>
                )}

                <div className={styles.clipActions}>
                  {isHybrid ? (
                    <button
                      aria-label={`Add instrument to ${clip.name}`}
                      className={styles.iconButton}
                      onClick={() => toggleInstrumentPicker(clip.id)}
                      type="button"
                    >
                      <Icon name="add" />
                    </button>
                  ) : null}
                  <button
                    aria-expanded={openClipActionMenuId === clip.id}
                    aria-haspopup="menu"
                    aria-label={`More actions for ${clip.name}`}
                    className={styles.iconButton}
                    onClick={() => toggleClipActionMenu(clip.id)}
                    type="button"
                  >
                    <Icon name="more_vert" />
                  </button>
                  {openClipActionMenuId === clip.id ? (
                    <div className={styles.clipActionMenu} role="menu">
                      <button
                        className={styles.clipActionMenuItem}
                        onClick={() => beginClipRename(clip)}
                        role="menuitem"
                        type="button"
                      >
                        <Icon name="edit" />
                        <span>Rename</span>
                      </button>
                      <button
                        className={styles.clipActionMenuItem}
                        onClick={() => handleClipDuplicateClick(clip.id)}
                        role="menuitem"
                        type="button"
                      >
                        <Icon name="content_copy" />
                        <span>Duplicate</span>
                      </button>
                      <button
                        className={`${styles.clipActionMenuItem} ${styles.clipActionMenuDangerItem}`}
                        onClick={() => handleClipDeleteClick(clip.id)}
                        role="menuitem"
                        type="button"
                      >
                        <Icon name="remove" />
                        <span>Delete</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {isHybrid && isClipExpanded && addingInstrumentClipId === clip.id ? (
                <div
                  className={styles.instrumentPicker}
                  role="listbox"
                  aria-label={`Available instruments for ${clip.name}`}
                >
                  {availableInstruments.length > 0 ? (
                    availableInstruments.map((instrument) => (
                      <button
                        className={styles.instrumentPickerOption}
                        key={instrument.id}
                        onClick={() => {
                          onInstrumentAdd(clip.id, instrument.id);
                          setAddingInstrumentClipId(null);
                        }}
                        type="button"
                      >
                        <Icon name="music_note_2" />
                        <span>{instrument.name}</span>
                      </button>
                    ))
                  ) : (
                    <p className={styles.emptyPicker}>All instruments added</p>
                  )}
                </div>
              ) : null}

              {isHybrid && isClipExpanded ? (
                <div className={styles.instrumentList}>
                  <button
                    aria-pressed={isClipSelected && selectedInstrumentId === "drums"}
                    className={`${styles.instrumentButton} ${
                      isClipSelected && selectedInstrumentId === "drums"
                        ? styles.instrumentButtonActive
                        : ""
                    }`}
                    onClick={() => onInstrumentSelect(clip.id, "drums")}
                    type="button"
                  >
                    <Icon name="grid_view" />
                    <span>Drums</span>
                  </button>

                  {clip.pitchedInstrumentIds.map((instrumentId) => {
                    const instrument = PITCHED_INSTRUMENTS.find(
                      (candidate) => candidate.id === instrumentId,
                    );
                    const label = instrument?.name ?? instrumentId;
                    const isInstrumentSelected =
                      isClipSelected && selectedInstrumentId === instrumentId;

                    return (
                      <div
                        className={`${styles.instrumentRow} ${
                          isInstrumentSelected ? styles.instrumentRowActive : ""
                        }`}
                        key={instrumentId}
                      >
                        <button
                          aria-pressed={isInstrumentSelected}
                          className={`${styles.instrumentButton} ${
                            isInstrumentSelected
                              ? styles.instrumentButtonActive
                              : ""
                          }`}
                          onClick={() => onInstrumentSelect(clip.id, instrumentId)}
                          type="button"
                        >
                          <Icon name="music_note_2" />
                          <span>{label}</span>
                        </button>
                        <button
                          aria-label={`Remove ${label} from ${clip.name}`}
                          className={styles.instrumentRemoveButton}
                          onClick={() => onInstrumentRemove(clip.id, instrumentId)}
                          type="button"
                        >
                          <Icon name="remove" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.footerActionControl}>
          <button
            aria-expanded={isExportMenuOpen}
            aria-haspopup="menu"
            aria-label="Open export options"
            className={styles.footerButton}
            disabled={isProjectFileProcessing || isArrangementExporting}
            onClick={() => {
              setIsClipAddMenuOpen(false);
              setOpenClipActionMenuId(null);
              setIsExportMenuOpen((isOpen) => !isOpen);
            }}
            type="button"
          >
            <Icon name="ios_share" />
            <span>
              {isProjectFileProcessing || isArrangementExporting
                ? "Exporting..."
                : "Export"}
            </span>
          </button>
          {isExportMenuOpen ? (
            <div className={styles.exportMenu} role="menu">
              <button
                className={styles.exportMenuItem}
                onClick={handleProjectJsonExportClick}
                role="menuitem"
                type="button"
              >
                <Icon name="description" />
                <span>Export Project JSON</span>
              </button>
              <button
                className={styles.exportMenuItem}
                onClick={handleProjectBundleExportClick}
                role="menuitem"
                type="button"
              >
                <Icon name="folder_zip" />
                <span>Export Project Bundle</span>
              </button>
              <button
                className={styles.exportMenuItem}
                onClick={handleArrangementExportClick}
                role="menuitem"
                type="button"
              >
                <Icon name="graphic_eq" />
                <span>Export Arrangement WAV</span>
              </button>
            </div>
          ) : null}
        </div>

        <button
          className={styles.footerButton}
          disabled={isProjectFileProcessing}
          onClick={handleProjectFileImportClick}
          type="button"
        >
          <Icon name="upload_file" />
          <span>
            {isProjectFileProcessing ? "Processing..." : "Import Project File"}
          </span>
        </button>
        <input
          ref={projectFileInputRef}
          accept=".json,.zip,application/json,application/zip,application/x-zip-compressed"
          className={styles.hiddenFileInput}
          onChange={handleProjectFileChange}
          type="file"
        />
        <input
          ref={relinkFileInputRef}
          accept=".wav,audio/wav,audio/wave,audio/x-wav,audio/vnd.wave"
          className={styles.hiddenFileInput}
          onChange={handleRelinkFileChange}
          type="file"
        />
        <button className={styles.footerButton} type="button">
          <Icon name="settings" />
          <span>Settings</span>
        </button>
        {projectFileNotice ? (
          <p className={styles.fileNotice}>{projectFileNotice}</p>
        ) : null}
        {projectFileError ? (
          <p className={styles.exportError}>{projectFileError}</p>
        ) : null}
        {arrangementExportError ? (
          <p className={styles.exportError}>{arrangementExportError}</p>
        ) : null}
        {missingImportedSamples.length > 0 ? (
          <div className={styles.missingSamples}>
            <p className={styles.missingSamplesTitle}>Missing samples</p>
            {missingImportedSamples.map((sample) => (
              <div className={styles.missingSampleItem} key={sample.sampleId}>
                <span title={sample.fileName ?? sample.name}>{sample.name}</span>
                <button
                  className={styles.relinkButton}
                  disabled={isProjectFileProcessing}
                  onClick={() => handleRelinkClick(sample.sampleId)}
                  type="button"
                >
                  Relink
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
