# UI and Design

## CSS Modules Convention

Use CSS Modules for component-level styles:

```text
ComponentName.tsx
ComponentName.module.css
```

Class names should describe the component part or state, such as `root`, `lane`, `stepButton`, `active`, or `noteBlock`.

## Global Styles Policy

Keep global CSS minimal:

- CSS reset or normalization.
- `html`, `body`, and `#root` sizing.
- Base font rendering.
- Design tokens as CSS custom properties.

Do not put feature-specific component styles in global CSS.

## Design Token Policy

Use CSS variables for shared values:

- Colors.
- Spacing.
- Border radius.
- Typography.
- Z-index layers.
- Timing constants for transitions.

Tokens should live in `src/styles/` after the scaffold exists.

Use a two-layer token model:

- Primitive tokens define raw palette, spacing, typography, radius, and timing values.
- Semantic tokens define product meaning by referencing primitive tokens.

Example:

```css
:root {
  --color-gray-950: #0f172a;
  --color-blue-500: #3b82f6;
  --space-2: 8px;
  --radius-2: 6px;

  --color-app-background: var(--color-gray-950);
  --color-control-accent: var(--color-blue-500);
  --space-control-gap: var(--space-2);
  --radius-control: var(--radius-2);
}
```

Component CSS Modules should use semantic tokens:

```css
.button {
  background: var(--color-control-accent);
  border-radius: var(--radius-control);
}
```

Do not reference primitive tokens directly in component styles unless there is a documented exception. This keeps component styling tied to product meaning instead of raw implementation values.

## Initial Layout

The first usable screen should focus on the clip editor:

- Transport bar.
- Selected clip editor.
- Drum step sequencer.
- Piano roll.

Do not default to a marketing landing page.

## Later Layout

Later milestones can add:

- Clip library.
- Arrangement view.
- Selected clip editor panel.

The arrangement should support horizontal time and vertical track lanes when that milestone arrives.

## Arrangement View

The `PAT` / `SONG` toggle should switch the main workspace mode:

- `PAT`: show the current selected hybrid clip editor with the drum step sequencer and piano roll.
- `SONG`: show an arrangement view UI shell.

The existing top transport bar and left project sidebar should stay visible in both modes.

The first arrangement view should be a UI shell, not a full arrangement editor. It should include:

- Arrangement toolbar.
- Snap display.
- Timeline ruler with bar numbers.
- Fixed left track header column.
- Scrollable timeline grid.
- Horizontal track lanes.
- Demo clip blocks.
- Bottom scrollbar or scrollbar-like visual area.
- Zoom placeholder.

Track headers, timeline lanes, and clip blocks must align exactly. Use shared geometry constants for row height, ruler height, bar width, beat subdivision width, and timeline content width. Inline styles are acceptable for dynamic arrangement geometry such as clip positions, clip widths, grid widths, and playhead positions.

Do not introduce real arrangement data, persisted clip instances, arrangement playback, or drag-and-drop editing in the first arrangement UI shell unless a feature spec explicitly expands the scope.

The arrangement placement feature expands this shell into an editable first pass. Static demo clip blocks should be removed once real `ClipInstance` state is available.

The arrangement toolbar includes length controls for adding or removing bars. These controls update serializable arrangement state and the ruler/grid derive from that state instead of hard-coded 16-bar assumptions.

## Arrangement Clip Placement

The next arrangement step should make the `SONG` view editable and playable.

- Sidebar clips act as drag sources.
- Arrangement track lanes act as drop targets.
- Dropping a clip creates a visible clip block backed by a serializable `ClipInstance`.
- Moving a clip block updates `startTick` and `trackId`, not stored pixel positions.
- Selecting a clip block should show a clear selected state.
- Right-clicking a clip block deletes only that arrangement instance, not the source clip in the sidebar.
- Static demo clip blocks should be removed or replaced with seeded serializable state.
- The arrangement ruler may expose draggable loop start and loop end handles snapped to bar boundaries.
- The timeline should show loop start/end boundary lines. Avoid filling the full loop range across tracks; a small ruler connector between the loop handles is enough.

