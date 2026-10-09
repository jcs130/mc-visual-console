import { parseNativeItemStack } from './native-item-stack.js'

// Viewer-only translations for keys absent from the locked Domum JAR. Original
// zh_cn assets take precedence. IDs, component patches and Agent receipts are
// never rewritten by this presentation layer.
export const VIEWER_ZH_CN = Object.freeze({
  'domum_ornamentum.architectscutter': '建筑切割台',
  'block.domum_ornamentum.architectscutter': '建筑切割台',
  'cuttergroup.domum_ornamentum.avanilla': '原版建筑',
  'cuttergroup.domum_ornamentum.btimberframe': '木框架',
  'cuttergroup.domum_ornamentum.cshingle': '屋瓦',
  'cuttergroup.domum_ornamentum.ddoor': '门',
  'cuttergroup.domum_ornamentum.etrapdoor': '活板门',
  'cuttergroup.domum_ornamentum.fpanel': '装饰面板',
  'cuttergroup.domum_ornamentum.gpillar': '柱子',
  'cuttergroup.domum_ornamentum.hpaperwall': '框架隔板',
  'cuttergroup.domum_ornamentum.ilight': '灯饰',
  'cuttergroup.domum_ornamentum.jbrick': '砖饰',
  'cuttergroup.domum_ornamentum.kpost': '立柱',
  'domum_ornamentum.panel.name.format': '%s面板',
  'domum_ornamentum.fence.name.format': '%s栅栏',
  'domum_ornamentum.fence-gate.name.format': '%s栅栏门',
  'domum_ornamentum.door.name.format': '%s门',
  'domum_ornamentum.trapdoor.name.format': '%s活板门',
  'domum_ornamentum.fancydoor.name.format': '%s花纹门',
  'domum_ornamentum.fancytrapdoor.name.format': '%s花纹活板门',
  'domum_ornamentum.timber.frame.name.format': '%s木框架',
  'domum_ornamentum.blockpaperwall.name.format': '%s框架隔板',
  'domum_ornamentum.light.frame.name.format': '%s框架灯',
  'domum_ornamentum.light_brick.name.format': '%s浅色砖',
  'domum_ornamentum.dark_brick.name.format': '%s深色砖',
  'domum_ornamentum.blockpillar.name.format': '%s圆柱',
  'domum_ornamentum.blockypillar.name.format': '%s方块柱',
  'domum_ornamentum.blocktiledpaperwall.name.format': '%s瓷砖隔板',
  'domum_ornamentum.squarepillar.name.format': '%s方柱',
  'domum_ornamentum.post.name.format': '%s立柱',
  'domum_ornamentum.slab.name.format': '%s台阶',
  'domum_ornamentum.stair.name.format': '%s楼梯',
  'domum_ornamentum.wall.name.format': '%s围墙',
  'domum_ornamentum.shingle.name.format.block.domum_ornamentum.shingle': '%s屋瓦',
  'domum_ornamentum.shingle.name.format.block.domum_ornamentum.shingle_flat': '%s平屋瓦',
  'domum_ornamentum.shingle.name.format.block.domum_ornamentum.shingle_flat_lower': '%s下层平屋瓦',
  'domum_ornamentum.shingle.name.format.block.domum_ornamentum.shingle_steep': '%s陡屋瓦',
  'domum_ornamentum.shingle.name.format.block.domum_ornamentum.shingle_steep_lower': '%s下层陡屋瓦'
})
const MENU_NAMES = Object.freeze({
  'minecraft:inventory': '物品栏', 'minecraft:crafting': '工作台', 'minecraft:furnace': '熔炉',
  'minecraft:blast_furnace': '高炉', 'minecraft:smoker': '烟熏炉', 'minecraft:hopper': '漏斗',
  'minecraft:anvil': '铁砧', 'minecraft:enchantment': '附魔台', 'minecraft:brewing_stand': '酿造台',
  'minecraft:merchant': '交易', 'minecraft:stonecutter': '切石机', 'minecraft:cartography_table': '制图台',
  'minecraft:smithing': '锻造台', 'minecraft:grindstone': '砂轮', 'minecraft:loom': '织布机',
  'farmersdelight:cooking_pot': '农夫乐事 · 烹饪锅', 'curios:curios_container': '饰品栏',
  'domum_ornamentum:architectscutter': '建筑切割台', 'domum_ornamentum:architects_cutter': '建筑切割台'
})
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const safeText = value => typeof value === 'string' ? value.slice(0, 1024) : null

