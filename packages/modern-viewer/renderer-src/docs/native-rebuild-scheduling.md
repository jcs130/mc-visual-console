# Native terrain rebuild scheduling

Movement into a new received volume can rebuild large water, grass and foliage
groups. The water loop previously performed every exact eight-corner fuzzy
biome lookup and 5×5 blend synchronously; static instances checked their time
budget only once per 256 instances. A quiet standing view did not expose this.

Rebuild work now checks a 4 ms cooperative budget before each block/instance.
Fluid neighbor indexing and typed buffer preparation also check between small
slices. Browser yields use animation frames. This is a scheduling target, not a
hard bound: an indivisible operation, allocation or garbage collection can
exceed it. Geometry, UVs, shading, original asset selection and tint radius are
unchanged.

One rebuild owns a cache of at most 65,536 successful exact biome/blend results.
It is cleared on commit, failure or retirement and never shared with another
snapshot. Eviction only repeats the original calculation. Seed overflow,
eight-corner selection, climate colormaps, grass modifiers and explicit missing
or unsupported results retain their original rules. The mesh signature includes
the full biome grid, including its origin, dimensions and world height clamp.

Temporary instances and fluid geometry belong to a stage. Existing complete
statics remain attached until synchronous commit. Reset/disposal invalidates
waiting work, releases its owned resources and prevents a retired commit. A
retirement is not reported as missing model support. Incoming snapshots still
coalesce into the existing single latest pending slot.

## Offline evidence, 2026-10-16

An actual received snapshot was replayed privately with original grass/foliage
colormaps. The baseline fluid helper was extracted unchanged from `8f5abc63`.
Node `setImmediate` supplied cooperative yields; browser/GPU timing was not
measured by this replay.

| Work | Baseline elapsed / longest slice | Updated elapsed / longest slice | Yields |
| --- | --- | --- | --- |
| All 9,131 water blocks, neighbor index and mesh buffers | 2,380.16 / 2,380.15 ms | 316.67 / 4.51 ms | 76 |
| All 19,937 water/grass/foliage tint results | 6,992.79 / 6,992.78 ms | 1,071.78 / 4.67 ms | 250 |

The full ordered water position/color/UV/normal/index buffers plus count/issues
had identical SHA-256
`151469d9902589caf395c56257dd7f231b1354bd9cfdd89f628cd20d1933d1c1`.
Both runs retained 9,131 blocks, one fluid mesh and zero issues. All ordered tint
results matched SHA-256
`89ef70257e297fa737822dddea889ab91947ee14cd2d8594285913ec252f769f`.
The cache reached its 65,536-entry limit in the tint replay and returned to zero
after clearing. Private snapshots, replay scripts and binary outputs stay
outside Git.

These measurements cover the verified CPU rebuild path. They do not establish
live moving frame rates, GPU upload cost, complete scene parity or the cost of
other synchronous work such as signature/room/raycast preparation. Live moving
acceptance must use the rebuilt served viewer separately.
