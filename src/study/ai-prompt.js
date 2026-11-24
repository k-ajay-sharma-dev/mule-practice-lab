// The prompt Copy for AI puts on the clipboard: the question, the learner's work so far, every check and every test
// run, and the kind of help wanted. The model answer, the hints and the key points are never part of it.
import { archChecks, diagramHint, runDiagramChecks } from '../arch/checks.js'
import { LANES, NODE_TYPES } from '../arch/catalog.js'
import { landscapeOf } from '../arch/landscape.js'
import { restoreDiagram } from '../arch/model.js'
import { asList, incidentText, n1, pct, trafficText } from '../arch/run-text.js'
import { configOf, settingsOf } from '../arch/settings.js'
import { runArchTest } from '../arch/tests.js'
import { exerciseOf } from '../data/exercises.js'
import { designChecks, missingHint, runChecks } from '../flow/checks.js'
import { countComponents, restoreDesign } from '../flow/model.js'
import { systemsIn } from '../flow/systems.js'
import { toXml } from '../flow/xml.js'
import { gradeWrite } from '../logging/grade.js'
import { LEVELS } from '../logging/rules.js'
import { fitsQuestion, grade, initialResponse, isAnswered, permutation } from '../quiz/quiz.js'
import { parseRaml, ramlChecks, ramlHint, runRamlChecks } from '../raml/checks.js'
import { jsonDifferences, mimeToLanguage } from '../runner/grade.js'
import { effectRows, json, triggerBody, triggerText } from '../sim/run-text.js'
import { runClues, runTest } from '../sim/tests.js'
import { PLANS } from './plan-questions.js'

const CHECKED = new Set(['code', 'flow', 'raml', 'diagram'])
const QUIZZES = new Set(['quiz', 'investigation'])

// What the learner can ask for: { key, label, about, only?, ask }
const KINDS = [
  {
    key: 'hint',
    label: 'Give me a hint',
    about: 'The next step, without the answer',
    ask: 'Give me one hint for my next step. Start from the work I have done so far. Do not write the solution and do not complete my work for me. If I am stuck on an idea, explain that idea in two or three sentences, then ask me one question that leads me to the next step.',
  },
  {
    key: 'review',
    label: 'Review my work',
    about: 'What is right, wrong and missing',
    ask: 'Review my work so far. Tell me what is right, what is wrong, and what is missing, in order of importance. For each problem, say where it is, why it matters in a real MuleSoft project, and what to think about to correct it. Do not write the full solution. End with two questions an interviewer would ask me about this work.',
  },
  {
    key: 'failing',
    label: 'Explain what fails',
    about: 'Why each failed check or run fails',
    only: CHECKED,
    ask: 'Explain why each failed check and each failed test run fails. Point at the exact part of my work that causes it, and explain the idea behind it. Help me correct one thing at a time, starting with the one the others depend on. Do not write the full solution.',
  },
  {
    key: 'failing',
    label: 'Explain my wrong answers',
    about: 'Why they are wrong, and the idea behind each',
    only: QUIZZES,
    ask: 'Explain the questions I answered wrong: why my choice is wrong, and the idea behind the question. If I have not checked my answers yet, tell me which of my answers to think about again, and why, without telling me the right one.',
  },
  {
    key: 'explain',
    label: 'Explain the question',
    about: 'What it asks, in plain words',
    ask: 'Explain what this question asks, in plain words: what comes in, what must go out, which systems take part, and which words in it are the important ones. Give a small example. Do not solve it, and do not suggest a design or code.',
  },
  {
    key: 'context',
    label: 'Only the question and my work',
    about: 'Type your own request after it',
    ask: null,
  },
]

export const promptKinds = (exercise) => KINDS.filter((k) => !k.only || k.only.has(exercise))

const WORK = {
  code: 'a DataWeave 2.0 script (Mule 4)',
  flow: 'a Mule 4 flow design',
  raml: 'a RAML 1.0 API specification',
  diagram: 'a MuleSoft integration architecture, drawn as boxes and lines',
  quiz: 'a set of quiz questions',
  investigation: 'a production incident to investigate, with log lines and questions',
  written: 'a written answer',
}