export class NativeLanguage {
  constructor(reader = null) { this.reader = reader; this.words = new Map(Object.entries(VIEWER_ZH_CN)); this.errors = [] }
  async prepare() {
    if (!this.reader) return this
    if (!this.reader.manifest?.assets) { this.errors.push({ reason: 'NATIVE_LANGUAGE_MANIFEST_UNAVAILABLE' }); return this }
    const paths = Object.keys(this.reader.manifest.assets).filter(path => /^assets\/[a-z0-9_.-]+\/lang\/(?:en_us|zh_cn)\.json$/.test(path)).sort()
    if (paths.length > 256) throw Error('NATIVE_LANGUAGE_FILE_LIMIT')
    const dictionaries = await Promise.all(paths.map(async path => {
      try {
        if (this.reader.manifest.assets[path].bytes > 2097152) throw Error('NATIVE_LANGUAGE_SIZE_LIMIT')
        const value = await this.reader.json(path)
        if (!record(value) || Object.keys(value).length > 32768 || Object.values(value).some(text => typeof text !== 'string' || text.length > 32768)) throw Error('NATIVE_LANGUAGE_DICTIONARY_INVALID')
        return [path, value]
      } catch (error) { this.errors.push({ path, reason: error.message }); return null }
    }))
    // Language entries share a global key space. Conflicting values in the
    // same locale require actual pack-order evidence, not namespace sorting.
    const locale = suffix => {
      const words = new Map(), conflicts = new Set()
      for (const entry of dictionaries) if (entry?.[0].endsWith(suffix)) for (const [key, value] of Object.entries(entry[1])) {
        if (words.has(key) && words.get(key) !== value) conflicts.add(key)
        words.set(key, value)
      }
      for (const key of conflicts) { words.delete(key); this.errors.push({ key, reason: 'NATIVE_LANGUAGE_KEY_PRIORITY_UNRESOLVED' }) }
      return words
    }
    this.words = new Map([...locale('/en_us.json'), ...Object.entries(VIEWER_ZH_CN), ...locale('/zh_cn.json')])
    return this
  }
  translate(key, args = [], fallback = null) {
    const format = this.words.get(key) ?? fallback
    if (typeof format !== 'string') return null
    let next = 0, valid = true
    const result = format.replace(/%(?:(\d+)\$)?([A-Za-z%])/g, (whole, index, type) => {
      if (type === '%' && index === undefined) return '%'
      const arg = args[index === undefined ? next++ : Number(index) - 1]
      if (type !== 's' || typeof arg !== 'string') { valid = false; return whole }
      return arg
    })
    return valid ? result.slice(0, 1024) : null
  }
  component(input) {
    let nodes = 0
    const visit = (part, depth = 0) => {
      if (++nodes > 128 || depth > 16) throw Error('NATIVE_LANGUAGE_COMPONENT_LIMIT')
      if (typeof part === 'string' || typeof part === 'number' || typeof part === 'boolean') return String(part)
      if (Array.isArray(part)) return part.map(value => visit(value, depth + 1)).join('').slice(0, 1024)
      if (!record(part)) throw Error('NATIVE_LANGUAGE_COMPONENT_INVALID')
      let value
      if (typeof part.text === 'string') value = part.text
      else if (typeof part.translate === 'string') {
        if (part.with !== undefined && !Array.isArray(part.with)) throw Error('NATIVE_LANGUAGE_ARGUMENTS_INVALID')
        value = this.translate(part.translate, (part.with ?? []).map(arg => visit(arg, depth + 1)), part.fallback)
        if (value === null) throw Error('NATIVE_LANGUAGE_TRANSLATION_UNAVAILABLE')
      } else throw Error('NATIVE_LANGUAGE_CONTENT_UNSUPPORTED')
      if (part.extra !== undefined && !Array.isArray(part.extra)) throw Error('NATIVE_LANGUAGE_EXTRA_INVALID')
      return (value + (part.extra ?? []).map(arg => visit(arg, depth + 1)).join('')).slice(0, 1024)
    }
    try { return visit(input) } catch { return null }
  }
  item(item) {
    if (!item) return ''
    const original = safeText(item.displayName) || item.name
    let stack
    try { stack = parseNativeItemStack(item) } catch { return this.component(item.displayNameComponent) || original }
    for (const key of ['minecraft:custom_name', 'minecraft:item_name']) if (Object.hasOwn(stack.components, key)) {
      // A custom literal name is authoritative, even when it is English.
      if (Object.hasOwn(item, 'displayNameComponent')) return this.component(item.displayNameComponent) || original
      const component = stack.components[key]
      try { return this.component(typeof component === 'string' ? JSON.parse(component) : component) || original } catch { return original }
    }
    if (Object.hasOwn(item, 'displayNameComponent')) return this.component(item.displayNameComponent) || original
    // Legacy snapshots omit the original Component. This locked book.json
    // identifies the exact Book.name translation key; custom names above still
    // take precedence. Current bridge snapshots use the Component directly.
    // Locked book.json SHA256 5c4cfc7e53f7db353232a315e9f1328dfddc3dcfa3274be8ea3f6a5d81a7f970.
    if (stack.id === 'patchouli:guide_book' && stack.components['patchouli:book'] === 'touhou_little_maid:memorizable_gensokyo' &&
      this.reader?.manifest.sources?.some(source => source.name === 'touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar' &&
        source.sha256 === 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27' && !source.explicitOverride)) {
      return this.translate('patchouli.touhou_little_maid.book.name') || this.component(item.displayNameComponent) || original
    }
    return this.translate(item.descriptionId) || original
  }
  menu(menu) {
    const native = menu.titleComponent && this.component(menu.titleComponent)
    if (native) return native
    if (menu.title) return safeText(menu.title)
    if (menu.domum?.source === 'same_player_native_architects_cutter') return '建筑切割台'
    if (MENU_NAMES[menu.menuType]) return MENU_NAMES[menu.menuType]
    if (/^minecraft:generic_9x[1-6]$/.test(menu.menuType)) return menu.menuType.endsWith('6') ? '大型箱子' : '箱子'
    return menu.menuType || '本人原生菜单'
  }
}
