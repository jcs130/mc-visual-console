# Coordinate overhead capture

The modern Mineflayer viewer exposes `window.__mcOverviewCapture(options)` after
terrain initialization. Call it in an isolated, authenticated capture page on
`/third/?photo=1`, after meshing settles. It returns a PNG data URL and compact
`mc-overview/v3` metadata. The renderer's complete terrain pass, original models
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
All already received and meshed terrain in these bounds is rendered. The overhead
camera is independent of the player's first-person field of view; no eye-visibility
or historical-pixel mask is applied. Metadata identifies this as
`source: 'client-loaded-world'`, `layers: 'top-surfaces-only'`.
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
Hosts require v3 so old corner-based or attention-unaware captures cannot be described as current.
Pins and grid use the same orthographic camera and floating-origin conversion
as the actual scene: north (-Z) up, east (+X) right. Pixel coordinates refer to
the returned image, with [0,0] at its top left. Grid lines are block boundaries.

## Task attention / region of interest

```js
const { png, metadata } = window.__mcOverviewCapture({
  span: 48,
  attention: {
    regions: [{ bounds: [-545, -443, -538, -436], label: 'uncertain passage' }],
    detail: 1,
  },
});
```

Regions are selected explicitly by the caller from its task and evidence. The
renderer does not infer hazards, importance scores or neural attention weights.
Accepts 1–32 regions with exact `[minX,minZ,maxX,maxZ]` boundaries (no cell-center
offset), positive sides at most 2048 blocks and optional labels ≤24 chars.
`detail` selects a 1-based region, defaults to 1; 0 keeps a single highlighted
overview. Other values must name an existing region.

Non-selected surroundings are dimmed; overlapping selected regions stay bright.
The optional right panel re-renders the selected area, rather than enlarging the
overview's pixels. Both panels share one output image and the same received scene.
`span` still defines the left overview's width in blocks; depth follows that
panel's aspect ratio. The detail has its own bounds, scale, grid and chunk coverage.

Root metadata describes the overview; `viewport` gives its final-image rectangle.
`attention.source` is `caller-selected`; regions retain original bounds plus
clipped final-image rectangles and `inFrame`/`clipped` flags. `attention.detail`
contains the selected A-number and its viewport, bounds, coverage, pins and labels.
All pixels/rectangles use the **whole image's** top-left origin, including the
detail panel's offset. An off-overview region may still appear in detail. An
unmeshed detail is hatched as unknown, never filled from another world or account.

This supports one overview followed by targeted cell/ray/slice queries. The same
image size does not inherently lower image tokens. Measure actual request volume
and task progress before claiming context savings or improved decisions.

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
