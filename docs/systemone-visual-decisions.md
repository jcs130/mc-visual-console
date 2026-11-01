# SystemOne visual decision integration

The public `mc-visual-console/systemone-decisions` entry implements the neutral
host-owned `agent-mc-world/contracts` DecisionPort shape. Configure an endpoint,
credential callback and stable session ID explicitly. Imports and construction
perform no IO; there is no model loop, provider discovery or default server.
The Minecraft core only adds optional inline images and inference metadata to
its public contract; it does not own these HTTP calls or host secrets.

Requests use top-level `images` and a single `questions` object. A scene's action,
space and continuity questions share one image upload and one encoding on the
deployed service. Each answer must be a member of its original criteria; null,
foreign IDs, bad correlation and exceptions never become camera commands.
There are four HTTP lanes, a 15-second total deadline, no retry, bounded pending
work and latest-frame coalescing. Cancellation aborts fetch and response reading.
An uncooperative transport retains its occupied lane until it actually settles.

The client accepts at most four inline JPEG/PNG images, each no larger than
512 pixels on either side. Each question is budgeted with its shared state,
instructions, criteria and vision allowance against 4096 tokens. The default
UTF-8 text and patch allowances are conservative estimates, not a claim to be
every provider's exact tokenizer. Hosts may supply the actual token counters.
Encoded base64 bytes are not mistaken for prompt text tokens.

The camera judge panel accepts `images`, `imageTokens` and `imageRevision` and
supports a 15-second deadline and zero reserved output for classification. The
live host uses one frame with three questions, one in-flight camera assessment,
at least eight seconds between batches and at most six batches per minute.
Transport capacity of four does not imply four continuously running loops.
The same image encoding is reused across questions by the service.

`native-vision-source` supplies an explicitly configured, read-only frame port.
Native companion 0.1.16 captures at most 512 pixels on demand from Minecraft's
world framebuffer, before desktop overlays; it does not move the system mouse,
open a port or capture continually. A single transient JPEG and receipt are
overwritten. The receipt binds SHA-256 bytes, observer, server, connection, world,
camera actor and original camera request. GUI, transitions, cancellation, stale
scope and a changed camera invalidate capture. GL framebuffer, texture, pixel
packing and scissor state are restored after the bounded readback. Encoding runs
on one bounded daemon worker; scope changes invalidate its pending output.

The live adapter only evaluates an existing legal whole-plan proposal versus
`keep`. It owns no gameplay tool, target, memory or actor controller. Existing
native geometry checks, manual pause, camera transaction, dwell, projection
cooldown and render receipts remain authoritative. Results older than five
seconds or inconsistent with the current actor, request, world, view, geometry
or observed position are discarded. Known camera loss bypasses model waiting.
Invalid/unavailable advice falls back to the existing validated camera rules.

Production inference logging retains only IDs, queue/compute latency, token
counts, allowlisted vision metrics and client status/counters. It logs no image,
state, prompt, credential or answer text. The panel's optional raw audit callback
is not connected to the production logger. A transport abort proves the client
closed HTTP; it does not by itself prove that a running GPU kernel was cancelled.

Death-screen recovery remains a native lifecycle rule. A real followed-player
death screen can no longer block its already bound death/detach observation.
Only a natively living spectator with fresh current-request death evidence may
dismiss that stale overlay. Ordinary menus, real observer death, manual stops,
stale/foreign requests and unknown state remain protected. Recovery does not
invoke an LLM or respawn/move another Agent.

Source, package builds, offline consumers, installation and actual live evidence
are recorded separately. No npm release or game-host upgrade is implied by this
integration. Real backend service latency, current visual acceptance and a
future natural death/recovery event must not be inferred from unit-test counts.
