import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Registry IDs are version-specific. minecraft-protocol already removes the
 * wire Holder's +1; the resulting soundId is the zero-based native registry ID.
 * minecraft-data currently aliases 1.20.6 sounds to 1.20.4, so that version must
 * use the verified native export rather than silently playing a different sound.
 */
export const VIEWER_SOUND_REGISTRY_LAYOUTS = Object.freeze({
  '1.20.6': Object.freeze({
    count: 1607,
    clientJarSha256: '02dfd345ac1ad55692d5dbc8486ac7e4fea72cd54ac494a79cd48963048e56b2',
  }),
});

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const emptyRegistry = () => ({ sounds: Object.freeze(Object.create(null)) });

export function validateViewerSoundRegistry(value, minecraftVersion) {
  const layout = VIEWER_SOUND_REGISTRY_LAYOUTS[minecraftVersion];
  if (!layout) throw Error('Unsupported exact sound registry version');
  if (!object(value) || value.schemaVersion !== 1) throw Error('Invalid sound registry schema');
  if (value.minecraftVersion !== minecraftVersion) throw Error('Sound registry Minecraft version mismatch');
  if (value.clientJarSha256 !== layout.clientJarSha256) throw Error('Sound registry client hash mismatch');
  if (!object(value.events) || Object.keys(value.events).length !== layout.count) {
    throw Error('Incomplete sound registry');
  }
  const sounds = Object.create(null);
  const names = new Set();
  for (let id = 0; id < layout.count; id++) {
    if (!Object.hasOwn(value.events, String(id))) throw Error('Sound registry IDs must be continuous');
    const entry = value.events[id];
    if (!object(entry) || typeof entry.name !== 'string'
      || !/^minecraft:[a-z0-9_][a-z0-9_.-]{0,159}$/.test(entry.name)
      || names.has(entry.name)) throw Error('Invalid or duplicate sound registry name');
    names.add(entry.name);
    sounds[id] = Object.freeze({ name: entry.name });
  }
  return Object.freeze({ sounds: Object.freeze(sounds) });
}

/** Load from an exported package root, not its public directory. The diagnostic
 * is suitable for a host status/log; it contains no file paths or stack traces.
 * Direct/inline resource names remain usable with an unavailable numeric table.
 */
export async function loadViewerSoundRegistry(assetsDir, minecraftVersion, fallbackRegistry) {
  if (!VIEWER_SOUND_REGISTRY_LAYOUTS[minecraftVersion]) {
    return { registry: fallbackRegistry ?? emptyRegistry(), source: 'minecraft-data', diagnostic: null };
  }
  try {
    if (typeof assetsDir !== 'string' || !assetsDir) throw Error('Missing exported sound registry');
    const source = await readFile(path.join(assetsDir, 'public', 'sounds', 'registry.json'), 'utf8');
    if (source.length > 1024 * 1024) throw Error('Sound registry metadata too large');
    const registry = validateViewerSoundRegistry(JSON.parse(source), minecraftVersion);
    return { registry, source: 'exact-assets', diagnostic: null };
  } catch (error) {
    const detail = error?.code === 'ENOENT' ? 'Missing exported sound registry'
      : error instanceof SyntaxError ? 'Invalid sound registry JSON'
        : /^(?:Invalid|Incomplete|Missing|Sound registry)/.test(error?.message ?? '') ? error.message
          : 'Unable to read exported sound registry';
    return { registry: emptyRegistry(), source: 'unavailable',
      diagnostic: `Minecraft ${minecraftVersion} numeric audio disabled: ${detail}; direct sound names remain available` };
  }
}