Use shared arrangement geometry constants for row height, ruler height, bar width, beat width, timeline width, and track header width. Inline styles are acceptable for dynamic clip geometry such as `left`, `top`, `width`, and transform values.

Start with a simple snap policy, such as beat-level snapping at 480 ticks, unless a feature spec introduces user-selectable snap values.

`SONG` mode playback should render a visual arrangement playhead. The playhead may use `requestAnimationFrame` for display, but exact playback must remain scheduled by the audio engine against `AudioContext.currentTime`.

## Clip Length Controls

Hybrid clip editors expose a compact length control for 1, 2, and 4 bars.

- The selected length should update clip `lengthTicks`.
- Drum and piano roll grids should derive from the selected clip length.
- Shortening a clip should avoid silent data loss when events would fall outside the new length.
- The control belongs in the clip editor header or nearby toolbar, not in the audio engine.
- Longer piano roll grids may scroll horizontally; the 1-bar view should remain compact.

## Export UI

Arrangement export should be presented as an explicit command, likely near the existing Export entry or arrangement toolbar.

- Show a busy state while rendering.
- Show a clear error if required imported sample data is missing.
- Download a WAV file when export completes.
- Do not imply MP3 or cloud export support until those features exist.

## Project File Import and Export UI

Project file import/export should be visually distinct from arrangement WAV export.

Recommended project-level commands:

- `Export Project JSON`
- `Export Project Bundle`
- `Import Project File`

`Export Project JSON` downloads editable project data and imported sample metadata without WAV bytes. `Export Project Bundle` downloads an app-created ZIP with `project.json` and available imported WAV blobs. `Import Project File` may accept `.json` and app-created `.zip` bundles.

After importing a project file, create a new browser-local project and switch to it when import succeeds. Do not silently overwrite the active project.

If imported WAV bytes are missing, show a compact missing sample list. Each missing imported sample should expose a `Relink` action that opens a WAV file picker. The relink UI should explain hash mismatch failures clearly and should not create a new sample ID when the user is restoring an existing missing source.

## Project Menu

Multi-project management should live in the transport bar, near the active project name and save status.

The first project menu should:

- Display the active project name from project state, not a hard-coded label.
- Open a compact menu or popover from the project-name area.
- List browser-local projects.
- Provide `New Project`, `Rename Project`, and `Delete Project` actions.
- Make project switching explicit and stop playback or preview before replacing app state.
- Show clear confirmation before deleting a project.

Do not introduce a full dashboard page for the first multi-project feature. Keep the menu compact enough to fit the editor-focused workflow.

Use CSS Modules and semantic design tokens. Inline styles are not expected for this menu because geometry is not tick-derived editor layout.

## Project Management Dialogs

Project create, rename, and delete flows should use app-styled dialogs rather than browser-native `prompt` or `confirm`.

- Open project dialogs from the transport project menu.
- Use a compact modal or anchored dialog that matches the dark DAW UI.
- Validate empty project names before submitting.
- Prefer rejecting exact case-insensitive duplicate project names to keep the local project list clear.
- Make destructive delete confirmation explicit and visibly distinct.
- Cancel and close actions must leave project state unchanged.
- Keep focus states visible and support keyboard submit/cancel behavior where practical.
- Use CSS Modules and semantic design tokens; no new visual dependency is required.

## Arrangement Mixer Panel

The mixer should start as a bottom dock inside `SONG` mode, below the arrangement timeline.

The first mixer panel should be a UI shell:

- Track channel strips corresponding to visible arrangement tracks.
- A master channel strip when practical.
- Volume faders.
- Level meter placeholders.
- Mute and solo toggle buttons.
- Basic effect slot placeholders.
- Horizontal scrolling inside the mixer panel when channel strips exceed available width.

