import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Release wiring gate: policy tests alone cannot detect a missing native caller.
export async function checkContainerProtection(dir = path.dirname(fileURLToPath(import.meta.url))) {
  const read = file => fs.readFile(path.join(dir, file), 'utf8');
  const [sync, menu, keys, build] = await Promise.all([
    read('NativeSpectatorSync.java'), read('SpectatorMenuGuardMixin.java'),
    read('SpectatorKeyMixin.java'), read('build.mjs'),
  ]);
  const required = [
    ['bounded mirrored menu', sync, /menuPreview=new InventoryTravelPolicy\(now\(\),15000\)/],
    ['owned menu guard', sync, /if\(ownsAnyMenu\(\)&&menuPreview!=null\)/],
    ['target travel and idle dismissal', sync, /menuPreview\.observe\(now\(\),actor\.getX\(\),actor\.getZ\(\),NativeObserverClient\.targetStateFresh\(\)\)\)client\.player\.closeContainer\(\)/],
    ['real menu revision renewal', sync, /revision!=menuStateId/],
    ['menu lifecycle cleanup', sync, /menuClosed\(Object screen\).*menuPreview=null/],
    ['local inspection renewal', menu, /NativeSpectatorSync\.menuPointer\(mx,my\)/],
    ['operator pin input', keys, /key==80&&NativeSpectatorSync\.toggleMenuPin\(\)/],
    ['behavioral tests packaged', build, /names\.push\('InventoryTravelPolicyCheck'\)/],
  ];
  for (const [name, source, pattern] of required) assert.match(source, pattern, `Missing container protection: ${name}`);
  return {schema:'mcvisual.container-protection/v1', idlePreviewMs:15000, checks:required.map(([name])=>name)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await checkContainerProtection()));
