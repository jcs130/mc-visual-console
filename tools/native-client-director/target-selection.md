# Broadcast target preference

Public import: `mc-visual-console/broadcast-selection`. A host reads a profile-local operator preference, resolves it against a fresh native roster, filters rule and model candidates, then applies the final target gate before issuing a camera request. This is display policy, not a game action or Agent goal.

`mcvisual.broadcast-selection/v1` contains `id` (UUID), `mode` (`auto` or `follow`), `updatedAt` (ISO timestamp), `scope: {server, observerUuid}` and, for follow, `target: {name, uuid}`. Preferences persist across reconnects of that same observer/server. Missing means automatic; malformed, scope mismatch or unreadable must fail closed. Follow waits for an offline/dead/replaced identity rather than selecting a substitute. The caller must distinguish absent from invalid files.

Automatic coverage does not promote idle players or unknown scenes. Fresh combat outranks other activity; equal-priority real scenes can share airtime. `broadcastSubjects` filters model menus, and `broadcastAllows` checks the result again using current facts. `broadcastPacing` lets explicit selection override only editorial holds; native render binding, unresolved/manual pause, menus and frequency budgets remain enforced. A submitted preference is not an actual camera attachment: report the native target UUID/camera UUID and fresh rendered receipt separately.
