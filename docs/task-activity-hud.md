# Public task progress in the native spectator HUD

`corticoTaskRecords` consumes an optional, host-public `task-activity-state/v1`
projection. Each row uses the existing `agent-activity/v1` envelope, session
`task-progress`, and result schema `task-progress/v1`. This is a bounded
presentation interface, not a task executor or a source of completion evidence.

Required result fields: `world`, `observedAt`, `expiresAt`, `bodyOwned`,
`goalCompleted: false`. The producer updates the current task purpose, model/tool
phase and last-return status; it does not send arguments, private instructions,
reports, memory or reasoning. Consumers select the configured World and reject
expired, future or excessive-lifetime records. IDs update a current slot.

The panel shows task purpose and phase duration alongside independent native body
status. A model request can therefore be visible while the body is idle. Tool
acceptance and returned queries are not rendered as a completed objective.
Discontinued task telemetry expires; existing body/log panels remain available
if the optional public endpoint is absent. Target UUID, server, connection epoch,
read-only transport and panel limits are unchanged.

Build the standalone provider through `tools/native-client-content/prepare-provider.mjs`.
This change does not replace a native JAR, alter camera control, or remove the
container dismissal/pin/identity protections. Source, frozen provider deployment,
actual frames and spoken commentary require separate verification.
