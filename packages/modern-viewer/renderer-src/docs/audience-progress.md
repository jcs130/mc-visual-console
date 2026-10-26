# Audience progress card

The existing `agent-activity/v1` stream accepts a public review status as a `phase`
record with `session: "audience-progress"`. Supply a stable `id`, an actual update `at`,
`title`, audience-facing `text`, and `result: {schema: "audience-progress/v1", expiresAt, phase}`.
The compact card remains visible above the collapsed history. It disappears when its
timestamp expires or the connection drops. Updating the same ID changes one record;
it does not generate an accumulating log or tool call.

This status is explicitly authored for viewers. Do not pass hidden reasoning, prompts,
private chats or Memory content as its text. A completed review means suggestions are
available; it does not mean suggestions were adopted or any Minecraft goal completed.
The renderer does not generate speech or query a model. Speech belongs to the optional
presentation World, which can use the same public progress contract.
