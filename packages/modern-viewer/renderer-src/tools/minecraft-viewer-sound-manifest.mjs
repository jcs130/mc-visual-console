/** Pure expansion of vanilla sounds.json; audio bytes remain launcher-owned. */
const sha1Pattern = /^[a-f0-9]{40}$/;
const eventPattern = /^[a-z0-9_.-]+$/;
const filePattern = /^[a-z0-9_/-]+$/;
const vanillaName = value => typeof value === 'string' ? value.replace(/^minecraft:/, '') : '';

function positive(value, fallback, label) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw Error(`Invalid sound ${label}`);
  return value;
}

export function expandMinecraftSounds(source, index) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error('Invalid sounds.json');
  const events = Object.create(null);
  const files = Object.create(null);
  const eventMetadata = Object.create(null);
  const visiting = new Set();
  function expand(rawKey) {
    const key = vanillaName(rawKey);
    if (!eventPattern.test(key) || !Object.hasOwn(source, key)) throw Error(`Unknown sound event: ${key}`);
    if (Object.hasOwn(events, key)) return events[key];
    if (visiting.has(key)) throw Error(`Cyclic sound event: ${key}`);
    visiting.add(key);
    const definition = source[key];
    if (!definition || !Array.isArray(definition.sounds)) throw Error(`Missing sound variants: ${key}`);
    const variants = [];
    for (const value of definition.sounds) {
      const entry = typeof value === 'string' ? { name: value } : value;
      if (!entry || typeof entry !== 'object') throw Error(`Invalid sound variant: ${key}`);
      const name = vanillaName(entry.name);
      const volume = positive(entry.volume, 1, 'volume');
      const pitch = positive(entry.pitch, 1, 'pitch');
      const weight = positive(entry.weight, 1, 'weight');
      if (entry.type === 'event') {
        for (const child of expand(name)) variants.push({ ...child,
          volume: child.volume * volume, pitch: child.pitch * pitch, weight: child.weight * weight,
          stream: child.stream || entry.stream === true,
        });
      } else {
        if (entry.type !== undefined && entry.type !== 'file') throw Error(`Unknown sound type: ${key}`);
        if (!filePattern.test(name) || name.includes('//')) throw Error(`Invalid sound path: ${name}`);
        const file = `${name}.ogg`;
        const hash = index?.[`minecraft/sounds/${file}`]?.hash;
        if (!sha1Pattern.test(hash ?? '')) throw Error(`1.20.6 resource missing: ${file}`);
        files[file] = hash;
        variants.push({ file, volume, pitch, weight, stream: entry.stream === true,
          preload: entry.preload === true,
          attenuationDistance: positive(entry.attenuation_distance, 16, 'attenuation_distance'),
        });
      }
    }
    if (typeof definition.subtitle === 'string') eventMetadata[key] = { subtitle: definition.subtitle };
    events[key] = variants;
    visiting.delete(key);
    return variants;
  }
  for (const key of Object.keys(source)) expand(key);
  return { events, files, eventMetadata };
}
