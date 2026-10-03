/** Optional skill ID presentation mappings for 千灯纪; no execution or game rules. */
function mcViewerQiandengjiSpellVisual(spellId) {
  const id = String(spellId || '').split(':').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (id === 'frostnova') return { motion: 'nova', palette: 'frost', reach: 6, duration: 1500 };
  if (id === 'flamewave') return { motion: 'wave', palette: 'flame', reach: 4.4, duration: 1200 };
  if (id === 'starbolt') return { motion: 'bolt', palette: 'star', reach: 5.5, duration: 950 };
  if (id === 'starlight') return { motion: 'shower', palette: 'star', reach: 2, duration: 1500 };
  if (id === 'golem') return { motion: 'summon', palette: 'earth', reach: 1.5, duration: 1800 };
  if (id === 'give') return { motion: 'summon', palette: 'arcane', reach: 1.2, duration: 1300 };
  if (id.startsWith('conjure')) return { motion: 'summon', palette: 'arcane', reach: 1.2, duration: 1300 };
  if (id === 'selfheal' || id === 'heal' || id === 'food') return { motion: 'heal', palette: 'life', reach: 1, duration: 1450 };
  if (id === 'home' || id === 'blink') return { motion: 'portal', palette: 'arcane', reach: 1.5, duration: 1700 };
  if (id === 'prospect' || id === 'sense') return { motion: 'scan', palette: 'earth', reach: 5, duration: 1600 };
  if (id === 'leap' || id === 'flight' || id === 'feather') return { motion: 'lift', palette: 'wind', reach: 1.4, duration: 1300 };
  if (id === 'night') return { motion: 'lift', palette: 'frost', reach: 1.6, duration: 1400 };
  if (id === 'bloodmana') return { motion: 'heal', palette: 'blood', reach: 1, duration: 1300 };
  if (id === 'fireworks') return { motion: 'burst', palette: 'flame', reach: 3, duration: 1400 };
  return null;
}
globalThis.mcViewerSpellVisualPreset = mcViewerQiandengjiSpellVisual;
