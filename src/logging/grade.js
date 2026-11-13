import { LEVELS } from './rules.js'

// Grades one answer to a Logging Lab exercise.
// Returns { correct, notes: [{ ok, text }] }. For a write exercise every rule becomes one note, so the learner sees
// what is already right as well as what to change.
export function grade(exercise, answer) {
  if (exercise.kind === 'level') {
    const correct = exercise.answer.includes(answer)
    return { correct, notes: [{ ok: correct, text: correct ? `${answer} is right.` : `Not ${answer}. Best: ${exercise.answer.join(' or ')}.` }] }
  }
  if (exercise.kind === 'choice') {
    const correct = answer === exercise.answer
    return { correct, notes: [{ ok: correct, text: correct ? 'That is the best one.' : 'Not the best one. See the marked answer.' }] }
  }
  if (exercise.kind === 'multi') {
    const picked = new Set(answer ?? [])
    const right = new Set(exercise.answers)
    const missed = exercise.answers.filter((i) => !picked.has(i)).length
    const wrong = [...picked].filter((i) => !right.has(i)).length
    const correct = !missed && !wrong
    const notes = []
    if (correct) notes.push({ ok: true, text: 'You found all of them.' })
    if (missed) notes.push({ ok: false, text: `You missed ${missed}.` })
    if (wrong) notes.push({ ok: false, text: `${wrong} of your picks ${wrong === 1 ? 'is' : 'are'} not a problem here.` })
    return { correct, notes }
  }
  return gradeWrite(exercise, answer ?? {})
}

export function gradeWrite(exercise, { level = '', message = '' }) {
  const text = message.trim()
  const notes = []
  if (!text) return { correct: false, notes: [{ ok: false, text: 'Write a message first.' }] }

  const levelOk = exercise.level.includes(level)
  notes.push({
    ok: levelOk,
    text: levelOk ? `Level ${level} fits.` : LEVELS.includes(level) ? `Level ${level} does not fit. Think about who acts on this line.` : 'Pick a level.',
  })

  // a Mule expression must be closed, or the app does not start
  if (text.startsWith('#[') && !text.endsWith(']')) notes.push({ ok: false, text: 'The expression starts with #[ but does not end with ].' })
  const quotes = (text.match(/(?<!\\)"/g) ?? []).length
  if (quotes % 2) notes.push({ ok: false, text: 'A double quote is not closed.' })

  for (const rule of exercise.checks) {
    const ok = rule.must ? rule.must.test(text) : !rule.not.test(text)
    notes.push({ ok, text: ok ? passText(rule) : rule.say })
  }
  return { correct: notes.every((n) => n.ok), notes }
}

// A short "well done" for a rule that passed, taken from its advice.
function passText(rule) {
  const s = rule.say
  if (/correlation/i.test(s)) return 'Has the correlation ID.'
  if (/payload/i.test(s) && rule.not) return 'Does not dump the payload.'
  if (/password|card/i.test(s)) return 'No secrets or card data.'
  if (/personal/i.test(s)) return 'No personal data.'
  if (/exactly what happened/i.test(s)) return 'No vague words.'
  if (/^Start with what happened/.test(s)) return 'Says what happened.'
  if (/^Label/.test(s)) return 'The value is labelled.'
  return s.replace(/^(Add|Start the expression with|Say)\s+/i, 'Has ').replace(/\.$/, '.')
}