This panel belongs in the arrangement workspace, not the focused `PAT` clip editor. `PAT` mode may later expose simple preview controls, but full mixer controls are song/track-level UI.

The first mixer panel should not imply real audio routing. Use local visual state or mock values for faders, mute/solo, meters, and effect slots until a dedicated mixer routing feature connects those controls to the audio engine.

Use CSS Modules and semantic design tokens. Keep primitive token references out of component CSS unless there is a documented exception.

## Mixer Audio Controls

After arrangement playback can schedule sources by `trackId`, the mixer panel should become functional:

- Track faders control real track gain.
- The master fader controls real output gain.
- `M` buttons mute real track output.
- `S` buttons solo tracks using the documented mute/solo rule.
- Track meters display runtime signal level for each track.
- The master meter displays runtime output level.

The UI should dispatch mixer setting changes to state/model or audio-engine orchestration. React components must not own Web Audio nodes directly.

Meters are visual feedback only. They may update via `requestAnimationFrame`, but meter timing must not affect audio scheduling.

When playback is stopped, meters may settle to zero while faders and mute/solo settings remain editable.

Effect slots should remain visibly disabled or placeholder-only until a dedicated effects feature implements real processing.

Before the effects feature, the functional mixer should label its meters as live/runtime feedback and keep effect slots disabled. The master strip exposes master volume and meter feedback; track strips expose volume, mute, solo, and meter feedback.

## Basic Mixer Effects UI

The first effects feature should make the existing track `FX` slot functional
without turning the mixer into a large plugin editor.

Use the track channel strip effect area for:

- Effect selector: `None`, `Filter`, `Delay`, `Distortion`.
- Enable/bypass control for non-`None` effects.
- Compact parameters for the selected effect.

Suggested first controls:

- `Filter`: type and cutoff.
- `Delay`: time, feedback, and mix.
- `Distortion`: drive and mix.

Keep controls dense and readable inside the mixer strip. Avoid modal editors,
floating plugin windows, multi-slot chains, preset browsers, and automation UI
until separate feature specs introduce them.

Effect controls edit serializable mixer state. They must not expose Web Audio
node objects or runtime graph details to React components.

## Component Naming Recommendations

Prefer names that match the product domain:

- `TransportBar`
- `ClipEditor`
- `DrumStepSequencer`
- `DrumLane`
- `StepButton`
- `PianoRoll`
- `NoteBlock`
- `ArrangementView`
- `MixerPanel`
- `ChannelStrip`

Feature-specific components should live under `src/features/` unless they are truly reusable.

## Dynamic Editor Geometry Policy

Inline styles are acceptable for computed editor geometry, including:

- Note positions.
- Note widths.
- Grid coordinates.
- Playhead transform values.

Keep static appearance in CSS Modules. Keep dynamic numeric layout derived from ticks, pitch, and grid dimensions.

## Playhead Display

Clip editors may render a vertical playhead to show the current runtime transport position.

- The playhead position should be derived from tick position and editor dimensions.
- Use `requestAnimationFrame` for visual updates when playback is active.
- Keep the playhead as visual feedback only; it must not drive exact audio scheduling.
- Use CSS Modules and semantic design tokens for static playhead styling.
- Inline styles are acceptable for computed playhead geometry such as `left` or `transform`.
- When stopped, the playhead should reset to the start of the selected clip. When paused, it should remain at the paused tick.

## Piano Roll Editing

The initial piano roll should use a compact C4-C5 pitch range that matches the bundled Iowa Piano sample files.

- Render 13 pitch rows from C5 down to C4.
- Render 32 columns across the 1-bar clip.
- Use left-click to create a short note.
- Use left-click drag on empty grid space to create a longer note.
- Use left-click drag on an existing note to move its pitch and start tick.
- Use right-click on an existing note to delete it.
- Store the result in serializable `noteEvents`; do not store UI geometry as project data.
- Use inline styles only for computed note geometry such as top, left, width, and height.

