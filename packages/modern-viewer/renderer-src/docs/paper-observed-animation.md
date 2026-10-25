# Paper observed player animation

## 2026-10-25 candidate; production consumer must be updated separately

Paper's ServerPlayer velocity is an impulse vector, not a reliable measure of a
network-controlled player's walking. The observer preserves that native velocity
and supplies separate `paper_position_delta` locomotion from two actual server
ticks. The renderer accepts only the same UUID/entity, world and generation,
with a fresh bounded interval. Teleports, stale samples and a missing baseline
remain unavailable; they never become predicted walking.

Repeated reads of one Paper tick still deliver ordered world packets, without
inventing physics ticks or resetting gait to zero. Fast motion frames carry pose,
climbing, item-use and attack state without resending inventory. Original animation
tracks run on render frames between source samples; the existing interpolated
body/head pose and third-person camera remain. Mineflayer/Numen paths stay compatible.

An unavailable server YSM selection cannot be recovered by this renderer. In the
reported Cormy case, the original files and native saved selection existed while
Freesia's active mapper cache was empty. The server candidate restores it from the
private Worker's actual native readback, preserving model, texture and nonmandatory
flag. Deploy that separately; never hardcode a model or invent a confirmed binding.

## Verification

- 1307 shared renderer tests pass, with 37 existing conditional skips.
- Original Cormy geometry, textures, scale and arms were loaded from private assets.
  Nine authored actions were checked, including continuous bone changes between
  source samples and walk/attack/eat/drink playback.
- Desktop browser replay used original terrain/model assets, explicitly labelled
  synthetic action receipts and 150 ms per-resource delay. Model, original held
  items and third-person following were visible; no browser console errors.
- Its recorded 60-second frame window had p50/p95/p99 7/21/29 ms, including seven
  intervals over 100 ms. Cold first terrain was 21.637 s. This is fixture evidence,
  not a production or mobile performance promise.
- No new Minecraft connections, gameplay actions or model API calls were used.
  Full Java animation parity and expanded production release remain unverified.

Run `node tools/run-renderer-tests.mjs`. Optional original asset checks use
`PAPER_APPEARANCE_FIXTURES`, `PAPER_APPEARANCE_NATIVE_ASSETS`, and
`PAPER_CORMY_ACTION_FIXTURE=1`. The fixture directory contains original bundle JSON
and `appearance-source-verified.json`. Missing assets skip those checks; this
does not prove parity. Models, captures and fixtures stay outside Git.

Freeze this revision into both observer host and website. Never mix a new browser
bundle with an older host signature. Prior startup/cache/default-third-person
changes are retained. Models without an authored action remain explicitly partial.
