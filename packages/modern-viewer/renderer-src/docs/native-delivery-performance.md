# Native observation delivery: caching, flow control and lossless terrain updates

This candidate extends the motion-cadence fixes. It creates no Minecraft account,
does not change the action connection or original resource bytes, and leaves
ordinary native/FOM consumers on complete snapshots unless `terrainDeltas: true`
is explicitly selected by their host. Source publication is separate from deployment.

## Application resources

The trusted site loader verifies the existing SHA-256 manifest before making
precompressed Brotli/gzip copies in memory once at startup. It never compresses
these large scripts per viewer request. The loader rewrites script URLs to
`/watch/_static/<sha256>/<application>.js`; only the two operator-built JavaScript
bundles are eligible. They contain public application code, never publisher data.
An unknown hash, arbitrary filename, query, or attempted game resource is rejected.

The same versioned script URL is shared across role switches and refreshes:
`Cache-Control: public, max-age=31536000, immutable`, `Vary: Accept-Encoding`
and a weak content ETag. Compression quality values and explicit refusal are
honored. Scoped CSS remains private with revalidation, because its original HUD
texture URLs resolve within that particular role's view. HTML, world state,
inventory, models and the SSE stream retain the existing authorization/no-store
rules. No external CDN or new public port is needed for this change. The immutable
application-code namespace is suitable for a future same-origin edge cache;
private model uploads and observations must never be added to that public cache.

## Bounded acknowledgement window

The relay advertises `maxInFlightChunks: 4`; a new publisher can have at most four
64 KiB chunks awaiting acknowledgement per request. Compression and sends remain
ordered. A slow HTTP response queues at most that bounded window and withholds
acknowledgements until drain; it never grows an unbounded frame queue. Sequence,
decompression-output and body-size limits are unchanged. Cancellation removes
queued data/drain listeners. End is sent only after all acknowledgements.
An older relay without the capability retains one-chunk stop-and-wait behavior;
an older publisher also works with the new relay. This removes an avoidable
round-trip wait for every small SSE or terrain chunk, without a new WebRTC/STUN/TURN
deployment. A four-chunk window is not a promise of four times real-world FPS.

## Terrain

Existing conservative opaque-face and sky/player-connected surface selection
remains in charge of visibility. Glass, leaves, partial shapes and unknown space
are not guessed to be opaque. Only selected surfaces carry render models. Hidden
solids retain their exact native material IDs as compressed runs for camera,
particle and room collision; removing those facts would make a clipped wall look
like empty space.

An opted-in first snapshot encodes visible integer voxel coordinates as indices
within its existing bounds; hidden-solid rows become `[startIndex, length, stateId]`.
The browser restores the exact original arrays before rendering. Unsupported or
noninteger provider data uses the ordinary full snapshot. This reduces wire data,
not world detail, FOV or original model geometry.

Subsequent snapshots omit unchanged state tables/biomes and apply bounded array
splices to changed surface groups, hidden runs and neighbor cells. Every delta
requires its exact epoch, registry, mode and previous terrain sequence. The normal
session UUID/entity checks still run after reconstruction and before committing
the next base. Decoder state is private from mutable display pose/presentation.
Large changes, missing per-viewer baselines, backpressure recovery, new viewers
and reconnects use complete snapshots; ordinary full streams remain accepted.
Small edits avoid repacking/stringifying a full volume just to choose a tiny patch.
The source keeps one bounded previous snapshot, not an indefinite world history.

## Measurements and limits

On an actual captured NEKO scene (offline measurement, no game connection), the
original JSON was 526,845 bytes / 106,749 bytes with gzip level 3. Indexed initial
data was 333,167 / 95,377 bytes. An explicitly synthetic one-block edit within
that captured scene was 1,139 / 685 bytes and reconstructed the complete original
state, surface and collision arrays exactly. This does not establish live WAN,
mobile, or 16-Agent throughput. The previous 3.69 MB application bundle measured
about 678 KB with Brotli quality 5; exact frozen-build sizes must be recorded at release.

The WebGL canvas exposes `terrainTransport` alongside `motionCadence` and
`frameGaps` for separate wire/CPU/render checks. Default frustum culling and original
instancing remain; this change does not claim to eliminate all off-screen GPU work.
Camera-directed streaming would also need a bounded camera-interest protocol,
neighbor margins, collision coverage and turn/teleport recovery before adoption.

References: [MDN HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching),
[MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control),
[WebSocket backpressure](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API),
[Three.js frustum culling](https://threejs.org/docs/pages/Object3D.html),
[InstancedMesh bounds](https://threejs.org/docs/pages/InstancedMesh.html).
