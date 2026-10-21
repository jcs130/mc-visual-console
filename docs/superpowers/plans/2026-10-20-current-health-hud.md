# Current health HUD implementation plan

**Goal:** Never hide received current health when the maximum attribute is lower than it.

**Architecture:** Change only the shared native HUD. Keep packet values, the vanilla attribute calculation and the gameplay connection intact. Size the heart row for both received readings and label inconsistent readings without inventing a maximum.

**Tech stack:** JavaScript, existing native UI DOM fixture and Node test runner.

**Spec:** The HUD must show the same player's actual health; absent or inconsistent capacity must remain explicit.

## Constraints and review focus

- Minecraft Java 1.21.1 remains primary; preserve the existing 1.20.6 and native adapters.
- Keep unknown maximum health unknown; do not substitute a standard 20-point maximum.
- Check health above maximum, half hearts, death, unknown maximum and normal multirow health.
- Do not change the game ledger, player data, host SDK, model or other processes.
- Commit source and validate the served bundle separately from gameplay success.

## Task: Preserve current health in the native HUD

Files: `packages/modern-viewer/renderer-src/src/native-viewer/native-ui-adapter.js` and `packages/modern-viewer/renderer-src/tools/test/native-ui-adapter.test.mjs`.

- [x] Add a fixture with `health:22,maxHealth:1`; assert eleven full heart sprites, explicit inconsistent-capacity text and unchanged source values. Add half-heart, dead and unknown-capacity cases.
- [x] Run `node --test packages/modern-viewer/renderer-src/tools/test/native-ui-adapter.test.mjs` and retain the failing result.
- [x] Calculate heart capacity with `Math.max(maxHealth, health)` only when the maximum is present and positive. Keep the 160-point HUD bound and identify capacity below current health in the tooltip/ARIA label.
- [x] Rerun the native HUD, layout, attribute and native presentation tests (61 passed; one existing private crafting-image fixture skipped).
- [x] Commit and fetch/reconcile/push ordinary shared main (`10a4c48f`).
- [x] Export a separate fixed-commit runtime source archive. Precompile the native host's browser bundles against the unchanged verified 1.21.1 asset directory; this native host builds bundles on startup, rather than using the legacy client asset exporter. Keep the old deployment and record source/archive hashes.
- [x] Use the owned executor's normal stop/drain and lease release before changing its explicit renderer path. Keep the catalog and original resources unchanged. Resume the same configured player without replaying old commands. Verify real pixels and natural task terminals; record long-term survival and desktop audio as separate acceptance items.

## Verification result

The original fixture failed with one heart instead of eleven. The repair passed 113 related tests; the existing private crafting-image fixture remained skipped. A separate archive projected 344 public runtime files from the committed tree and compiled the native browser bundles without a bot or listener. The serving host reported the new source/bundle hashes; actual WebGL and accessible text showed eleven hearts for health 22 and explicitly retained the inconsistent maximum reading of 1.

The deployment uses an explicit renderer-directory override, leaving the packaged consumer dependency unchanged. Updating public distribution pins is a separate release task. The HUD repair does not establish server inventory consistency, planner quality, long-term survival, complete rendering parity or desktop audio playback.
