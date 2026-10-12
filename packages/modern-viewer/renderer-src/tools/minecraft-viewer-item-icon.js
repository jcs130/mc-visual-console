/** Use the skin face from a validated Minecraft profile on player heads. */
function cortiItemLabel(item) {
  return typeof itemDisplayName === 'function' ? itemDisplayName(item) : item?.customName || item?.displayName || item?.name || '';
}
function cortiHeadKey(item) {
  return typeof paperItemHeads !== 'undefined' ? paperItemHeads.key(item) : item?.headTextureHash || '';
}
function cortiItemIconUrl(item) {
  const name=String(item?.name || '').replace(/^minecraft:/,'');
  if (typeof paperItemHeads !== 'undefined' && paperItemHeads.reserved(item)) return null;
  if(typeof paperItemAppearances!=='undefined' && paperItemAppearances.reserved(item))
    return paperItemAppearances.icon(item);
  return /^[a-z0-9_]+$/.test(name)?`/icons/${name}.png`:null;
}
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
  const iconUrl=cortiItemIconUrl(item);
  if (!iconUrl) {
    slot.classList.add('corti-enchanted-outline');
    return;
  }
  const glint = document.createElement('span');
  glint.className = 'corti-enchant-glint';
  glint.style.left = `${left}px`;
  glint.style.maskImage = `url("${iconUrl}")`;
  slot.append(glint);
}

function cortiAppendHeadFace(slot, item, left) {
  if (!paperItemHeads.reserved(item)) return;
  // Some transient panels created a vanilla icon before calling this hook.
  // Remove it immediately, including while the original texture is loading.
  slot.querySelectorAll('img').forEach(node => node.remove());
  if (!slot.querySelector('.corti-item-fallback')) {
    const fallback = document.createElement('span'); fallback.className = 'corti-item-fallback';
    fallback.textContent = cortiItemLabel(item).slice(0, 2); slot.append(fallback);
  }
  const token = {}; slot.cortiHeadToken = token;
  slot.dataset.headStatus = 'pending';
  slot.title = cortiItemLabel(item) + ` × ${item.count || 1}`;
  void paperItemHeads.icon(item).then(url => {
    if (!slot.isConnected || slot.cortiHeadToken !== token ||
        !slot.dataset.identity?.includes(paperItemHeads.key(item)) && slot.classList.contains('corti-slot') && slot.dataset.identity) return;
    slot.querySelectorAll('img,.corti-item-fallback').forEach(node => node.remove());
    const image = document.createElement('img'); image.className = 'corti-head-icon';
    image.alt = cortiItemLabel(item); image.style.left = `${left}px`; image.src = url;
    slot.prepend(image); slot.dataset.headStatus = 'ready';
  }).catch(() => {
    if (!slot.isConnected || slot.cortiHeadToken !== token) return;
    slot.dataset.headStatus = 'unavailable'; slot.title = cortiItemLabel(item) + ' · 原物品贴图暂不可用';
  });
}
