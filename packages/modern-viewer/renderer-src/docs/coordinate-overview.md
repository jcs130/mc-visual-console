# Coordinate overhead capture

The modern Mineflayer viewer exposes `window.__mcOverviewCapture(options)` after
terrain initialization. Call it in an isolated, authenticated capture page on
`/third/?photo=1`, after meshing settles. It returns a PNG data URL and compact
`mc-overview/v1` metadata. The renderer's complete terrain pass, original models
and textures are reused; this is not a synthetic block-color map.

```js
const { png, metadata } = window.__mcOverviewCapture({
  center: [-545, -436], span: 32, grid: 4,
  markers: [{ at: [-541, 64, -438], label: 'bridge' }],
});
```

Defaults: center at current body X/Z, 32 blocks wide, grid every 4 blocks. Width
is bounded to 8–96 blocks; depth follows the viewport ratio. Up to 8 pins have
absolute XYZ and a label of at most 24 characters. Grid 0 hides the lines.
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
