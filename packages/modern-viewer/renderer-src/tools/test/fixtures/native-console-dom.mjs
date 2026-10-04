// Small DOM fixture deliberately models actual text/children/event lifetime;
// tests assert rendering and cancellation, rather than only source strings.
export class Element {
  constructor (tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []
    this.dataset = {}; this.style = {}; this.attributes = {}; this.listeners = new Map()
    this.className = ''; this.hidden = false; this._text = ''; this.parentNode = null
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' ') },
      remove: (...names) => { this.className = this.className.split(' ').filter(x => !names.includes(x)).join(' ') },
      toggle: (name, value) => value ? this.classList.add(name) : this.classList.remove(name)
    }
  }
  set textContent (value) { this.replaceChildren(); this._text = String(value) }
  get textContent () { return this._text + this.children.map(child => child.textContent).join('') }
  get firstElementChild () { return this.children[0] }
  get lastElementChild () { return this.children.at(-1) }
  get isConnected () { return this === this.ownerDocument.body || this === this.ownerDocument.head || Boolean(this.parentNode?.isConnected) }
  append (...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child) } }
  prepend (child) { child.remove(); child.parentNode = this; this.children.unshift(child) }
  remove () { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null }
  replaceChildren (...children) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; this.append(...children) }
  setAttribute (key, value) {
    this.attributes[key] = String(value)
    if (key === 'id') this.id = value
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value)
  }
  getAttribute (key) { return this.attributes[key] ?? null }
  removeAttribute (key) { delete this.attributes[key] }
  matches (selector) {
    const attr = selector.match(/^(\w+)?\[([^\]]+)\]$/)
    if (attr) return (!attr[1] || this.tagName === attr[1].toUpperCase()) &&
      (attr[2].startsWith('data-') ? Object.hasOwn(this.dataset, attr[2].slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())) : Object.hasOwn(this.attributes, attr[2]))
    if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1))
    if (selector.startsWith('#')) return this.id === selector.slice(1)
    return this.tagName === selector.toUpperCase()
  }
  querySelectorAll (selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]) }
  querySelector (selector) { return this.querySelectorAll(selector)[0] ?? null }
  addEventListener (name, callback) { const rows = this.listeners.get(name) ?? []; rows.push(callback); this.listeners.set(name, rows) }
  removeEventListener (name, callback) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter(x => x !== callback)) }
  dispatch (name, event = {}) { for (const callback of this.listeners.get(name) ?? []) callback(event) }
}
export class Document extends Element {
  constructor () { super('document', null); this.ownerDocument = this; this.body = new Element('body', this); this.head = new Element('head', this); this.append(this.head, this.body); this.hidden = false }
  createElement (tag) { return new Element(tag, this) }
  getElementById (id) { return this.querySelector('#' + id) }
}
export function shell () {
  const document = new Document()
  const add = (parent, tag, { id, data, className } = {}) => {
    const element = document.createElement(tag); if (id) element.id = id
    if (data) element.setAttribute(`data-${data}`, ''); if (className) element.className = className
    parent.append(element); return element
  }
  const root = add(document.body, 'div', { id: 'corti-survival' })
  for (const data of ['corti-hearts','corti-food','corti-armor','corti-air','corti-level','corti-xp','corti-slots','corti-offhand','corti-selection','corti-mana-label','corti-mana-fill']) add(root, 'div', { data })
  const menu = add(document.body, 'section', { id: 'corti-menu' }); menu.hidden = true
  for (const data of ['menu-title','menu-source','menu-close','menu-body']) add(menu, data === 'menu-close' ? 'button' : 'div', { data })
  add(document.body, 'button', { id: 'corti-inventory-toggle' })
  const skills = add(document.body, 'aside', { id: 'corti-skills' })
  for (const data of ['mana','mana-fill','skill-list','ability-list','skill-status']) add(skills, 'div', { data })
  add(document.body, 'div', { id: 'corti-event-feed' })
  const title = add(document.body, 'div', { id: 'corti-game-title' }); title.hidden = true
  add(title, 'strong', { data: 'game-title' }); add(title, 'span', { data: 'game-subtitle' })
  const actionbar = add(document.body, 'div', { id: 'corti-actionbar' }); actionbar.hidden = true
  add(document.body, 'section', { id: 'viewer-fishing-catch' })
  return document
}
