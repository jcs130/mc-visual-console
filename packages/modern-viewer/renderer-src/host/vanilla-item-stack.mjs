// Explicit 1.21.1 wire-component to ItemStack codec subset. Missing/unsupported
// patches stay unavailable; never turn an unknown item into a default icon.
const INTEGER = new Set(['max_stack_size', 'max_damage', 'damage', 'repair_cost', 'custom_model_data']);
const UNIT = new Set(['hide_additional_tooltip', 'hide_tooltip', 'fire_resistant', 'intangible_projectile']);
const quote = value => JSON.stringify(value);
const componentName = type => typeof type === 'string' && /^[a-z0-9_]+$/.test(type) ? 'minecraft:' + type : null;

function componentValue(type, data) {
  if (INTEGER.has(type)) {
    if (!Number.isSafeInteger(data) || data < -2147483648 || data > 2147483647 ||
        (type !== 'custom_model_data' && data < 0) ||
        (['max_damage', 'max_stack_size'].includes(type) && data === 0)) throw Error('VANILLA_COMPONENT_INVALID:' + type);
    return String(data);
  }
  if (type === 'enchantment_glint_override' && typeof data === 'boolean') return data ? '1b' : '0b';
  if (type === 'unbreakable' && typeof data === 'boolean') return '{show_in_tooltip:' + (data ? '1b' : '0b') + '}';
  if (type === 'rarity' && ['common', 'uncommon', 'rare', 'epic'].includes(data)) return quote(data);
  if (UNIT.has(type) && data === undefined) return '{}';
  throw Error('VANILLA_COMPONENT_UNSUPPORTED:' + String(type).slice(0, 80));
}

export function vanillaItemStack(item, registry) {
  const name = typeof item.name === 'string' && /^[a-z0-9_]+$/.test(item.name) ? 'minecraft:' + item.name : item.name;
  const base = { name, count: item.count };
  try {
    if (!/^minecraft:[a-z0-9_]+$/.test(name) || !Number.isSafeInteger(item.count) || item.count <= 0 ||
        !Array.isArray(item.components) || !Array.isArray(item.removedComponents) || item.nbt != null)
      throw Error('VANILLA_ITEM_COMPONENTS_NOT_OBSERVED');
    const patch = new Map();
    if (item.components.length + item.removedComponents.length > 128) throw Error('VANILLA_COMPONENT_PATCH_TOO_LARGE');
    for (const component of item.components) {
      const key = componentName(component?.type);
      if (!key || patch.has(key)) throw Error('VANILLA_COMPONENT_PATCH_INVALID');
      patch.set(key, componentValue(component.type, component.data));
    }
    for (const component of item.removedComponents) {
      const key = componentName(component);
      if (!key || patch.has(key) || patch.has('!' + key)) throw Error('VANILLA_COMPONENT_PATCH_INVALID');
      patch.set('!' + key, '{}');
    }
    const components = [...patch].map(([key, value]) => quote(key) + ':' + value).join(',');
    const snbt = `{id:${quote(name)},count:${item.count}${components ? ',components:{' + components + '}' : ''}}`;
    const descriptionId = (registry?.blocksByName?.[item.name] ? 'block.' : 'item.') + 'minecraft.' + item.name;
    return { item: { ...base, snbt, descriptionId,
      ...(typeof item.displayName === 'string' ? { displayName: item.displayName } : {}) }, reason: null };
  } catch (error) { return { item: base, reason: error.message }; }
}
