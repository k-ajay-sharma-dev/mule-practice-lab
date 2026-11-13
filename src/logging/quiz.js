import { EXERCISES } from './exercises.js'

// Turns Logging Lab exercises into the questions of a problem (src/content/logging), so each logging problem is a
// scenario with several questions, run by the same quiz as the other sections:
//   level   → { type: 'level', answer: [accepted levels] }
//   choice  → { type: 'single', code: true }  (the options are log lines)
//   multi   → { type: 'multi' }
//   write   → { type: 'logger', available, level, checks, model }  (checked by src/logging/grade.js)
const byId = new Map(EXERCISES.map((e) => [e.id, e]))

const promptOf = (e) => (e.code ? `${e.situation}\n\n\`\`\`\n${e.code}\n\`\`\`` : e.situation)

export function fromLogging(ids) {
  return ids.map((id) => {
    const e = byId.get(id)
    if (!e) throw new Error(`Logging exercise ${id} does not exist`)
    const base = { exercise: id, prompt: promptOf(e), explain: e.explain }
    if (e.kind === 'level') return { ...base, type: 'level', answer: e.answer }
    if (e.kind === 'choice') return { ...base, type: 'single', code: true, options: e.options, answer: e.answer }
    if (e.kind === 'multi') return { ...base, type: 'multi', options: e.options, answer: e.answers }
    return { ...base, type: 'logger', available: e.available, level: e.level, checks: e.checks, model: e.model }
  })
}