// ---------- small helpers ----------

// the work can hold code fences of its own, so the fence around it is always longer
function fence(text, language = '') {
  const inner = String(text ?? '').trimEnd()
  const longest = Math.max(2, ...[...inner.matchAll(/`+/g)].map((m) => m[0].length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${language}\n${inner}\n${ticks}`
}
const part = (name, body) => (body && body.trim() ? `<${name}>\n${body.trim()}\n</${name}>` : '')
const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}\n... (${text.length - max} more characters left out)` : text)
const lines = (list) => list.filter(Boolean).join('\n')
const blocks = (list) => list.filter(Boolean).join('\n\n')
const mark = (ok) => (ok ? 'PASS' : 'FAIL')
const oneLine = (text, max) => {
  const s = String(text).replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}...` : s
}

function planText(plan, kind) {
  const answers = Array.isArray(plan) ? plan : []
  return blocks(PLANS[kind].map((q, i) => (String(answers[i] ?? '').trim() ? `${q}\n${String(answers[i]).trim()}` : '')))
}

function checkList(checks, results, hintFor) {
  const passed = results.filter((r) => r.pass).length
  return lines([
    `${passed} of ${checks.length} pass.`,
    ...checks.map((c, i) => {
      const hint = results[i].pass ? '' : hintFor(c, results[i])
      return `- ${mark(results[i].pass)}: ${c.label}${hint ? `\n  What the check says: ${hint}` : ''}`
    }),
  ])
}

// ---------- one builder for each kind of problem: { question, work, results } ----------

function codeParts(problem, entry, lastRun) {
  const code = typeof entry.code === 'string' ? entry.code : problem.starterCode
  const started = code.trim() !== String(problem.starterCode ?? '').trim()
  const last = lastRun?.code === code ? lastRun : null
  const inputs = problem.inputs.map((i) => `Input ${i.name} (${i.mime}):\n${fence(i.content, mimeToLanguage(i.mime))}`)
  const expected = `Expected output (${problem.expected.mime}):\n${fence(problem.expected.content, mimeToLanguage(problem.expected.mime))}`

  const results = []
  if (last?.run && !last.run.notConfigured) {
    results.push(
      last.run.ok
        ? `My last Run, on the sample input, gave:\n${fence(clip(last.run.output, 6000), mimeToLanguage(problem.expected.mime))}`
        : `My last Run, on the sample input, failed with:\n${fence(clip(last.run.error, 3000))}`,
    )
  }
  if (last?.tests) {
    results.push(lines(['Submit ran these tests:', ...last.tests.map((t) => `- ${mark(t.passed)}: ${t.name}`)]))
    for (const t of last.tests.filter((x) => !x.passed).slice(0, 3)) {
      const differences = t.output == null ? [] : jsonDifferences(t.output, t.expected)
      results.push(
        blocks([
          `Failed test: ${t.name}`,
          // the sample input and output are in the question already
          t.inputs === problem.inputs ? '' : blocks([...t.inputs.map((i) => `Input ${i.name}:\n${fence(clip(i.content, 4000))}`), `Expected:\n${fence(clip(t.expected, 4000))}`]),
          t.error ? `Error:\n${fence(clip(t.error, 3000))}` : `My output:\n${fence(clip(t.output ?? '', 4000))}`,
          differences.length ? `Differences:\n${differences.map((d) => `- ${d}`).join('\n')}` : '',
        ]),
      )
    }
  }
  if (!results.length) results.push('I have not run this version of the script yet.')

  return {
    question: blocks([problem.description, ...inputs, expected]),
    work: started ? fence(code, 'dataweave') : `I have not changed the starter code yet:\n${fence(code, 'dataweave')}`,
    results: [['my_test_runs', blocks(results)]],
  }
}

function flowParts(problem, entry) {
  const design = restoreDesign(entry.flow)
  const started = countComponents(design) > 0
  const groups = new Map()
  for (const s of systemsIn(problem.referenceFlow)) groups.set(s.kind, [...(groups.get(s.kind) ?? []), s.name])
  const systems = [...groups].map(([kind, names]) => `- ${kind}: ${names.join(', ')}`)
  const all = designChecks(problem)
  const checks = all.filter((c) => !c.run)
  return {
    question: blocks([problem.description, systems.length ? `Systems the flow can call:\n${systems.join('\n')}` : '']),
    plan: planText(entry.plan, 'flow'),
    work: started
      ? `I build the flow on a canvas. This XML is generated from it, so connector configurations are left out on purpose.\n${fence(toXml(design), 'xml')}`
      : 'The canvas is still empty.',
    results: [
      ['checks', checks.length ? (started ? checkList(checks, runChecks(design, checks), (c) => missingHint(design, c.rule)) : checksAhead(checks)) : ''],
      ['test_runs', flowRuns(problem, design, started)],
    ],
  }
}

// before there is any work, the checks are what the design has to meet
const checksAhead = (checks) => lines(['My work will be checked against:', ...checks.map((c) => `- ${c.label}`)])

const STEPS_SHOWN = 30
const RUNS_IN_DETAIL = 3

function flowRuns(problem, design, started) {
  const tests = problem.simulation?.tests ?? []
  if (!tests.length) return ''
  const sends = (test) =>
    (test.triggers ?? [test.trigger ?? {}]).map((t) => {
      const body = triggerBody(t)
      return `Sends: ${triggerText(t)}${body === undefined ? '' : `\n${fence(clip(json(body), 1500))}`}`
    })
  if (!started) return blocks(['The flow will be run with these tests:', ...tests.map((t) => lines([`Test: ${t.name}`, t.about]))])
  const outcomes = tests.map((t) => ({ test: t, ...runTest(design, problem.simulation, t) }))
  let detailed = 0
  return blocks([
    `${outcomes.filter((o) => o.pass).length} of ${outcomes.length} test runs pass.`,
    ...outcomes.map(({ test, result, lines: expected, pass }) => {
      const head = `Test: ${test.name}\nResult: ${mark(pass)}`
      const list = expected.map((l) => `- ${mark(l.ok)}: ${l.text}`).join('\n')
      if (pass) return head
      // the first failed runs are shown step by step; the rest with what they expected
      if (detailed++ >= RUNS_IN_DETAIL) return blocks([head, list])
      const clues = runClues(result, expected).map((c) => `Clue: ${c.text}`)
      const res = result.response
      const answer = res
        ? `Answer sent back: ${res.status} ${res.reason ?? ''}${res.note ? ` ${res.note}` : ''}\n${fence(clip(json(res.body), 1500))}`
        : result.error
          ? `The flow ended with an error: ${result.error.type}: ${result.error.description}`
          : ''
      const steps = result.trace.map((e) => `${e.t} ms ${'  '.repeat(Math.min(e.depth ?? 0, 8))}${e.text}${e.error ? `: ${e.error.description}` : ''}`)
      const shown = steps.length > STEPS_SHOWN ? [...steps.slice(0, STEPS_SHOWN - 10), `... (${steps.length - STEPS_SHOWN} steps left out)`, ...steps.slice(-10)] : steps
      const logs = result.logs.slice(-15).map((l) => `${l.t} ms ${l.level} [${l.flow}] ${oneLine(l.message, 300)}`)
      const calls = effectRows(result.effects)
      return blocks([
        head,
        ...sends(test),
        list,
        ...clues,
        result.limit ? `Simulator note: ${result.limit}` : '',
        answer,
        shown.length ? `Steps:\n${fence(shown.join('\n'))}` : '',
        logs.length ? `Log:\n${fence(logs.join('\n'))}` : '',
        calls.length ? `Calls to other systems:\n${calls.map((c) => `- ${c}`).join('\n')}` : '',
      ])
    }),
  ])
}

const boxName = (node) => (node ? node.label || NODE_TYPES[node.type].label : 'a box')

// boxes by layer with their settings, then the lines between them
function diagramText(diagram) {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const layers = LANES.map((lane) => {
    const nodes = diagram.nodes.filter((n) => NODE_TYPES[n.type].lane === lane.key)
    if (!nodes.length) return ''
    return lines([
      `${lane.label}:`,
      ...nodes.map((n) => {
        const config = configOf(n)
        const settings = settingsOf(n.type).map((f) => `${f.label}: ${config[f.key]}`)
        return `- ${boxName(n)} (${NODE_TYPES[n.type].label})${settings.length ? `\n  Settings: ${settings.join('; ')}` : ''}`
      }),
    ])
  })
  const edges = diagram.edges.map((e) => `- ${boxName(byId.get(e.from))} to ${boxName(byId.get(e.to))} (${e.kind === 'async' ? 'async message' : 'sync call'})`)
  return blocks([...layers, edges.length ? `Lines, from the caller or sender to the receiver:\n${edges.join('\n')}` : 'No lines between the boxes yet.'])
}

function diagramParts(problem, entry) {
  const diagram = restoreDiagram(entry.diagram)
  const started = diagram.nodes.length > 0
  const { reference, task, simulation } = problem.diagram
  const landscape = landscapeOf(reference).map((g) => `${g.title}: ${g.items.map((i) => i.label).join(', ')}`)
  const checks = archChecks(problem).filter((c) => !c.run)
  return {
    question: blocks([
      problem.description,
      landscape.length ? `Already in this landscape:\n${landscape.map((l) => `- ${l}`).join('\n')}` : '',
      `My task: ${task ?? 'draw the architecture that meets these requirements.'}`,
    ]),
    plan: planText(entry.plan, 'arch'),
    work: started ? diagramText(diagram) : 'The canvas is still empty.',
    results: [
      [
        'checks',
        started
          ? checkList(checks, runDiagramChecks(diagram, checks), (c, r) => (r.reversed ? 'the line is there, but it points the other way. Lines go from the caller or sender to the receiver.' : diagramHint(diagram, c.rule)))
          : checksAhead(checks),
      ],
      ['test_runs', archRuns(simulation, diagram, started)],
    ],
  }
}

function archRuns(simulation, diagram, started) {
  const tests = simulation?.tests ?? []
  if (!tests.length) return ''
  const plays = (t) => lines([t.about, ...asList(t.traffic).map((x) => `- Traffic: ${trafficText(x)}`), ...asList(t.incidents).map((x) => `- Incident: ${incidentText(x)}`)])
  if (!started) return blocks(['Traffic will be sent through the architecture with these tests:', ...tests.map((t) => lines([`Test: ${t.name}`, plays(t)]))])
  const outcomes = tests.map((t) => ({ test: t, ...runArchTest(diagram, simulation, t) }))
  return blocks([
    `${outcomes.filter((o) => o.pass).length} of ${outcomes.length} test runs pass.`,
    ...outcomes.map(({ test, result, lines: expected, pass }) => {
      const head = `Test: ${test.name}\nResult: ${mark(pass)}`
      if (pass) return head
      const flows = result.flows.map(
        (f) =>
          `- ${f.name}: ${Math.round(f.offered)} requests, ${pct(f.success)} answered, ${pct(f.refused)} refused, ${pct(f.limited)} over the limit (429), ${pct(f.failed)} failed, ${pct(f.degraded)} partial, average ${f.avgMs == null ? 'none' : `${Math.round(f.avgMs)} ms`}` +
          f.reasons.map((r) => `\n  ${pct(r.share)} ${r.text}`).join(''),
      )
      const busy = Object.entries(result.nodes)
        .filter(([id, n]) => n.peakRps > 0 && !result.queues[id])
        .sort((a, b) => b[1].peakUtil - a[1].peakUtil || b[1].peakRps - a[1].peakRps)
        .slice(0, 8)
        .map(([, n]) => `- ${n.label}: ${n1(n.peakRps)}/s at its busiest, ${n.peakUtil ? `${Math.round(n.peakUtil * 100)}% busy` : 'no limit'}${n.down ? ', down' : ''}`)
      const queues = Object.values(result.queues)
        .filter((q) => q.peak > 0 || q.delivered > 0 || q.dlq > 0 || q.lost > 0)
        .map((q) => `- ${q.label}: ${Math.round(q.delivered)} delivered, at most ${Math.round(q.peak)} waiting, ${Math.round(q.end)} left at the end, ${Math.round(q.dlq)} to the DLQ, ${Math.round(q.lost)} lost`)
      return blocks([
        lines([head, plays(test)]),
        expected.map((l) => `- ${mark(l.ok)}: ${l.text}`).join('\n'),
        result.notes.join('\n'),
        flows.length ? `What the users saw:\n${flows.join('\n')}` : '',
        busy.length ? `How busy each box was:\n${busy.join('\n')}` : '',
        queues.length ? `Queues and topics:\n${queues.join('\n')}` : '',
      ])
    }),
  ])
}

function ramlParts(problem, entry) {
  const starter = problem.starter ?? '#%RAML 1.0\ntitle: \n'
  const main = typeof entry.raml === 'string' ? entry.raml : starter
  const files = { ...(problem.files ?? {}) }
  for (const f of Array.isArray(entry.ramlFiles) ? entry.ramlFiles : []) if (typeof f?.path === 'string') files[f.path] = String(f.text ?? '')
  const started = main.trim() !== starter.trim() || Object.entries(files).some(([path, text]) => problem.files?.[path] !== text)
  const parsed = parseRaml(main, files)
  const checks = ramlChecks(problem)
  const language = (path) => (path.endsWith('.json') ? 'json' : 'yaml')
  return {
    question: problem.description,
    work: blocks([
      started ? '' : 'I have not changed the starter file yet.',
      `api.raml:\n${fence(main, 'yaml')}`,
      ...Object.entries(files).map(([path, text]) => `${path}:\n${fence(text, language(path))}`),
    ]),
    results: [
      ['parser_errors', parsed.errors.map((e) => `- ${e.file ? `${e.file}, ` : ''}${e.line ? `line ${e.line}: ` : ''}${e.message}`).join('\n')],
      ['checks', started ? checkList(checks, runRamlChecks(parsed, checks), (c) => ramlHint(parsed, c.rule)) : checksAhead(checks)],
    ],
  }
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// A question the way the page shows it, options in the same order, with my answer. The right answer is never included.
function questionText(q, i, seed, response, submitted) {
  const order = permutation(q.type === 'match' ? q.pairs.length : (q.options ?? q.items ?? LEVELS).length, seed)
  const letter = (original) => LETTERS[order.indexOf(original)]
  const answered = isAnswered(q, response)
  const none = 'not answered yet'
  let asked = ''
  let mine = none
  if (q.type === 'single' || q.type === 'multi') {
    asked = `${q.type === 'single' ? 'Choose one' : 'Choose all that apply'}:\n${order.map((o, k) => `${LETTERS[k]}. ${q.options[o]}`).join('\n')}`
    const picked = q.type === 'single' ? (response == null ? [] : [response]) : (response ?? [])
    if (picked.length) mine = picked.map(letter).sort().join(', ')
  } else if (q.type === 'order') {
    asked = `Put in the right order:\n${order.map((o, k) => `${LETTERS[k]}. ${q.items[o]}`).join('\n')}`
    mine = response.map(letter).join(', ')
  } else if (q.type === 'match') {
    asked = `Match each item:\n${q.pairs.map(([left]) => `- ${left}`).join('\n')}\nwith one of:\n${order.map((o) => `- ${q.pairs[o][1]}`).join('\n')}`
    const picked = q.pairs.map(([left], k) => (response?.[k] == null ? '' : `- ${left}: ${q.pairs[Number(response[k])]?.[1] ?? ''}`)).filter(Boolean)
    if (picked.length) mine = `\n${picked.join('\n')}`
  } else if (q.type === 'level') {
    asked = `Pick the level: ${LEVELS.join(', ')}`
    if (response) mine = response
  } else if (q.type === 'logger') {
    asked = `Write the Logger: pick a level (${LEVELS.join(', ')}) and write the message. It can use: ${q.available.join(', ')}`
    if (response.level || response.message.trim()) mine = `level ${response.level || 'not picked'}\n${fence(response.message)}`
  }
  const right = submitted && grade(q, response)
  const notes = submitted && q.type === 'logger' ? gradeWrite(q, response).notes.map((n) => `- ${mark(n.ok)}: ${n.text}`).join('\n') : ''
  return lines([`Question ${i + 1}`, q.prompt, asked, `My answer: ${mine}`, submitted ? `Result: ${right ? 'correct' : answered ? 'wrong' : 'not answered'}` : '', notes])
}

function quizParts(problem, entry) {
  const inv = problem.investigation
  const questions = inv ? inv.questions : problem.quiz
  const state = entry.exercise && typeof entry.exercise === 'object' ? entry.exercise : {}
  const saved = state.responses && typeof state.responses === 'object' ? state.responses : {}
  const submitted = Boolean(state.submitted)
  const picked = Array.isArray(state.logs) ? state.logs : []
  const work = questions.map((q, i) => {
    const seed = `${problem.id}:${i}`
    return questionText(q, i, seed, fitsQuestion(q, saved[i]) ? saved[i] : initialResponse(q, seed), submitted)
  })
  let logs = ''
  if (inv?.logs) {
    const right = inv.logs.every((l, i) => Boolean(l.relevant) === picked.includes(i))
    logs = blocks([
      'I have to select every log line that points to the problem. The lines I selected are marked with [x].',
      fence(inv.logs.map((l, i) => `[${picked.includes(i) ? 'x' : ' '}] ${l.text}`).join('\n')),
      submitted ? `Result: ${right ? 'correct' : 'not quite right'}` : '',
    ])
  }
  return {
    question: problem.description,
    work: blocks([logs && part('log_lines', logs), ...work, submitted ? '' : 'I have not checked my answers yet.']),
    results: [],
  }
}

function writtenParts(problem, entry) {
  const template = problem.answerTemplate ?? ''
  const answer = typeof entry.answer === 'string' ? entry.answer : template
  const started = answer.trim() && answer.trim() !== template.trim()
  return {
    question: blocks([problem.description, template ? `The answer has these parts:\n${fence(template, 'markdown')}` : '']),
    work: started ? fence(answer, 'markdown') : 'I have not written anything yet.',
    results: [],
  }
}

const BUILDERS = { code: codeParts, flow: flowParts, raml: ramlParts, diagram: diagramParts, quiz: quizParts, investigation: quizParts, written: writtenParts }

// problem: the full problem · entry: its progress entry · kind: a key of promptKinds · lastRun: see store/last-run.js
export function buildPrompt(problem, entry, kind, lastRun = null) {
  const exercise = exerciseOf(problem)
  const { question, plan, work, results } = BUILDERS[exercise](problem, entry ?? {}, lastRun)
  const want = promptKinds(exercise).find((k) => k.key === kind) ?? promptKinds(exercise)[0]
  return `${blocks([
    `I am preparing for MuleSoft interviews by practising on realistic problems. This one is ${WORK[exercise]}. Below are the question, my work so far${results.some(([, body]) => body) ? ', and what the checks and test runs say about it' : ''}.`,
    want.ask && `What I want from you: ${want.ask}`,
    want.ask && 'Use short sentences and plain English. If something in the question or my work is not clear, ask me before you guess.',
    part('problem', `Title: ${problem.title}\nID: ${problem.id.toUpperCase()}\nLevel: ${problem.level}`),
    part('question', question),
    part('my_plan', plan),
    part('my_work', work),
    ...results.map(([name, body]) => part(name, body)),
    want.ask ? `Remember: ${want.key === 'explain' ? 'explain the question only, and do not solve it.' : 'help me get there myself, and do not give me the full answer unless I ask for it.'}` : 'My question:',
  ])}\n`
}