## Pitched Instrument Selection

Initial options:

- `Default Synth`: oscillator-based playback.
- `Iowa Piano`: sample-based playback using bundled Iowa Piano WAV files.

Pitched instruments should appear as selectable clip child items in the left project sidebar, alongside the drum lane entry. Selecting a pitched instrument changes which instrument's note events are visible and editable in the piano roll.

Changing the selected pitched instrument should not mutate existing `NoteEvent` timing or pitch data. Note events belong to a specific pitched instrument by serializable `instrumentId`, so `Default Synth` and `Iowa Piano` notes may coexist in the same clip and can play at the same time.

The current implementation keeps the selected sidebar item as runtime app state. The note events themselves store serializable instrument IDs. Once sidebar clip and instrument management is implemented, each clip should also store a serializable list of pitched instrument IDs that controls which pitched instrument child items appear under that clip.

## Sidebar Clip and Instrument Management

The left project sidebar should become the primary place to manage reusable M1 hybrid clips.

- The project or Clips section should expose a `+` button for creating a new clip.
- The clip add button may open a compact menu with `Build a clip` and `Import a file`.
- `Build a clip` should preserve the existing new hybrid clip behavior.
- `Import a file` should open a browser file picker for WAV import and create an audio clip entry.
- Clip rows should expose a `+` button for adding a pitched instrument and a `-` button for deleting the clip.
- Pitched instrument rows should expose a `-` button for removing that instrument from the clip.
- `Drums` remains a mandatory child item for every hybrid clip and should not expose a remove action in the first version.
- Available pitched instruments should be shown in a compact picker or popover when adding an instrument.
- The instrument picker should not be clipped by sidebar, panel, or workspace overflow.
- Icon-only controls must be semantic buttons with accessible labels.
- Selection state should remain visually clear for clip rows, `Drums`, and pitched instrument rows.
- Expanded or collapsed clip groups should use `aria-expanded` when practical.

Deleting a clip or pitched instrument should avoid surprising data loss. The first implementation should keep at least one clip available and should require confirmation or a documented safe fallback before deleting notes owned by a removed pitched instrument.

## Clip Duplication

Clip duplication belongs in the sidebar near the existing clip row controls.

- Duplicating a sidebar clip creates a new reusable source clip.
- Duplicating a source clip does not create or move arrangement clip instances.
- Hybrid clip duplicates should be independently editable from the source clip.
- Audio clip duplicates may share the same imported sample reference instead of copying media bytes.
- Use a compact icon button with an accessible label such as `Duplicate CLIP 1`.
- Duplication is non-destructive, so the first UI does not need confirmation.

## Imported Audio Clips

Imported WAV clips should appear in the same sidebar clip list as built hybrid clips, but selecting one should not show the drum sequencer and piano roll.

The first audio clip selected view may be a simple placeholder or detail panel:

- Audio clip name.
- Source file name.
- Duration.
- Import status or limitation if the file is session-only.
- Optional preview/play control if supported by the current audio engine.

Use clear copy for file boundaries. Imported WAV bytes are browser-local source media stored outside project JSON. JSON-only project imports may need relinking, while project bundles include available source WAV files.

The sidebar project-file area should keep editable project transfer separate from final arrangement audio export:

- `Export Project JSON` exports serializable project data and sample metadata only.
- `Export Project Bundle` exports an app-owned ZIP with `project.json` and available imported WAV blobs.
- `Import Project File` accepts app JSON or app-created ZIP bundles and creates a new local project.
- Missing imported samples should appear as a compact list with one `Relink` action per sample.

The top transport/status area should show minimal project save status such as loading, saving, saved, or save failed.

Future arrangement duration resizing should happen in the arrangement view, not during import. The UI should treat that as non-destructive trimming or clip-instance length editing unless a later time-stretching feature explicitly adds stretch behavior.

