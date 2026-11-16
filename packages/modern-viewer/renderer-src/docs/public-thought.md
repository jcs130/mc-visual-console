# Public thought notes in the native HUD

Hosts may attach an explicitly public `publicThought` to an active `task-progress/v1` result. The note contains `text` (up to 160 characters), `next` (up to 100), its original ISO `at`, `source: model-public-note` and `verification: intention-not-outcome`. It is a deliberately authored short public explanation, not raw model reasoning or a prompt dump.

The Cortico adapter accepts only fresh notes from the task's existing world scope. A separate bottom-left panel shows the thought, next step and note age; the bottom-right panel continues to show actual body and receipt status. Display polling never refreshes the thought's original timestamp. Notes expire after two minutes, and the host must invalidate them when task requirements change. No action is executed and no task is completed by displaying a note.

The existing content stream still binds recipient, target, connection and world, and rejects remote/executable widgets. This change needs a new optional provider bundle, not a new Java mod. Preserve original observer pause state, models, graphics and audio modules when installing it. Tests separately cover projection, display schema, expiration, private/raw fields and real WebSocket target lifecycle.
