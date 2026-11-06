import { COMPONENTS } from './catalog.js'
import { walk } from './model.js'

// Compares a design with the model answer, for reading only. It is never scored, because a design can differ
// from the model answer and still be right. Names, paths and scripts are skipped, since those differ in every
// good answer: only the choices a user picks (selects and numbers) are compared.
const MAX_SETTINGS = 12

function byType(design) {
  const out = new Map()
  walk(design, (item, ctx) => {
    if (ctx.isFlow || ctx.isRoute) return
    if (!out.has(item.type)) out.set(item.type, [])
    out.get(item.type).push(item)
  })
  return out
}

const label = (type) => COMPONENTS[type]?.label ?? type
const shown = (value) => (value === undefined || value === '' ? 'not set' : String(value))

export function compareDesigns(yours, model) {
  const mine = byType(yours)
  const theirs = byType(model)
  const missing = []
  const extra = []
  const settings = []

  for (const [type, list] of theirs) {
    const have = mine.get(type)?.length ?? 0
    if (have < list.length) missing.push({ label: label(type), yours: have, model: list.length })
  }
  for (const [type, list] of mine) {
    const want = theirs.get(type)?.length ?? 0
    if (list.length > want) extra.push({ label: label(type), yours: list.length, model: want })
  }

  // The same kind of component is paired up in design order.
  for (const [type, list] of theirs) {
    const fields = (COMPONENTS[type]?.fields ?? []).filter((f) => f.type === 'select' || f.type === 'number')
    list.forEach((node, i) => {
      const other = mine.get(type)?.[i]
      if (!other) return
      for (const f of fields) {
        if (String(other.config[f.key] ?? '') === String(node.config[f.key] ?? '')) continue
        settings.push({ label: label(type), field: f.label, yours: shown(other.config[f.key]), model: shown(node.config[f.key]) })
      }
    })
  }

  return { missing, extra, settings: settings.slice(0, MAX_SETTINGS), moreSettings: Math.max(settings.length - MAX_SETTINGS, 0) }
}
