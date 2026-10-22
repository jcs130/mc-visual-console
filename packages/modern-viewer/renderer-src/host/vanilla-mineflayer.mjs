import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prepareNativeWorldPreviewHost } from '../tools/native-world-preview-host.mjs';
import { observeVanillaNativeStream, vanillaPlayerPresentation } from './vanilla-native-stream.mjs';

const require = createRequire(import.meta.url), requireChunk = createRequire(require.resolve('prismarine-chunk'));
const nbt = requireChunk('prismarine-nbt');
const VANILLA_1211_STATES = '55893d269459e1e05387903c77b2db877d7cece875ed31a5a6a2f965822ea546';

/** Optional SDK adapter for an unprojected Java 1.21.1 action connection. It is
 * deliberately separate from native-mineflayer.mjs's modded gateway adapter.
 */
export async function prepareNativeConnection({ assetDirectory, viewerPort = 0,
  decoratePresentation = null, bundledAppearanceCatalogFile = '', serverItemCatalogFile = '', serverItemCatalogSha256 = '' }) {
  const manifest = JSON.parse(await fs.readFile(path.join(assetDirectory, 'native-assets.json'), 'utf8'));
  if (manifest.minecraftVersion !== '1.21.1' || manifest.registryHashes?.['block-states.jsonl'] !== VANILLA_1211_STATES
      || manifest.sources?.some(row => row.name.endsWith('.jar') && row.name !== '1.21.1.jar')) throw Error('VANILLA_CONNECTION_ASSETS_MISMATCH');
  if (decoratePresentation !== null && typeof decoratePresentation !== 'function') throw Error('VANILLA_PRESENTATION_PROVIDER_INVALID');
  const prepared = await prepareNativeWorldPreviewHost({ assetDirectory, port: viewerPort, bundledAppearanceCatalogFile,
    serverItemCatalogFile, serverItemCatalogSha256 });
  return { attach(bot) {
    if (bot.version && bot.version !== '1.21.1') throw Error('VANILLA_CONNECTION_VERSION_MISMATCH');
    const stream = observeVanillaNativeStream(bot, prepared.registrySha256);
    const presentation = () => {
      const original = vanillaPlayerPresentation(bot, stream.handState(), stream.menuState(), stream.selfState());
      const value = original && { ...original, serverItemPackId: prepared.serverItemPackId };
      return value && decoratePresentation ? decoratePresentation(bot, value) : value;
    };
    const host = prepared.attach({ bot, nativeStream: stream, simplifyNBT: nbt.simplify,
      expectedUsername: bot.username || bot._client.username, getPresentationState: presentation });
    const foreignGateway = packet => {
      if (packet.channel === 'mcviewer:native_packet') host.world.unavailable(Error('VANILLA_CONNECTION_PROJECTED_GATEWAY_REJECTED'));
    };
    bot._client.on('custom_payload', foreignGateway);
    let closed = false;
    return { host, stream,
      async listen() { return viewerPort > 0 ? host.listen() : null; },
      get url() { return host.url; },
      query(input = {}) {
        const value = host.status(), envelope = { schemaVersion: 1, playerUuid: bot._client.uuid ?? null,
          source: 'same_player_unprojected_vanilla_connection', observedAt: new Date().toISOString() };
        if (closed || !value.presentation.available) return { ...envelope, available: false, reason: closed ? 'VANILLA_CONNECTION_CLOSED' : 'VANILLA_BODY_UNAVAILABLE' };
        if ((input.action ?? 'status') === 'status') return { ...envelope, available: value.viewer.available, readOnly: true,
          loadedColumns: value.viewer.loadedColumns, registrySha256: prepared.registrySha256, actions: ['status', 'inventory'], renderParityVerified: false };
        if (input.action === 'inventory') return { ...envelope, available: true, inventory: value.presentation.inventory, menu: value.presentation.nativeMenu };
        return { ...envelope, available: false, reason: 'VANILLA_NATIVE_QUERY_UNSUPPORTED' };
      },
      async close() { if (closed) return; closed = true; bot._client.off('custom_payload', foreignGateway); await host.close(); stream.close(); }
    };
  } };
}
