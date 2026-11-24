// Server HUD text arrives already flattened to a plain string, so the
// resource-pack font that gave its private glyphs a picture is gone.
// Strip what cannot be drawn without that pack instead of letting the browser
// show tofu boxes or unrelated Hangul syllables:
//  - § legacy colour/format codes (including §x§r§r§g§g§b§b hex colours);
//  - shift / negative-space characters U+F800–U+F8FF: negative runs vanish,
//    a positive shift becomes a segment separator;
//  - other private-use glyphs (U+E000–U+F8FF, planes 15–16);
//  - in strings built with shift characters, Hangul syllables/jamo are custom
//    font image slots (backgrounds, icons) and are removed too. Hangul in a
//    string without shift characters is kept as real text.
const CORTI_HUD_POSITIVE_SHIFT_MIN = 0xf820;
function cortiHudCodepointClass(cp) {
  if (cp >= 0xf800 && cp <= 0xf8ff) return cp >= CORTI_HUD_POSITIVE_SHIFT_MIN ? 'shift+' : 'shift-';
  if ((cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000) return 'private';
  if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f)) return 'hangul';
  if (cp === 0x200b || cp === 0x2060 || cp === 0xfeff || cp === 0xfffd) return 'invisible';
  if (cp === 0x0a) return 'newline';
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 'control';
  return 'text';
}
function cortiHudTextInfo(raw, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 160;
  const keepNewlines = options.keepNewlines === true;
  let source = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
  if (source.length > 4000) source = source.slice(0, 4000);
  const legacy = source.match(/§(?:x(?:§[0-9a-f]){6}|[0-9a-fk-or])/gi)?.length ?? 0;
  source = source.replace(/§x(?:§[0-9a-f]){6}/gi, '').replace(/§[0-9a-fk-or]?/gi, '');
  const composite = /[\uF800-\uF8FF]/.test(source);
  const info = { text: '', privateGlyphs: 0, shifts: 0, legacyCodes: legacy, composite };
  const segments = [''];
  for (const ch of source) {
    const kind = cortiHudCodepointClass(ch.codePointAt(0));
    if (kind === 'shift-' || kind === 'shift+') {
      info.shifts++;
      if (kind === 'shift+' && segments[segments.length - 1].trim()) segments.push('');
      continue;
    }
    if (kind === 'private' || (kind === 'hangul' && composite)) { info.privateGlyphs++; continue; }
    if (kind === 'invisible' || kind === 'control') continue;
    if (kind === 'newline') { segments[segments.length - 1] += keepNewlines ? '\n' : ' '; continue; }
    segments[segments.length - 1] += ch;
  }
  const clean = segments.map(part => part.replace(keepNewlines ? /[^\S\n]+/g : /\s+/g, ' ').trim()).filter(Boolean);
  let text = clean.join(' · ');
  if ([...text].length > limit) text = `${[...text].slice(0, Math.max(0, limit - 1)).join('')}…`;
  info.text = text;
  return info;
}
function cortiHudText(raw, options) { return cortiHudTextInfo(raw, options).text; }
globalThis.cortiHudText = cortiHudText;
globalThis.cortiHudTextInfo = cortiHudTextInfo;
