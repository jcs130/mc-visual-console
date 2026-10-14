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
