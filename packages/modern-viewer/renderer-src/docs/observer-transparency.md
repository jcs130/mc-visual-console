# Observer obstruction transparency

Third-person and dungeon views retain original wall and roof textures at 35%
opacity when they obstruct the observed room. The measured connected-floor
mask and camera sight corridor determine the affected fragments. The fade
settles using the existing frame loop; the player, unrelated scenery and ground
below the observed feet retain their native visibility and depth behavior.

The opaque pass retains unaffected fragments. Two reusable overlay meshes per
affected source mesh share its original geometry, textures, lighting uniforms
and native visible-span callbacks. A colourless depth pass selects the nearest
obstructing surface. An equal-depth colour pass blends that surface over the
already-rendered room, preventing repeated unsorted layers from becoming dark.
The shader uses alpha blending, with no screen-door pattern. Overlays disappear
when the fade clears and release their materials on unload/disposal; they never
dispose the source geometry or textures.

Section connectivity is seeded by the actual display camera and, while a room
is revealed, its observed room. The renderer's anchor remains the coordinate
origin for shader uniforms and frustum boxes. Camera translation and projection
changes invalidate visible draw spans. An unreceived camera section cannot
prove occlusion; the normal frustum pass retains received terrain in that case.

Solid interiors close at the same foot plane that the shader protects. Each
closing face requires a received opaque full cube and its exact original top
UV. Air, unsupported models and unknown cells cannot supply invented surfaces.
Higher or lower connected steps do not move this boundary into the rock. The
bounded radius covers the reveal and foreground camera corridor. Orbiting alone
does not rebuild this geometry.

Regression tests cover observer seeds, zoom/resize invalidation, unknown camera
sections, overlay ownership and unload, shader alpha, upper-floor actors, and
the foot-plane boundary. Actual WebGL acceptance additionally checks a frozen
81-column scene in first/third/dungeon views and dungeon zoom, rotation, tilt and
reset. A controlled green background, red rear wall and blue front wall produce
RGBA `[0,166,89,255]` at 35% opacity, then `[0,0,255,255]` after restoration.
These pixel values verify alpha compositing, not full Java scene parity.

Adaptive DPR, section connectivity, native batching and original texture
sampling remain enabled. Active obstruction transparency costs two additional
surface passes; software-rendered headless timings do not establish desktop GPU
frame rates. No extra game account, world mutation or model request is needed
for visual verification.
