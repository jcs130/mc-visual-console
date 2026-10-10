# `observeViewerSounds`, `observeViewerFishingCatch`, `viewerPageHtml` and `serveViewerAsset`

These ESM observers attach to an existing Mineflayer bot. They do not create a bot, choose actions, send chat or request a model. The socket protocol is in `../SOCKET_PROTOCOL.md`.

`createViewerContentBridge` in `viewer-content.mjs` observes vanilla **1.20.6** particles, map pixels, item frames and TextDisplay bubbles on the action connection. Attach once before login; use `subscribeSocket(socket)` for each browser to replay only bounded current snapshots and drop old particles. Private dialogue is never inferred from chat history or shared across bots. Dispose with the bot/host. See the [Paper guide](../docs/paper-content-compatibility.md) and [bubble/font update guide](../docs/text-display-bubbles.md). It does not mutate Mineflayer's decoder or send game actions.

```js
import { observeViewerSounds } from './viewer-sound-packets.mjs'
import { loadViewerSoundRegistry } from './viewer-sound-registry.mjs'
import { observeViewerFishingCatch } from './viewer-fishing.mjs'

const audioRegistry = await loadViewerSoundRegistry(assetRoot, bot.version, bot.registry)
if (audioRegistry.diagnostic) console.warn(audioRegistry.diagnostic)
const stopSounds = observeViewerSounds(
  bot._client,
  audioRegistry.registry,
  id => id === bot.entity?.id ? bot.entity.position : bot.entities[id]?.position,
  event => io.emit('worldSound', event),
  event => io.emit('worldSoundStop', event)
)
const stopFishing = observeViewerFishingCatch(
  bot,
  event => io.emit('fishingCatch', event),
  serializeInventoryItem
)

function dispose() {
  io.emit('worldSoundStop', {})
  stopFishing()
  stopSounds()
}
```

`serializeInventoryItem(item)` returns the same bounded item payload used for the inventory and hotbar, or `null`. It must preserve `name`, numeric `type`, positive integer `count` and `metadata`; optional fields include `displayName`, `customName`, `headTextureHash`, `enchanted`, `components` and `nbt`. Java 1.20.6 custom names, textures and enchantments belong to item components. Preserve those fields so a caught treasure has the same identity in its entity and inventory forms. Do not key a stack only by its generic item name.

Raw `sound_effect`, `named_sound_effect` and `entity_sound_effect` are the audio source. Adding Mineflayer's derivative `soundEffectHeard` to the same socket would play duplicate sounds. Registry holders and inline resource names are supported; coordinates use the protocol's 1/8 block units. `stop_sound` forwards the specified category, resource name or both; empty `worldSoundStop` stops all active sounds. New viewer connections do not replay sound packets.

Java 1.20.6 numeric sound IDs require `public/sounds/registry.json`, exported from the matching client alongside block sounds. `minecraft-data` inherits the 1.20.4 sound table for this version, which maps real fish and villager sounds to unrelated events. The loader validates the complete version and client hash; missing or invalid exact assets disable numeric sounds with a diagnostic while inline named sounds still work. The protocol library already converts holder IDs to zero-based registry IDs; do not subtract again.

Hosts can include original registry facts in other presentation messages: `presentationEvent` with `kind: 'world_event'` uses `effectId`, integer `data` and absolute `position`. Block break event `2001` carries `blockName` from `registry.blocksByStateId[data]`; jukebox event `1010` carries `itemName` from `registry.items[data]`. Event `1011` stops the jukebox; `1018` plays the vanilla blaze firing sound. Biome and weather snapshots can include known `hasPrecipitation`, `temperature` and `precipitation` fields. Leave unknown climate fields absent; the world's raining flag alone does not imply rain falls in the current biome.

Catch attribution requires the local player's bobber, bite, actual rod reel, newly spawned loot close to the hook, velocity toward its owner, collection by that player and a matching inventory increase. Ordinary pickups, other players' catches, cancelled casts and full-inventory loot produce no catch receipt. Vanilla fish, junk and treasure use the same path. Pending evidence expires after 8 seconds and resets on Mineflayer `respawn` or `end`.

Catch observers share one outgoing-packet dispatcher per protocol connection. Viewers can close in any order: each disposal removes its callback, and the last observer restores the original `bot._client.write` when the dispatcher still owns it. Other plugins' wrappers are preserved.

`viewerPageHtml(assetRoot, mode, fallbackHtml)` selects `public/index.html`, `public/third/index.html` or `public/dungeon/index.html`. A root generated page can also serve another camera mode. `viewerPageCss(assetRoot, fallbackCss)` prefers `public/viewer.css`; missing generated files use the host's fallback. Optional speech frame, external script and stylesheet arguments preserve host overlays without changing the portable generated page.

`serveViewerAsset(response, root, relativePath, cacheControl?, range?)` restricts files to the supplied asset root, recognized asset formats and 32 MiB. Pass the incoming `Range` header for OGG streaming: full requests return `200`; supported single ranges return `206` with `Content-Range`; invalid or unsatisfiable ranges return `416`. The host must enforce its request method, Host, origin and content security policy before calling these helpers.
