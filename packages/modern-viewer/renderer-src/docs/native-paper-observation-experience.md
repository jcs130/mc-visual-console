# Paper observation: HUD, motion and cached free camera

2026-10-25 candidate. This is a shared renderer change; consuming websites and
observation workers must rebuild and deploy the same frozen revision.

## Actual failures and fixes

- Paper omits `activeHand` when the observed player is not using an item. The
  adapter previously emitted `undefined`; the strict private-state copier then
  rejected the entire presentation as `PRESENTATION_INVALID`. Emit `null` for
  the absent optional hand. Keep identity, size and private-state validation.
  The real adapter-to-host regression covers inventory, armor, maximum health,
  selection changes, idle/use transitions, position-derived locomotion and
  public-scene inventory redaction.
- Pose samples are placed on the source timeline. An arrival-only 50 ms buffer
  with 150 ms transit continually clamped to the latest old sample, producing
  packet-sized steps at 60 FPS. Buffer measured source age plus arrival cadence,
  capped at 500 ms / 64 poses. Invalid clocks fall back to arrivals; identity,
  world/teleport and long-gap resets remain. No prediction or action replay.
- Paper-selected original YSM actors now expose their actual UUID and preview
  capability to the existing inventory mirror. It clones the displayed rig's
  pose and shares original geometry/textures without moving the world actor.
  Armor values and armor item slots are available; worn armor on these YSM rigs
  is still not implemented and is explicitly marked unsupported.

## Free camera

Native observation pages offer `自由视角`, a local `region` camera mode. Rotation,
pan and zoom reuse OrbitControls. The target is constrained to the intersection
of the received columns and snapshot bounds, including missing-column holes.
It does not follow the moving player. `第三人称` returns to following.

This uses only the current authorized scene already in memory. It opens no new
Minecraft or stream connection, does not request/generate distant chunks, and
does not provide historical-world browsing. The button stays hidden on legacy
pages that do not mount the native console. Reload retains the existing route
semantics. Toolbar controls wrap on narrow screens.

## Evidence and limits

Run `node tools/run-renderer-tests.mjs` in `renderer-src`. The candidate passes
1,336 checks with 37 existing conditional skips. Set `PAPER_APPEARANCE_FIXTURES`,
`PAPER_APPEARANCE_NATIVE_ASSETS` and `PAPER_CORMY_ACTION_FIXTURE=1` to additionally
exercise the operator's original NEKO, Kirito and Cormy assets; do not publish
those private bundles. Tests check walk/run/stop, original bone motion between
network samples, attack/eat/drink tracks and read-only inventory mirroring.

An isolated actual WebGL replay uses original captured terrain and Cormy assets,
synthetic explicitly labelled receipts, 50 ms sampling and 150 ms transit age.
It is not a production connection or a mobile hardware performance benchmark.
Full Java pixel parity, all model-specific actions and worn equipment remain
unverified. No game server or player data change is needed for these fixes.
