# Minecraft client connection console

A compact host-independent operator page. The host serves these three static files on its own loopback origin and implements:

- `GET /api/client`: `minecraft-client-console/v1`; connection server and actual protocol, public account state, launcher state, viewer links, one process-scoped `controlToken`, and accepted operation states.
- `POST /api/client/action`: JSON `{action}` with same-origin `Origin` and `x-mc-control`. Actions are explicit connect/disconnect, observer.start/stop and player.start/stop.
- `GET /api/harness/metrics`: optional independent diagnostics feed.

OAuth access/refresh tokens, provider `device_code`, caches, Java launch command lines and server-login passwords must never enter this response. The short-lived `user_code` is an operator-only challenge; keep it out of OBS, model context, events and shared dashboards. Rendering uses text nodes, and only official HTTPS device verification links are clickable.

The page reports protocol negotiation, account verification and Java window readiness separately. An environment process starting does not prove server login or gameplay success. It does not install Java/game assets, change server permissions or assume spectator privileges. Asset-version fidelity remains the renderer host's responsibility.
