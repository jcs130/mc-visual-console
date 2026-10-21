# Native received-column cache

The former 512-column limit treated ordinary cache pressure as a permanent
protocol error: a radius-12 connection supplies 25 × 25 = 625 columns. This could
clear the scene and reject every subsequent packet even while the body kept moving.

`NativeColumnCache` retains exact received chunk buffers plus block-entity byte
accounting within 64 MiB / 2048 columns. At most 512 decoded columns are kept in
an LRU working set. A cold lookup decodes its received buffer; block updates write
through, so decoding cannot resurrect old terrain. This is a cache of the action
connection, not another account, disk world or generated terrain.

Wire-budget pressure evicts the farthest received column from the current body
position (oldest before a pose exists). It removes associated block entities and
invalidates terrain. Missing data is `unknown`; it is not substituted with air.
New genuine packets can restore coverage. Unload and dimension reset clear both
layers. Registry mismatch, sequence gaps and malformed chunk data remain strict
errors. Snapshot coverage publishes actual cache counts and eviction totals.

Regression coverage uses real 1.21.1 serialized chunks: 625 columns, cold reads,
position changes, updates, unload/reload, block entities, both cache budgets and
protocol mismatch. Synthetic tests and source builds do not prove scene parity
or a remote user's observed frame rate.
