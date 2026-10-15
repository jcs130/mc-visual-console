# Native particle rendering

The same action-player connection forwards received `world_particles` events.
They are transient, bound to the current player UUID/connection epoch and never
replayed from a snapshot. No second game account, model call or server effect is
created by this renderer.

This increment implements 11 of the **109 registered vanilla 1.21.1 particle
types**: heart, angry_villager, crit, enchanted_hit, damage_indicator, flame,
small_flame, smoke, poof, explosion and sweep_attack. It is an increment toward
the full migration, not complete particle support. The remaining types require
their original providers, state and rendering rules, not generic substitutes.

The implementation preserves original constructor random-draw order, float and
double arithmetic, crit's initial tick, damage-indicator lifetime override,
flame field jitter, post-increment lifetime removal, sprite sequence, cutout and
camera-facing quad. The 47 sprite references use 38 distinct original PNG files.
The client JAR is locked to SHA-256
`499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`.
Packets carry no random seed; the observer's reproducible random streams do not
claim to recover the phase of another vanilla client's random generators.

Smoke and poof use original static collision shapes exported for all 26,684
block states with the original empty collision context. Discrete voxel axes and
occupancy are retained: merging them into bounding boxes loses internal planes
when a particle starts inside a shape. Dynamic, block-entity or offset-dependent
shapes that require unavailable world context are explicit errors, as are
unreceived columns. No guessed full block substitutes those shapes.

Collision data are an optional additive file, independently checked against the
unchanged native block-state registry. Missing/corrupt data do not change the
world registry or gameplay. The browser reuses a collision index until its world
inputs change. Event rate, live particles and pending texture loads are bounded;
excess events are rejected with diagnostics. Reconnection retires pending work.

Explosion and sweep use the original full-bright rule. The other families expose
`NATIVE_PARTICLE_LIGHTMAP_UNAVAILABLE` until original lightmap parity is added.
`completeParticleParityVerified` and complete scene parity remain false. Tests
check original assets, constructor/tick edges, exact voxel clipping, transient
identity and resource cleanup; actual browser acceptance is a separate step.

Offline checks:

```sh
node --test tools/test/native-particles.test.mjs tools/test/native-session.test.mjs
node tools/run-renderer-tests.mjs
```
