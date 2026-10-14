# Mineflayer visual completion implementation plan

> Execute the tasks sequentially in the current session. The user has authorized implementation and live browser acceptance; no delegation is needed.

**Goal:** Complete the standard 1.21.1 viewer's useful Mineflayer operation, inventory/crafting, survival, server-information and public Agent playback views.

**Architecture:** The shared renderer observes the existing action connection and owns bounded presentation state and browser widgets. The independent autonomy package publishes only public queue/action history through its existing explicit port. The Neko plugin only pins the packaged framework. No new planner, game account or game control endpoint is added.

**Tech stack:** Node ESM, Mineflayer 4.37.1, Three.js, Minecraft 1.21.1 original assets, Python autonomy package, Node test runner and pytest.

**Spec:** `packages/modern-viewer/renderer-src/docs/mineflayer-visual-data.md`, plus the user's request to complete the visualization before further autonomy work.

## Global constraints

- Observe the action player's own connection; never use another account's state.
- Keep original assets, full stack components, resource priority and model transforms.
- Sent input, predicted client state, server-observed state and task terminal outcomes remain distinct.
- Keep model prompts, arguments, authentication/configuration and private memory out of public data.
- Keep game server/model/Neko main continuous; prepare all changes before a normal owned-runtime handover.
- Preserve concurrent main-branch work; commit tested increments and push main without rewriting history.

## Review focus

- Respawn/dimension/account changes clear old history, item baselines, offers and menus.
- Inventory transfers and cursor moves do not become fabricated item gains; initial sync is not income.
- Trade/window IDs and public Agent session/player identities cannot cross-bind.
- Long-running item changes cannot permanently exhaust icons or leak blob URLs/textures/listeners.
- Missing optional data stays unknown; client recipe prediction never becomes proof of produced items.

## Task 1: Bounded same-body activity telemetry

Files: create `host/vanilla-activity.mjs`, `tools/test/vanilla-activity.test.mjs`; update `host/vanilla-native-stream.mjs` and `tools/native-world-preview-host.mjs`.

Interface: `observeVanillaActivity(bot, {now,onChange})` returns `{snapshot(),close()}`. Snapshot is a UUID/entity-bound public object containing bounded operation/event history, server-reconciled inventory changes, current dig/use state, received offers and server panels.

- [ ] Test initial inventory sync, moves across own slots/cursor, real server gain/loss and a respawn reset. Example assertion: `assert.equal(activity.snapshot().items.length, 0)` after a pure transfer.
- [ ] Test health/food changes, digging completed/aborted, server block changes and path failures. Example assertion: `assert.equal(events.at(-1).kind, 'dig_aborted')`.
- [ ] Implement packet/event observers with coalesced updates and byte/count limits; never wrap calls to dispatch extra actions.
- [ ] Run `node --test tools/test/vanilla-activity.test.mjs tools/test/vanilla-native-stream.test.mjs` and commit the passing telemetry slice.

## Task 2: Inventory/crafting/trading operations

Files: extend activity/menu observers; add `src/native-viewer/native-activity-ui.js` and `tools/test/native-activity-ui.test.mjs`; update `src/native-viewer/native-console.js` and the original menu adapter.

Interface: `createNativeActivityUi({document})` returns `{setIdentity(),update(),reset(),dispose()}`; consumes bounded activity plus public Agent data. Slot rendering uses the existing original item resolver.

- [ ] Test that an unknown/foreign window cannot show offers, while matching merchant packets show actual two inputs, output, price and stock.
- [ ] Test 2×2 and 3×3 grid/cursor/click sequences separately from completion; display current recipe candidates and actual missing ingredients without asserting success.
- [ ] Render collapsible operation/income/survival/server panels with safe text nodes, stable histories, explicit empty/unknown states and no game-action controls.
- [ ] Run the telemetry/menu/UI tests and commit the passing menu/playback slice.

## Task 3: Public Agent queue and outcome timeline

Files in the canonical autonomy package: `viewer_public.py`, `runner.py`, `controller.py`, `integrations/viewer-engine.mjs`, plus public-projection tests.

Interface: extend the existing projection with bounded `timeline` and `queue` fields; publish matching native terminal updates and sanitized schema/error categories. Reader keeps schema/session/player/freshness and size checks.

- [ ] Test queued/running/blocked/cancelled/terminal history, unrelated execution IDs and exclusion of private text/configuration. Example assertion: `assert 'api_key' not in json.dumps(projection)`.
- [ ] Supply the public projection to the shared activity widget through the existing injected port; never reconstruct a planner queue from Mineflayer packets.
- [ ] Run package pytest, public Node checks, lint and isolated wheel consumer checks; commit/push, then pin the thin plugin with its normal release check.

## Task 4: Original rendering gaps and long-running reliability

Files: original item-icon cache, hand/use-state/motion modules, native entity source checks and native scene map presentation; corresponding existing tests.

- [ ] Reproduce cache exhaustion from more than 128 complete stacks and verify bounded reuse/eviction, pending decode cancellation and blob cleanup.
- [ ] Preserve locked client SHA verification while accepting an equivalent original client filename; test conflicting declarations still reject.
- [ ] Audit original hand-use/equip transforms against the locked 1.21.1 bytecode, add actual observed use timing and supported animation branches, and test stale/foreign/unknown use state remains unavailable.
- [ ] Add a native top-down terrain/route view from the same received block geometry/state; test identity/reset and bound limits, keeping missing mod rendering explicit.
- [ ] Run full shared renderer regressions and actual exported-asset checks; commit/push each passing increment.

## Task 5: Build, deployment and actual browser acceptance

- [ ] Prepare the complete pinned package/bundle before stopping the owned runtime; compare source and served bundle hashes using the same working directory.
- [ ] Reconcile native pending/uncertain/inflight state through the existing stop API, hand over only the owned runtime and restore the authorized goal/observation state.
- [ ] Verify the user's browser shows all new panels and actual first/third/dungeon views. Exercise bounded ordinary inventory/crafting/container/furnace operations through the existing body queue when needed; disclose fixtures separately from autonomous behavior.
- [ ] Save screenshots, continuity/process/bundle evidence and a requirement checklist. Report source/package/deployment/live effects separately; do not call partial native rendering complete Java parity.
