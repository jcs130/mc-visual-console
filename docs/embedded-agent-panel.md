# Shared Agent panel

The `tools/client-console` page is the shared entry for game view, connection
controls and per-Agent System 1 / System 2 / background metrics. Hosts embed this
page rather than copying a dashboard or creating another game connection.

`GET /api/client` supplies the existing operator contract. Optional `host` metadata
contains `name`, `model`, `reasoningEffort`, `paused`, `state`, `coreVersion` and
`adapterVersion`. Missing values remain unknown. The page embeds an explicitly
reported loopback viewer only when the action connection reports ready, and
removes it on disconnect, stale control data or a switch away from the game tab.
It never reconnects the iframe on an unchanged snapshot.

Model statistics use the existing read-only `/api/harness/metrics` snapshot.
Opening a page does not add model requests or Minecraft subscriptions. Polling
reads existing state; metrics are read every two seconds while their tab is
visible. Tool returns are not goal completion. Missing usage remains unknown.

Embedding requires a host to opt in to an exact loopback `frame-ancestors` origin
through the core `serveClientConsole` presentation option. Default embedding
remains disabled; API Host/Origin/nonce checks remain independent. Control nonces
stay inside the console frame and must never be placed in URLs or host metadata.

Java 1.21.1 remains the primary maintenance target, with explicit 1.20.6 coverage.
The viewer and its original assets are reused unchanged by this UI update.

## Experiments

`/#experiments` is the metadata-only experiment subpage. `GET /api/experiments`
uses the core `agent-mc.experiments/v1` projection, never the raw method journal.
It shows configured jobs, current phase and heartbeat freshness, explicit budgets,
actual trial records, original/candidate/holdout measurements, token-usage coverage,
the validation gate and game-memory delivery status. A stale running heartbeat is
unknown; incomplete results and missing usage remain unknown. Opening or polling
the page never runs, retries, trains or adopts anything. An isolated passing gate
is not online adoption or demonstrated causal improvement. Method source, prompts,
answers, reasoning, chat and credentials are excluded from this endpoint.

Polling runs every two seconds only while the experiment tab is visible. The
host shares one cached core monitor across pages. An empty/unconfigured monitor
is shown honestly. Pre-monitor legacy journals are not inferred to be current
experiments; preserve their original evidence for explicit reconciliation.

The exact `dsh-app://app` Desktop ancestor may be explicitly enabled by a host.
This grants framing only; same-origin API/control checks remain unchanged.
