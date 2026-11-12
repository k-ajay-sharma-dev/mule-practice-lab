// Checks the Logging Lab (src/logging): every exercise is well formed, every model answer passes its own rules,
// typical bad messages fail them, the sidebar count is right, and the wording follows the site's style.
import { LOGGING_TOTAL } from '../src/logging/count.js'
import { EXERCISES, GUIDE, KINDS, LEVELS } from '../src/logging/exercises.js'
import { grade } from '../src/logging/grade.js'

const failures = []
const fail = (msg) => failures.push(msg)

if (EXERCISES.length !== LOGGING_TOTAL) fail(`src/logging/count.js says ${LOGGING_TOTAL}, but there are ${EXERCISES.length} exercises`)
const ids = EXERCISES.map((e) => e.id)
if (new Set(ids).size !== ids.length) fail('two exercises share an id')
const situations = new Map()
for (const e of EXERCISES) {
  const key = `${e.kind} ${e.situation} ${e.code ?? ''}`.toLowerCase().replace(/\W+/g, ' ').trim()
  if (situations.has(key)) fail(`${e.id}: same situation as ${situations.get(key)}`)
  situations.set(key, e.id)
}

// words and marks the site's writing avoids
const STYLE = [
  [/ — | – |—/, 'a dash used as punctuation'],
  [/\b(simply|just|easy|easily)\b/i, 'simply, just or easy'],
]
const texts = (e) => [e.situation, e.explain, e.code, ...(e.options ?? [])].filter(Boolean)
for (const [re, what] of STYLE) {
  if (re.test(GUIDE)) fail(`guide: ${what}`)
  for (const e of EXERCISES) if (texts(e).some((t) => re.test(t))) fail(`${e.id}: ${what}`)
}

const BAD = [
  '#[payload]',
  'Error occurred',
  '#["Done"]',
  '#["Order received " ++ write(payload)]',
  '#["Login for $(payload.username) password=$(payload.password)"]',
]

for (const e of EXERCISES) {
  if (!KINDS[e.kind]) fail(`${e.id}: unknown kind ${e.kind}`)
  if (!e.situation || !e.explain) fail(`${e.id}: needs a situation and an explanation`)
  if (e.kind === 'level') {
    if (!e.answer?.length || e.answer.some((l) => !LEVELS.includes(l))) fail(`${e.id}: answer must be levels from ${LEVELS}`)
    if (!grade(e, e.answer[0]).correct) fail(`${e.id}: its own answer is graded wrong`)
  }
  if (e.kind === 'choice') {
    if (!(e.answer >= 0 && e.answer < e.options.length)) fail(`${e.id}: answer is not one of the options`)
    if (!grade(e, e.answer).correct) fail(`${e.id}: its own answer is graded wrong`)
  }
  if (e.kind === 'multi') {
    if (!e.answers?.length || e.answers.some((i) => !(i >= 0 && i < e.options.length))) fail(`${e.id}: answers are not options`)
    if (e.answers.length === e.options.length) fail(`${e.id}: every option applies, so there is nothing to tell apart`)
    if (!grade(e, e.answers).correct) fail(`${e.id}: its own answers are graded wrong`)
  }
  if (e.kind === 'write') {
    if (!e.level?.length || !e.checks?.length || !e.model || !e.available?.length) fail(`${e.id}: needs level, checks, model and available`)
    const r = grade(e, e.model)
    if (!r.correct) fail(`${e.id}: the model answer fails: ${r.notes.filter((n) => !n.ok).map((n) => n.text).join(' | ')}`)
    if (!e.level.includes(e.model.level)) fail(`${e.id}: the model level is not an accepted level`)
    for (const bad of BAD) if (grade(e, { level: e.model.level, message: bad }).correct) fail(`${e.id}: the bad message ${bad} passes`)
    const wrongLevel = LEVELS.find((l) => !e.level.includes(l))
    if (grade(e, { level: wrongLevel, message: e.model.message }).correct) fail(`${e.id}: the model passes with the wrong level ${wrongLevel}`)
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`All ${EXERCISES.length} Logging Lab exercises check out.`)
