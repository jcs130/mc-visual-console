# Native RPG observation

The optional `player.viewerState` in Paper observations is bound to the observed player's UUID. It carries the server's RPG authority, rather than deriving a class from an item or substituting vanilla XP for RPG level. `self.experienceLevel` remains vanilla experience; `skills.rpg.level` is the RPG level.

The shared Paper adapter forwards bounded class/name, cumulative RPG XP and XP remaining to the next level, learning points, talent points/allocation, gold, party size, mana and available abilities. Missing backend data stays unavailable; missing cooldowns stay null. Target changes, disconnects and absent snapshots clear the old class. Native skill panels show a separate compact RPG summary; ordinary unmodified servers continue using the existing HUD.

Public fanout uses the same strict identity-bound field projection. Arbitrary plugin JSON, account fields and credentials are not forwarded. Server-side snapshots can be cached by target, with change-driven presentation updates; no viewer creates another Minecraft connection. The portable spectator site includes `native-rpg-state.js` alongside its public projection module.

The Qiandengji adapter exports the same read-only snapshot to registered Java Eye clients and the account-free observer. Paper supplies authoritative values; each consuming website must rebuild its native spectator bundle and switch its copied renderer. Updating this repository alone does not deploy a consumer or add a custom RPG panel to an unmodified Java client.

The legacy Vortex field `nextLevelXp` is an amount remaining (`experienceToNextLevel`), not the next level's total XP threshold. The public projection exposes it as `xpToNextLevel`; the UI never divides cumulative XP by that remaining amount.
