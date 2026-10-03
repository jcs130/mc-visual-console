/** Use the skin face from a validated Minecraft profile on player heads. */
function cortiDurability(item) {
  const left = Number(item?.durability?.left);
  const max = Number(item?.durability?.max);
  return Number.isFinite(left) && Number.isFinite(max) && max > 0 && left >= 0 && left <= max
    ? { left, max } : null;
}

function cortiAppendDurability(slot, item) {
  const durability = cortiDurability(item);
  if (!durability || durability.left === durability.max) return;
  const track = document.createElement('span');
  track.className = 'corti-durability';
  const fill = document.createElement('span');
  const ratio = durability.left / durability.max;
  fill.style.width = `${Math.max(1, Math.round(ratio * 100))}%`;
  fill.style.backgroundColor = `hsl(${Math.round(ratio * 120)} 100% 45%)`;
  track.append(fill);
  slot.append(track);
}

function cortiAppendEnchantmentGlint(slot, item, left) {
  if (item?.enchanted !== true) return;
  slot.classList.add('corti-enchanted');
  const name = String(item.name || '').replace(/^minecraft:/, '');
  if (!/^[a-z0-9_]+$/.test(name)) {
    slot.classList.add('corti-enchanted-outline');
    return;
  }
  const glint = document.createElement('span');
  glint.className = 'corti-enchant-glint';
  glint.style.left = `${left}px`;
  glint.style.maskImage = `url("/icons/${name}.png")`;
  slot.append(glint);
}

function cortiAppendHeadFace(slot, item, left) {
  const hash = item?.headTextureHash;
  if (String(item?.name || '').replace(/^minecraft:/, '') !== 'player_head' ||
      typeof hash !== 'string' || !/^[0-9a-f]{40,64}$/.test(hash)) return;
  const face = document.createElement('span');
  face.className = 'corti-head-face';
  face.style.position = 'absolute';
  face.style.top = '2px';
  face.style.left = `${left}px`;
  face.style.width = '32px';
  face.style.height = '32px';
  const image = `url("/head-texture/${hash}.png")`;
  face.style.backgroundImage = `${image}, ${image}`;
  face.style.backgroundSize = '256px auto';
  face.style.backgroundPosition = '-160px -32px, -32px -32px';
  face.style.backgroundRepeat = 'no-repeat';
  face.style.imageRendering = 'pixelated';
  face.style.pointerEvents = 'none';
  slot.append(face);
}
