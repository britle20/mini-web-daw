# Feature: 24 Custom Project Management Dialogs

Related feature document: `docs/features/24-custom-project-management-dialogs.md`

## Status
Planned

## Goal

Replace browser-native project prompts and confirmations with app-styled project management dialogs.

Users should be able to create, rename, and delete browser-local projects from the transport project menu without relying on `window.prompt` or `window.confirm`.

## Context

Multi-project management exists, but project create, rename, and delete flows still use browser-native dialogs. Those flows work, but they do not match the DAW UI, are awkward to validate, and are harder to make accessible and consistent with the app's CSS Modules design system.

This feature keeps the current browser-local project model. It is a UX and validation improvement, not a persistence rewrite.

## Scope

Included:

- Add custom app UI for creating a new project.
- Add custom app UI for renaming the active project.
- Add custom app UI for confirming project deletion.
- Keep these flows reachable from the transport bar project menu.
- Validate project names before confirming create or rename.
- Trim whitespace from submitted project names.
- Prevent empty project names.
- Prefer blocking exact duplicate project names case-insensitively to avoid confusing project lists.
- Preserve existing project switching, autosave, and IndexedDB behavior.
- Stop playback or preview before project operations when the current workflow already requires it.
- Support cancel, close, and confirm paths without mutating project state on cancel.
- Provide keyboard basics: visible focus, `Escape` to cancel where practical, and `Enter` to submit non-destructive forms.
- Use CSS Modules and semantic design tokens.
- Add focused tests for pure validation helpers and project operation state where practical.

Excluded:

- Full project dashboard page.
- Project templates.
- Project duplication.
- Project folder organization.
- Cloud sync, accounts, or collaboration.
- File-system project import/export.
- Changing the IndexedDB project document shape unless a small migration is clearly required.
- New runtime UI dependencies.

## Constraints

- Project data must remain serializable.
- Runtime audio objects and IndexedDB handles must not enter project JSON.
- Persistence logic should stay separate from React rendering.
- React UI may orchestrate dialog state, but it must not own audio scheduling.
- Do not change project switching semantics without updating `docs/data-model.md` and `docs/architecture.md`.
- Do not use browser-native `prompt` or `confirm` for the covered project flows after this feature is complete.

## UI Notes

The dialogs should match the existing compact dark DAW style.

Recommended first UI:

- `New Project` opens a small modal or anchored dialog with a project name input.
- `Rename Project` opens the same style of dialog with the active project name prefilled.
- `Delete Project` opens a confirmation dialog that clearly names the project being deleted.
- Destructive confirmation should be visually distinct and require an explicit button press.

Do not add a large dashboard. The transport project menu remains the entry point.

## Done when

- Creating a project uses custom app UI, not `window.prompt`.
- Renaming a project uses custom app UI, not `window.prompt`.
- Deleting a project uses custom app UI, not `window.confirm`.
- Empty project names are rejected or disabled before submission.
- Duplicate project names are handled deliberately, preferably by rejecting exact case-insensitive duplicates with a visible message.
- Canceling any dialog leaves project state unchanged.
- Deleting a project still requires clear confirmation and cannot happen by accident.
- Project create, rename, delete, switch, refresh restore, autosave, and imported sample isolation continue to work.
- UI uses CSS Modules and semantic tokens.
- Relevant tests and docs are updated.

## Verification

Run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

Manual check:

- Open the project menu and create a new project through the custom dialog.
- Try submitting an empty project name and confirm it is rejected.
- Try creating or renaming to an existing project name and confirm the documented behavior.
- Rename the active project and refresh the browser.
- Cancel create, rename, and delete flows and confirm project state is unchanged.
- Delete a project through the custom confirmation dialog and confirm another project remains loadable.
- Confirm playback or preview stops before destructive or project-switching operations.
- Confirm focus states are visible and keyboard submit/cancel behavior works where implemented.

## PR notes

- Reference issue #4.
- Explain which browser-native dialogs were removed.
- Explain project name validation behavior.
- Mention that project dashboard, templates, duplication, cloud sync, and file export/import are intentionally deferred.
