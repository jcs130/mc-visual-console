# Paper 1.20.6 observer HUD and OBS overlay

2026-10-11 deployment status: the owner deferred this round's Paper restart. Production remains AgentFriend 0.4.13 / CortiEyeMirror 0.1.10, with only `ag_CorMy → ag_cormy_eye` hot registered. The features below require the candidate server release and an updated viewer host/bundle. Source publication does not install either deployment.

Use `/?obs=1` (also `?overlay=1`) as an OBS Browser Source above the game capture. The document background is transparent. World, mesher, minimap and player preview rendering are disabled; the original inventory icons, hotbar, health, food, armor, XP, mana, skills and messages remain. No extra Minecraft account or HTTP listener is created by this mode.

The Paper host needs AgentFriend 0.4.14 and CortiEyeMirror 0.1.11. Automatic `<name>eye` / `<name>_eye` cameras and the privileged `live` camera receive native inventory snapshots from the player they actually spectate. Names are case insensitive. Login still requires the server's trusted ingress policy. `live` chooses its target in the normal spectator UI; it is never assigned a fixed player by the watcher.

## Host adapter

Keep the existing Mineflayer connection and gameplay adapter. Attach the shared bridge before serving sockets:

```js
import { createViewerObserverBridge } from './host/viewer-observer.mjs';
const observer = createViewerObserverBridge(bot, {
  serializeWindow: window => serializeViewerWindow(bot, window),
});
io.on('connection', socket => observer.subscribeSocket(socket));
// On host shutdown:
observer.dispose();
```

The generic host in `src/mc-modern-viewer.mts` already enables this for 1.20.6. It exports `serializeViewerWindow` and `serializeAvatarState`; their item serializer preserves the native item components. A consumer with its own container adapter can omit `serializeWindow` and retain its richer trade/book adapter. Do not attach two observer bridges or duplicate the same state feed.

The bridge subscribes to `mcviewer:state`, validates the recipient UUID and schema, and accepts observer state only when the native camera entity ID matches the announced subject. It sends `viewerSession`, `observerState`, `skillsState` and authoritative container-close events. Source changes, disconnects, respawns and stale streams clear the previous HUD and window. Native container snapshots are optional and read only. The original avatar stream continues to provide native inventory items; server-attested vitals replace the spectator's own health and XP.

The page also dismisses an open window after cumulative horizontal motion over 0.35 blocks or vertical motion over 0.5 blocks. Rotating the camera and small position jitter retain it. Paper closes the actual player window at the same thresholds, and closes physical inventories when their source moves beyond 6.5 blocks. Virtual menus do not have a physical source. Closing a stale window cannot move or create items.

Connection recovery retains the shared capacity retry policy: a rejected full viewer waits for a slot; a reconnected OBS page reloads only after admission. Disconnect immediately clears the previous observed player's HUD and window.

## Update a copied viewer

Pull this repository, update the consumer's host import, and rebuild its existing asset directory with its original Minecraft version and preset:

```text
node packages/modern-viewer/renderer-src/tools/build-minecraft-viewer-client.mjs packages/modern-viewer/renderer-src <existing-assets> --preset=qiandengji
```

Retain the original asset manifest and versioned GUI textures. A host must continue mapping `/textures/gui/...` to its own version's GUI assets, as the generic static responder does. Restart only the consumer's viewer service through its normal manager when required; pulling source alone does not update a copied bundle or a remote computer.

## Verification boundaries

Disposable Paper actors verified automatic pairing, original inventory components, `live` switching/private isolation/detachment, native merchant copies, movement and range closure, and dimension following. Browser inspection verified transparent composition and actual source items/vitals. The fixture corrected known potion and food schema errors in its local minecraft-data 3.112.0 process using the actual 1.20.6 codecs; installed Agent clients were not modified. This is not a claim that every old Mineflayer dependency correctly decodes every vanilla item component. Native 1.21.1 uses its independent adapter. Actual OBS capture and phone/Xbox device appearance need separate checks.
