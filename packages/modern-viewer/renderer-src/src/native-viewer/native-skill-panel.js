import { nativeRpgSummary } from './native-rpg-state.js'
const bounded = value => typeof value === 'string' ? value.slice(0, 128) : ''
const rows = value => (Array.isArray(value) ? value : []).filter(row => typeof row?.name === 'string').slice(0, 64)
const add = (document, parent, tag, text, attribute) => {
  const element = document.createElement(tag)
  if (text) element.textContent = text
  if (attribute) element.setAttribute(attribute, '')
  parent.append(element); return element
}

// Observed names only; do not guess active/passive classes from server IDs.
// Stable details elements preserve the user's expansion across live readings.
export function renderNativeSkillLists (document, skills) {
  const panel = document.getElementById('corti-skills'), list = panel?.querySelector('[data-skill-list]'), abilities = panel?.querySelector('[data-ability-list]')
  if (!panel || !list || !abilities) return
  let rpg = panel.querySelector('[data-rpg-summary]')
  if (!rpg) rpg = add(document, panel, 'div', '', 'data-rpg-summary')
  rpg.textContent = nativeRpgSummary(skills); rpg.hidden = !rpg.textContent
  let detail = panel.querySelector('[data-skill-details]')
  if (!detail) {
    add(document, panel, 'div', '', 'data-skill-preview')
    detail = add(document, panel, 'details', '', 'data-skill-details')
    add(document, detail, 'summary', '', 'data-ability-summary'); detail.append(abilities)
    const levels = add(document, panel, 'details', '', 'data-skill-levels')
    add(document, levels, 'summary', '', 'data-level-summary'); levels.append(list)
    const status = panel.querySelector('[data-skill-status]'); if (status) panel.append(status)
  }
  const levels = rows(skills?.skills), all = rows(skills?.abilities), preview = panel.querySelector('[data-skill-preview]')
  abilities.replaceChildren(); list.replaceChildren(); preview.replaceChildren()
  const cooldown = row => Number.isFinite(row.cooldownRemainingMs) ? row.cooldownRemainingMs > 0 ? `冷却 ${(row.cooldownRemainingMs / 1000).toFixed(1)}秒` : '冷却 0秒' : '冷却未同步'
  const title = row => `${bounded(row.id)} · ${Number.isFinite(row.manaCost) ? `${row.manaCost}魔力` : '消耗未同步'} · ${cooldown(row)}`
  for (const row of all.slice(0, 4)) {
    const chip = add(document, preview, 'span', bounded(row.name)); chip.title = title(row)
  }
  preview.hidden = all.length === 0
  panel.querySelector('[data-ability-summary]').textContent = `全部能力（${all.length}）`
  panel.querySelector('[data-level-summary]').textContent = `技能等级（${levels.length}）`
  detail.hidden = !all.length; panel.querySelector('[data-skill-levels]').hidden = !levels.length
  for (const skill of levels) add(document, list, 'div', `${bounded(skill.name)}${Number.isFinite(skill.level) ? ` Lv.${skill.level}` : ''}`).className = 'corti-skill'
  for (const ability of all) {
    const row = add(document, abilities, 'div', bounded(ability.name)); row.className = 'corti-skill'; row.title = title(ability)
    add(document, row, 'small', cooldown(ability))
  }
}
