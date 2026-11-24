import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Release wiring gate: policy tests alone cannot detect a missing native caller.
export async function checkContainerProtection(dir = path.dirname(fileURLToPath(import.meta.url))) {
  const read = file => fs.readFile(path.join(dir, file), 'utf8');
  const [sync, menu, keys, build, bag, panel, contents] = await Promise.all([
    read('NativeSpectatorSync.java'), read('SpectatorMenuGuardMixin.java'),
    read('SpectatorKeyMixin.java'), read('build.mjs'),
    read('ReadOnlyInventoryScreen.java'), read('SpectatorEquipmentPanel.java'), read('PreviewContents.java'),
  ]);
  const required = [
    ['bounded mirrored menu', sync, /menuPreview=pendingPreview!=null\?pendingPreview:new InventoryTravelPolicy\(now\(\),InventoryTravelPolicy.IDLE_PREVIEW_MS\)/],
    ['bounded requested and mirrored backpack', bag, /new InventoryTravelPolicy\(now\(\), InventoryTravelPolicy.IDLE_PREVIEW_MS\)/],
    ['owned menu guard', sync, /if\(ownsAnyMenu\(\)&&menuPreview!=null\)/],
    ['target travel and idle dismissal', sync, /menuPreview\.expired\(now\(\)\)\|\|actor!=null&&menuPreview\.observe\(now\(\),actor\.getX\(\),actor\.getZ\(\),true\)\)client\.player\.closeContainer\(\)/],
    ['real menu revision renewal', sync, /revision!=menuStateId[\s\S]*?menuContents\.update\(containerStacks\(client\)\)\)menuPreview\.contentChanged/],
    ['in-place item updates and components', contents, /ItemStack\.matches\(previous, next\)[\s\S]*?next\.copy\(\)/],
    ['menu lifecycle cleanup', sync, /menuClosed\(Object screen\)[\s\S]*?menuPreview=null;menuContents=null/],
    ['local inspection renewal', menu, /NativeSpectatorSync\.menuPointer\(mx,my,inside/],
    ['operator pin input', keys, /key==80&&NativeSpectatorSync\.toggleMenuPin\(\)/],
    ['behavioral tests packaged', build, /names\.push\('InventoryTravelPolicyCheck'\)/],
    ['keep clock across server backpack replacements', sync, /bag\.adopt\(s,id\)/],
    ['stale-body independent backpack expiry', bag, /travel\.expired\(time\) \|\| actor != null && travel\.observe/],
    ['read-only character equipment', panel, /actor == null \? null : actor\.getItemBySlot\(cell\.slot\(\)\)/],
    ['six ordered equipment slots', panel, /EquipmentSlot\.HEAD[\s\S]*EquipmentSlot\.CHEST[\s\S]*EquipmentSlot\.LEGS[\s\S]*EquipmentSlot\.FEET[\s\S]*EquipmentSlot\.MAINHAND[\s\S]*EquipmentSlot\.OFFHAND/],
    ['equipment in requested backpack', bag, /SpectatorEquipmentPanel\.draw\(/],
    ['equipment in owned mirrored container', menu, /ownsAnyMenu\(\)[\s\S]*SpectatorEquipmentPanel\.draw\(/],
    ['equipment scoped to remote entity and UUID', sync, /p!=mc\.player&&\s*p\.getId\(\)==s\.entity\(\)&&p\.getStringUUID\(\)\.equalsIgnoreCase\(s\.player\(\)\)/],
    ['equipment viewport tests packaged', build, /names\.push\('SpectatorEquipmentLayoutCheck'\)/],
  ];
  for (const [name, source, pattern] of required) assert.match(source, pattern, `Missing container protection: ${name}`);
  return {schema:'mcvisual.container-protection/v1', idlePreviewMs:15000, maxUnattendedMs:30000, backpackIdle:true, equipmentSlots:6, checks:required.map(([name])=>name)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await checkContainerProtection()));