## Sample Display Names

When displaying bundled drum sample names in the UI, derive the label from the `.wav` file name:

- Remove the `.wav` extension.
- Replace underscores (`_`) with spaces.
- Convert the result to uppercase.

Example: `Fred_Kick_1.wav` displays as `FRED KICK 1`.

## Drum Lane Editing

Drum lane names can act as sample selectors. Clicking a lane name may open a compact scrollable list of bundled drum samples. Render this menu as a popover above clipping editor containers when needed so it is not cut off by panel or workspace overflow. Selecting a sample should update the lane's visible label, the lane's `sampleId`, and existing drum events for that lane in serializable clip state.

Drum lanes may be reordered vertically with drag and drop. The visual order should come from the selected clip's ordered `drumLanes` array rather than a hard-coded component order.

## Drum Step Subdivisions

The drum sequencer may support smaller hit targets while preserving the primary `1` through `16` step labels.

- Keep the primary step number row stable.
- Render substep buttons below each primary number.
- Subdivision `1` renders one button per primary step.
- Subdivision `2` renders two smaller buttons per primary step.
- Subdivision `3` renders three smaller buttons per primary step.
- Keep beat grouping visible every four primary steps.
- Put the subdivision control near the step sequencer header with compact choices such as `1x`, `2x`, and `3x`.
- Use semantic buttons with `aria-pressed` for subdivision choices.
- Use accessible labels for substep buttons, including lane name, primary step number, and substep number.
- Prefer internal panel scrolling over document-level scrolling if the subdivided grid becomes too wide.
- Preserve readable lane names; do not shrink the lane label column so much that sample names become unreadable.

Substep button styling should continue to use CSS Modules and semantic tokens. Dynamic grid sizing may use inline styles when computed from subdivision count.

## UI Reference Policy

If a design prototype uses Tailwind, inline styles, or CDN assets, treat it as visual reference only. Convert the design into semantic React components, CSS Modules, and shared CSS variables.

- Do not add Tailwind, Tailwind config, or Tailwind CDN scripts unless a future architecture decision explicitly changes the styling strategy.
- Do not copy utility-class-heavy HTML directly into React components.
- Preserve the primitive/semantic token model in `src/styles/tokens.css`.
- Component styles should live in matching `.module.css` files.
- Component CSS Modules should reference semantic tokens, not primitive tokens, unless there is a documented exception.
- Inline styles remain acceptable for dynamic editor geometry such as note positions, widths, grid coordinates, and velocity heights.

For the main DAW UI shell, the Tailwind prototype should inform visual direction only: dark DAW workspace, compact editor spacing, muted lime active states, muted teal MIDI notes, thin borders, and clear panel separation.

For arrangement view prototypes from tools such as Google Stitch, preserve visual intent but correct layout problems during implementation. Do not copy Tailwind utility markup into React. Rebuild the view as semantic components with CSS Modules and shared tokens.

## Main UI Shell Styling

The initial main DAW UI shell converts the Tailwind-based prototype into React components with CSS Modules.

- The project remains CSS Modules-based.
- Design tokens live in `src/styles/tokens.css`.
- Primitive tokens define raw values and semantic tokens reference those primitives.
- Component styles live in matching `.module.css` files and should use semantic tokens.
- Dynamic editor geometry may use inline styles for note positions, note widths, note top values, grid coordinates, and velocity heights.
- Tailwind should not be added unless a future architecture decision explicitly changes the styling strategy.

## Accessibility Basics

- Use semantic buttons for step toggles.
- Provide keyboard access where practical.
- Keep visible focus states.
- Use labels or accessible names for icon-only controls.
- Avoid color as the only indicator of state.

## Dependencies

Do not require a visual design system dependency at this stage. Add UI dependencies only when they solve a clear implementation problem and the task justifies the cost.
