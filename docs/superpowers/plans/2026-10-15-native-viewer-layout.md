# Native Viewer Layout Implementation Plan

> **For agentic workers:** Execute the checked tasks in this session; preserve the shared renderer and consumer boundaries.

**Goal:** Give the same-player native viewer the shared main-branch controls and layout without modifying Neko source.

**Architecture:** Both renderer entry points use the same presentation modules. The native entry adapts its existing authenticated snapshot stream; it does not create a second connection or issue game/model calls. Consumers explicitly pin, build and deploy the tested source.

**Tech Stack:** JavaScript ES modules, Three.js, Node test runner, Python public Neko SDK.

**Spec:** User request of 2026-10-15: compare the reference screenshot, adopt main optimizations, keep Neko main program source unchanged.

## Global Constraints

- Primary acceptance version: Java 1.21.1; keep the existing 1.20.6 integration.
- No Neko main program or SDK edits, process restarts, global configuration writes, second Minecraft account, additional model calls, or fabricated server abilities.
- Preserve unknown state, original resources, native queue ownership and unrelated files.

## Review Focus

- Late-created native panels must join the shared layout and visibility settings.
- Repeated snapshots must not duplicate messages; identity/epoch changes must clear old private messages.
- Disposing the page must release listeners, timers and its one scene.
- No photo provider must be visibly unavailable, with no automatic capture or model request.
- Main-branch source publication must be distinguished from the consumer's actual served build.

### Task 1: Shared UI wiring

Files: `src/native-viewer/native-console.js`, `src/modern-viewer/viewer-layout.js`, `src/modern-viewer/chat-history.js`, `src/modern-viewer/agent-view-gallery.js`, `tools/minecraft-viewer-chat.js`, their tests (all under `packages/modern-viewer/renderer-src`).

- [x] Add a failing native-console test for a single docked toolbar, history, photo entry, hidden dungeon controls and disposal.
- [x] Reuse `installViewerLayout({document,window})` and its `adopt()/dispose()` lifecycle; register native map/activity/status IDs with the same visibility settings.
- [x] Extract the existing bounded chat UI into `installChatHistory({socket,document,window})`; keep the legacy build shim and feed native `presentation.gameMessages` once per sequence/identity/epoch.
- [x] Reuse `installAgentViewGallery({document,window})`; show the host's explicit unavailable response when it has no captured images.
- [x] Run targeted Node tests, full renderer tests and original pack verification before committing.

### Task 2: Checked consumer synchronization and isolation

- [x] Fetch main again, reconcile concurrent work and push the tested shared renderer normally.
- [x] Refresh affected canonical generated adapters and explicit release inputs, preserving all core/autonomy improvements already on main.
- [x] Verify core source/build/types and isolated packed consumer; update canonical runtime and thin-plugin source pins if changed.
- [x] Add a plugin boundary regression proving no private host imports or source patching; run its SDK tests, Ruff and official release structure check.

### Task 3: Deployment and visual acceptance

- [x] Record protected Neko tracked-file hashes and the four protected process identities before handover.
- [x] Prepare the checked build while the old runtime runs; use only the exact owned executor's normal stop/drain/start/resume flow.
- [x] Verify served build hashes, third/first/dungeon views and docked controls in the existing browser tab.
- [x] Compare Neko tracked-file hashes and protected process creation times; report remaining capability/rendering gaps without claiming full parity or successful long survival.
