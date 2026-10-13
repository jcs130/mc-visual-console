# Coordinate overhead capture

The modern Mineflayer viewer exposes `window.__mcOverviewCapture(options)` after
terrain initialization. Call it in an isolated, authenticated capture page on
`/third/?photo=1`, after meshing settles. It returns a PNG data URL and compact
`mc-overview/v2` metadata. The renderer's complete terrain pass, original models
and textures are reused; this is not a synthetic block-color map.

```js
const { png, metadata } = window.__mcOverviewCapture({
  center: [-545, -436], span: 128, grid: 'auto', labels: 'auto',
  markers: [
    { at: [-541, 64, -438], label: 'bridge' },
    { at: [-542.25, 64, -436.8], anchor: 'position', label: 'exact' },
  ],
});
```

Defaults: center at current body X/Z, 32 blocks wide, automatic grid and labels.
Width may be 8–2048 blocks; depth follows the viewport ratio. Up to 128 pins have
absolute XYZ and a label of at most 24 characters. These are per-image resource
budgets, not a restriction to local close-ups. No extra terrain is requested.
Grid `auto` scales with span (32→4, 128→16, 512→64); integers 1–2048 request an
explicit block interval, 0 hides lines. Labels `auto` become IDs for dense scenes;
`full` requests names and coordinates, `ids` requests IDs. Label placement avoids
overlap; any hidden labels are counted in `metadata.labels` and the footer.
All points remain drawn; IDs follow input order, even for off-image points.

Markers default to `anchor:'block'`: `at` must be integer block indices and
`world` is **at + [0.5,0.5,0.5]**, so the pin lands inside the cell. Negative
indices use the same addition, not truncation. `anchor:'position'` keeps exact
XYZ with no offset, even at integer positions. SELF and camera `center` also
remain continuous coordinates. Labels use `[x,y,z]` for cells and `(x,y,z)` for
positions. Metadata keeps both the input `at` and projected `world` coordinates.
Hosts require v2 so old corner-based captures cannot be described as centered.
Pins and grid use the same orthographic camera and floating-origin conversion
as the actual scene: north (-Z) up, east (+X) right. Pixel coordinates refer to
the returned image, with [0,0] at its top left. Grid lines are block boundaries.

Only already meshed columns are photographed. Missing columns are hatched and
counted, never interpreted as empty space. Pins carry caller-supplied height,
not a measured surface height or visible entity claim. Roofs, trees and bridges
occlude lower layers. Exact support, clearance, reachability and permissions
need data queries. Native modded backends without this API must report it as
unavailable; they must not silently substitute a vanilla scene.

Atmospheric distance fog is omitted for this photograph; solid geometry still
occludes normally. The temporary camera, scene origin, fog and culling settings are restored even
on failure. The API sends no movement, click, server command or chunk request.
Hosts should preserve existing capture-session admission, cancellation and
dimension/connection freshness checks, with at most one capture in flight.
No new vision model or persistent image/prompt logging is introduced.
