# Observed arrows and ranged-item direction

The Mineflayer viewer previously put every entity into a 100 ms coalescing
window. An arrow could spawn and be removed on impact before the window ran;
removal deleted its pending spawn, so the browser received neither its spawn
nor its flight. This is reproducible without a Minecraft connection.

Arrow, spectral-arrow and trident samples now leave that queue immediately when
the existing transport is writable. Other entities remain coalesced. Distance,
hidden-entity rules, maximum entity count and backpressure are unchanged.
Destruction is sent immediately; no arrow lifetime is extended to guarantee a
screen frame, and no impact, hit or projectile trajectory is simulated. A shot
shorter than a browser frame or entirely under backpressure can still be unseen.

The legacy flight overlay also replaced arrows with cylinder/cone proxy models.
It now shares the native renderer's original Java ArrowRenderer six quads, UVs,
0.05625 scale and offset, using the connection version's original 32×32 arrow,
spectral-arrow or tipped-arrow PNG. Textures are preloaded, shared and selected
from the observed entity type/effect metadata, including metadata arriving after
spawn. Missing assets remain hidden. Direction uses received displacement or
the initial received velocity/angles; stationary arrows retain their direction.
This change covers 1.21.1 and the explicit 1.20.6 compatibility path. The old
trident/fireball/potion overlays and first-person nocked-arrow effect are outside
this change; complete projectile/Java pixel parity is not claimed.

Held bows and crossbows use the YSM locator-basis correction already in
`20dd179c`; it must reach the consuming frozen viewer. New bow tests use both
original YSM arm poses and four character headings. The original drawn-arrow
sprite points toward the target (forward dot product above .98); the existing
crossbow tests likewise verify the muzzle and both hands.

Validation: three transient-stream regressions; six arrow geometry, metadata,
direction and ranged-pose tests; both TypeScript configurations; shared renderer
tools 1,361 passed and 39 conditional fixture skips. An isolated WebGL page
rendered all three original arrow textures with 36 triangles and no page errors.
This is offline rendering/transport evidence, not a live-server firing test.
Freeze matching host and browser code before activation. Updating this source
does not replace a running consumer or authorize a production restart.
