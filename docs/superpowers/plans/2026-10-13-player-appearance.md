# Player appearance selection implementation plan

**Goal:** Let viewers choose the observed player's Web appearance and restore the live server appearance.

**Architecture:** Keep server observations immutable. Add a small shared chooser backed by the existing Paper YSM cache or the native 1.21.1 original-asset profiles. Selection is local to the page and current player/session; it never sends commands or changes server state.

**Tech stack:** Browser JavaScript, Three.js, existing Socket.IO/SSE adapters, Node tests and browser verification.

**Spec:** User request on 2026-10-13: restore the disabled character-model chooser in the shared visualization repository, with YSM support, then synchronize tested source to main. Confirmed scope: Web display only; follow the server by default.

## Constraints and review focus

- Default follows the server; only explicitly selected, available original resources override it.
- Do not resurrect missing VRM assets or modify consumer/gameplay projects.
- Keep UUID/epoch/entity binding, original asset hashes and explicit unsupported-animation notices.
- Test stale async loads after rapid switching, entity-ID reuse, reconnect, missing/evicted resources, and server updates while a local override is active.
- No selection persistence across accounts or server sessions; no game messages or model calls.

## Steps

- [x] Add the shared accessible chooser: model, texture, current source/status and restore-server button. Render untrusted names as text.
- [x] Extend Paper YSM presentation with a local selection layer over received verified assets. Preserve current server state and dispose old actors on transitions.
- [x] Extend native self-player presentation with explicit Web selections from verified 1.21.1 profiles. Label asset provenance separately from server selection.
- [x] Test controller races, original asset loading, UI events and transport isolation; run the related renderer suites.
- [x] Build both affected renderer entry points, verify actual browser selection/reset, document publication versus consumer deployment.
- [x] Reconcile upstream main and prepare the normal push. The actual publication result and commit are recorded with local bundle hashes outside Git.
