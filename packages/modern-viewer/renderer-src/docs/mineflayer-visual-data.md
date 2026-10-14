# Mineflayer visualization data

Use the installed Mineflayer source and `docs/api.md` as the reference. All live
views use the action bot's connection; no extra model calls reconstruct data
that already exists. Clicking a display is not a Minecraft action.

| Data source | Viewer use | Integration |
| --- | --- | --- |
| `controlState`, entity pose, `physicsTick` | Actual keys/look, walked trail, body/camera animation | Shared native view |
| Pathfinder path/update/reset/stop/reached events | Planned path and actual navigation state | Shared Agent overlay |
| Inventory slots, quick-bar selection, held/offhand stacks | Original hotbar, inventory, 2×2 crafting and components | Vanilla adapter; original GUI |
| `currentWindow` and server window/slot packets | Actual crafting-table, chest and furnace windows | Vanilla adapter; existing menu renderer |
| Window `selectedItem` and outgoing `window_click` | Carried cursor stack, clicked slot/window, brief inventory playback | Bound slot pointer; no invented mouse coordinates |
| Furnace properties 0–3 | Actual fuel/cooking progress | Only with all four received properties |
| Main-hand settings, use state, serialized arm animation | Original item/skin arms and supported swings | Native first/third-person view |
| Health, food/saturation, oxygen, XP, received attributes | Survival HUD and changes | Existing native HUD; unknown attributes stay unknown |
| Received entity/equipment/hurt/movement packets | Nearby mobs, projectiles and damage | Existing supported native entity models |
| Messages/title/actionbar, time/weather | Server guidance and environment | Existing native presentation |
| Merchant offers, scoreboards/teams/tab, recipe availability | Trading/quest indicators and recipe explanations | Further adapters; not claimed deployed in this change |

Recipe execution and completion belong to the game body. A real grid/result/
click and the framework task receipt can be displayed separately. An available
recipe or sent click does not prove that an item was produced; native inventory
differences and task outcomes supply that evidence.

Useful next views include bounded item gain/loss history, food recovery/damage,
route failure locations and queue/step timelines. They should consume existing
events/receipts and remain separate from private model reasoning.

## Inventory and crafting semantics

Audited against the deployed Mineflayer **4.37.1**, especially
[`inventory.js`](https://github.com/PrismarineJS/mineflayer/blob/4.37.1/lib/plugins/inventory.js),
[`craft.js`](https://github.com/PrismarineJS/mineflayer/blob/4.37.1/lib/plugins/craft.js),
[`furnace.js`](https://github.com/PrismarineJS/mineflayer/blob/4.37.1/lib/plugins/furnace.js)
and the [official API](https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md).
Mineflayer is a Java protocol client with high-level state/actions; it is not a
source of original client pixels or mod rendering code.

- A player's own inventory is window **0**. Opening it is a local client UI
  action, so there is no server `open_window` for pressing E. The spectator can
  open a read-only view; real window-0 clicks trigger a short automatic preview.
  This must not be labelled as an observed keypress E.
- A crafting table is a real server window with a **3×3** grid and output slot;
  player inventory has a **2×2** grid. `currentWindow`, `windowOpen`,
  `windowClose`, slot updates and outgoing `window_click` describe the actual
  operation sequence. Mineflayer has no generic public `craftCompleted` event.
- `craft.js` itself predicts some result/ingredient slot changes before server
  confirmation. The UI shows the observed Mineflayer operation/state. A sent
  click or predicted output must not be promoted to a verified item gain.
  Completion evidence belongs in a separate task receipt plus authoritative
  inventory reconciliation.
- Furnace/blast-furnace/smoker property IDs **0–3** give remaining fuel, total
  fuel, cooking time and total cooking time. All four are required for a known
  progress display; an absent update must not become invented zero progress.
- `recipesFor` gives currently feasible recipes for known inventory/table
  inputs; `recipesAll` includes recipes that may lack ingredients. Neither
  proves success or covers arbitrary server/mod-specific recipe rules.

## Further useful views

The following are concrete candidates, not a claim that all have been deployed.
Keep bounded event buffers and send an initial snapshot plus changes to the
viewer; none require another language-model call.

| View | Actual inputs | Key distinction |
| --- | --- | --- |
| 合成过程与材料缺口 | Grid/output/cursor slots, real click sequence, `Recipe.inShape`/`ingredients`/`delta` | Recipe preview, predicted slot and confirmed inventory change stay separate |
| 箱子存取与物品收支 | `currentWindow`, `updateSlot`, transfer clicks, inventory snapshots | Moving between own slots is not item gain/loss; reconcile by full stack components |
| 熔炼与烹饪 | Three slots, four server progress properties, window open/close | Preserve unknown progress and stop drawing a closed window |
| 村民交易 | `villager.trades`/merchant offer packets, selected trade, input/output slots | Price, demand, discounts, stock and disabled offer are server facts; viewing is not purchasing |
| 挖掘/放置/战斗 | `targetDigBlock`, digging completion/abort, block updates, real swings, hurt/equipment events | Command, sent action and world effect are separate; label cancellation/rejection |
| 路线与卡点 | Pathfinder path/update/reset/reached, actual physics positions | Draw planned path and walked trail separately; record actual failure location |
| 生存变化 | Health/food/saturation/oxygen/XP, effects, equipment | Show damage/healing/food change as data, without inventing an attacker/cause |
| 服务器玩法指引 | Scoreboards, teams, tab list, title/actionbar and chat | Display received original text; arbitrary quest/NPC systems need an explicit adapter |
| 世界事件与感知 | Received block/entity/chunk updates, weather/time, visible entity equipment, particles | Only the action player's received world; no omniscient map or guessed sound |
| Agent 队列时间线 | Framework public goal, queued/running/terminal receipts and cancellation | Game protocol does not contain the planner's queue or private reasoning |

Ownership remains explicit: shared viewer owns protocol presentation and visual
widgets; the independent framework owns goals, queue and confirmed action
receipts; Neko supplies the thin integration, performance and narration. The
renderer never imports a host's planner or duplicates its decision loop.
