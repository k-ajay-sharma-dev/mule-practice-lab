// Change and release: change tickets with approvals, a release gate for Production, blue/green and canary releases
// behind a lab-made router, and rollback windows. Pure and import free. Lives in state.release.
//
// The change board is lab-made and generic. It follows the usual ITSM change model: a type (Standard, Normal,
// Emergency), a risk, the implementation, test and backout plans, a planned window, approvals from the CAB and the
// service owner, the states New, Assess, Authorize, Scheduled, Implement, Review and Closed, and the configuration items.
//
// The router is lab-made. API Manager instances of the engine pair with an app through Autodiscovery and do not route by
// their implementation URL, so the release engine puts a weighted load balancer in front of two CloudHub 2.0 apps. A
// traffic flow with `router` set (see advance() in platform.js) asks routerTarget() which app takes each request.

const MINUTE = 60000
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, the same as platform.js
const pad = (n) => String(n).padStart(2, '0')

export const CHANGE_TYPES = ['Standard', 'Normal', 'Emergency']
export const RISKS = ['Low', 'Moderate', 'High']
export const CHANGE_STATES = ['New', 'Assess', 'Authorize', 'Scheduled', 'Implement', 'Review', 'Closed']
export const CLOSE_CODES = ['Successful', 'Successful with issues', 'Unsuccessful']
// a change in one of these states has its approvals and may deploy inside its window
export const APPROVED = ['Scheduled', 'Implement']
export const GATE_TEXT = 'No approved change covers this deployment.'
export const HOLD_MINUTES = 10

// "2026-11-03 22:00" and back. The lab clock counts from BASE.
export function whenText(t) {
  if (t === null || t === undefined || t === '') return ''
  const d = new Date(BASE + t)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
export function parseWhen(text) {
  const m = String(text ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return Number.isNaN(t) ? null : t - BASE
}
export const changeNumber = (n) => `CHG${String(n).padStart(7, '0')}`

// ---------- state ----------

// The seed of the open console is a placeholder { created }. The rest comes on first use (upgradeRelease).
export const defaultRelease = (now) => ({ created: now })
export function upgradeRelease(r, now = 0) {
  const x = r ?? { created: now }
  x.seq ??= 41234
  x.tickets ??= []
  x.routers ??= []
  x.gate ??= false
  return x
}
export const releaseOf = (s) => upgradeRelease(structuredClone(s?.release ?? { created: s?.clock ?? 0 }), s?.clock ?? 0)

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.release = upgradeRelease(s.release, s.clock)
  const out = fn(s, s.release)
  return out?.errors?.length ? { ...out, state } : { state: s, ...out }
}
const fail = (state, error) => ({ state, errors: [error] })
const note = (t, who, text) => ({ t, who, text })
const addNote = (x, n) => void (x.notes = [...(x.notes ?? []), n].slice(-30))

export const ticketOf = (s, id) => (s?.release?.tickets ?? []).find((x) => x.id === id) ?? null
export const routerOf = (s, id) => (s?.release?.routers ?? []).find((x) => x.id === id) ?? null

// ---------- change tickets ----------

const APPROVERS = (type) =>
  type === 'Standard'
    ? []
    : [
        { group: type === 'Emergency' ? 'Emergency CAB' : 'Change Advisory Board', who: 'Priya Raman, change manager', state: 'Not requested' },
        { group: 'Service owner', who: 'Tomas Lind, Order Management', state: 'Not requested' },
      ]

export const newTicketData = (n, patch = {}) => ({
  id: changeNumber(n),
  type: 'Normal',
  short: '',
  risk: 'Moderate',
  env: 'Production',
  impl: '',
  test: '',
  backout: '',
  start: null,
  end: null,
  rollbackMinutes: null,
  cis: [],
  state: 'New',
  approvals: APPROVERS(patch.type ?? 'Normal'),
  closeCode: '',
  closeNotes: '',
  notes: [],
  ...patch,
})

// New change. Returns { state, id }.
export function newTicket(state, patch = {}) {
  return edit(state, (s, r) => {
    const t = newTicketData(r.seq++, { opened: s.clock, ...patch })
    addNote(t, note(s.clock, 'You', `Change ${t.id} opened.`))
    r.tickets.push(t)
    return { id: t.id, errors: [] }
  })
}

const FIELDS = ['type', 'short', 'risk', 'impl', 'test', 'backout', 'start', 'end', 'rollbackMinutes', 'cis']
// The plans can change while the ticket is New. After that the approvers have seen them, so a change sends it back.
export function setTicket(state, id, patch) {
  const t = ticketOf(state, id)
  if (!t) return fail(state, `There is no change ${id}.`)
  if (t.state !== 'New') return fail(state, `${id} is in ${t.state}. Its plans were approved as they are. Open a new change for a different plan.`)
  return edit(state, (s, r) => {
    const x = r.tickets.find((y) => y.id === id)
    for (const k of FIELDS) if (k in patch) x[k] = patch[k]
    if ('type' in patch) x.approvals = APPROVERS(x.type)
    return { errors: [] }
  })
}

// What the approvers miss. The backout plan comes first: no CAB approves a change it cannot undo.
export function missingOf(t) {
  const out = []
  if (!String(t.backout ?? '').trim()) out.push('The backout plan is empty. Say how you go back, and how long it takes.')
  if (!String(t.short ?? '').trim()) out.push('Give the change a short description.')
  if (!String(t.impl ?? '').trim()) out.push('The implementation plan is empty.')
  if (!String(t.test ?? '').trim()) out.push('The test plan is empty. Say how you know the change works.')
  if (t.start === null || t.end === null || !(t.end > t.start)) out.push('Set a planned start and a planned end after it.')
  if (!(Number(t.rollbackMinutes) > 0)) out.push('Set the rollback window: the minutes in which the backout must finish.')
  if (!t.cis?.length) out.push('Name the configuration items, the apps this change touches.')
  return out
}

// Request approval: New to Assess. A Standard change is pre-approved and goes to Scheduled.
export function requestApproval(state, id) {
  const t = ticketOf(state, id)
  if (!t) return fail(state, `There is no change ${id}.`)
  if (t.state !== 'New') return fail(state, `${id} is in ${t.state}. Only a New change can ask for approval.`)
  return edit(state, (s, r) => {
    const x = r.tickets.find((y) => y.id === id)
    if (x.type === 'Standard') {
      const gone = missingOf(x)
      if (gone.length) return { errors: gone }
      x.state = 'Scheduled'
      addNote(x, note(s.clock, 'Change board', 'Standard change from the catalog. It is pre-approved and now Scheduled.'))
      return { errors: [] }
    }
    x.state = 'Assess'
    x.approvals = APPROVERS(x.type).map((a) => ({ ...a, state: 'Requested', t: s.clock }))
    addNote(x, note(s.clock, 'You', 'Approval requested.'))
    return { errors: [] }
  })
}

// Lab action: plays the change manager, the CAB and the service owner for every change that waits for them.
export function playApprovers(state) {
  return edit(state, (s, r) => {
    for (const x of r.tickets.filter((y) => y.state === 'Assess' || y.state === 'Authorize')) {
      const gone = missingOf(x)
      if (gone.length) {
        x.approvals = x.approvals.map((a, i) => (i === 0 ? { ...a, state: 'Rejected', t: s.clock, comment: `Rejected. ${gone.join(' ')}` } : { ...a, state: 'Not requested', t: s.clock }))
        x.state = 'New'
        addNote(x, note(s.clock, x.approvals[0]?.who ?? 'Change board', `Rejected. ${gone.join(' ')}`))
        continue
      }
      x.state = 'Authorize'
      addNote(x, note(s.clock, 'Priya Raman, change manager', 'Assessed: plans, window and configuration items are complete.'))
      x.approvals = x.approvals.map((a) => ({ ...a, state: 'Approved', t: s.clock, comment: a.group === 'Service owner' ? 'Approved for the planned window.' : 'Approved. Keep to the window and the rollback window.' }))
      x.state = 'Scheduled'
      addNote(x, note(s.clock, 'Change board', `Approved. Scheduled for ${whenText(x.start)} to ${whenText(x.end)}.`))
    }
    return { errors: [] }
  })
}

export function startImplement(state, id) {
  const t = ticketOf(state, id)
  if (!t) return fail(state, `There is no change ${id}.`)
  if (t.state !== 'Scheduled') return fail(state, `${id} is in ${t.state}. Implementation starts from Scheduled.`)
  if (state.clock < t.start) return fail(state, `The window of ${id} opens at ${whenText(t.start)}.`)
  if (state.clock > t.end) return fail(state, `The window of ${id} closed at ${whenText(t.end)}. Plan a new window.`)
  return edit(state, (s, r) => {
    const x = r.tickets.find((y) => y.id === id)
    x.state = 'Implement'
    addNote(x, note(s.clock, 'You', 'Implementation started.'))
    return { errors: [] }
  })
}
export function toReview(state, id) {
  const t = ticketOf(state, id)
  if (!t) return fail(state, `There is no change ${id}.`)
  if (!APPROVED.includes(t.state)) return fail(state, `${id} is in ${t.state}. Review comes after Scheduled or Implement.`)
  return edit(state, (s, r) => {
    const x = r.tickets.find((y) => y.id === id)
    x.state = 'Review'
    addNote(x, note(s.clock, 'You', 'Moved to Review.'))
    return { errors: [] }
  })
}
export function closeTicket(state, id, closeCode, closeNotes) {
  const t = ticketOf(state, id)
  if (!t) return fail(state, `There is no change ${id}.`)
  if (t.state !== 'Review') return fail(state, `${id} is in ${t.state}. Move it to Review first.`)
  if (!CLOSE_CODES.includes(closeCode)) return fail(state, 'Choose a close code.')
  if (!String(closeNotes ?? '').trim()) return fail(state, 'Write the close notes: what happened and what is next.')
  return edit(state, (s, r) => {
    const x = r.tickets.find((y) => y.id === id)
    Object.assign(x, { state: 'Closed', closeCode, closeNotes, closed: s.clock })
    addNote(x, note(s.clock, 'You', `Closed ${closeCode}.`))
    return { errors: [] }
  })
}
export const addWorkNote = (state, id, text) =>
  edit(state, (s, r) => {
    const x = r.tickets.find((y) => y.id === id)
    if (x && String(text).trim()) addNote(x, note(s.clock, 'You', String(text).trim()))
    return { errors: [] }
  }).state

// ---------- release gate ----------

// An approved change whose window is open now and that names the app
export const coveringChange = (s, appName, env = 'Production', t = s.clock) =>
  (s?.release?.tickets ?? []).find((x) => APPROVED.includes(x.state) && (x.env ?? 'Production') === env && x.start <= t && t <= x.end && x.cis.includes(appName)) ?? null

// Called by deployErrors() in platform.js. Only a release with the gate on is checked, so older labs are unchanged.
export function releaseGateError(state, form) {
  if (!state?.release?.gate || state.env !== 'Production') return null
  return coveringChange(state, form.name, 'Production') ? null : GATE_TEXT
}

// ---------- the router ----------

// A blue/green router: two apps, all traffic on one of them
export const blueGreenRouter = (id, env, blue, green, extra = {}) => ({
  id,
  kind: 'blue-green',
  env,
  targets: [
    { app: blue, role: 'blue', weight: 100 },
    { app: green, role: 'green', weight: 0 },
  ],
  live: 'blue',
  since: 0,
  history: [],
  rollbacks: [],
  n: {},
  ...extra,
})
// A canary router: the stable version and the canary, with a plan of weights and an error threshold in percent
export const canaryRouter = (id, env, stable, canary, extra = {}) => ({
  id,
  kind: 'canary',
  env,
  targets: [
    { app: stable, role: 'stable', weight: 100 },
    { app: canary, role: 'canary', weight: 0 },
  ],
  plan: [10, 50, 100],
  threshold: 1,
  since: 0,
  steps: [],
  history: [],
  n: {},
  ...extra,
})

const roleOf = (router, role) => router.targets.find((x) => x.role === role)
const otherRole = (role) => ({ blue: 'green', green: 'blue', stable: 'canary', canary: 'stable' })[role]
export const canaryWeight = (router) => roleOf(router, 'canary')?.weight ?? 0

// Weighted split, the same for every flow: request c of a flow goes to the first target whose running total of weight
// is above (c * 37) % 100. 37 has no factor in common with 100, so every 100 requests of a flow split exactly by weight.
// Mutates s, as it runs inside advance().
export function routerTarget(s, f) {
  const router = routerOf(s, f.router)
  if (!router) return f.router
  const key = `${f.method ?? 'GET'} ${f.path}`
  const c = router.n[key] ?? 0
  router.n[key] = (c + 1) % 100000
  const x = (c * 37) % 100
  let sum = 0
  for (const t of router.targets) {
    sum += t.weight
    if (x < sum) return t.app
  }
  return router.targets.find((t) => t.weight > 0)?.app ?? router.targets[0].app
}

// Requests and errors of one app from the event list of the console
export function statsOf(s, env, app, from, to = s.clock) {
  const list = (s.events ?? []).filter((e) => e.k === 'in' && e.app === app && e.env === env && e.t > from && e.t <= to)
  const errors = list.filter((e) => typeof e.s === 'number' && e.s >= 500)
  return { requests: list.length, errors: errors.length, rate: list.length ? (errors.length * 100) / list.length : 0, failing: topPaths(errors) }
}
const topPaths = (list) => {
  const m = {}
  for (const e of list) m[`${e.m} ${e.p}`] = (m[`${e.m} ${e.p}`] ?? 0) + 1
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4)
}
// a rate under 1% keeps two decimals, so 0.15% does not read as 0.1%
export const rateText = (r) => `${r > 0 && r < 1 ? r.toFixed(2) : r.toFixed(1)}%`

const appIn = (s, name, env) => (s.apps ?? []).find((a) => a.name === name && a.env === env)
const gateFor = (s, router) => {
  if (!s.release?.gate || router.env !== 'Production') return null
  return router.targets.some((t) => coveringChange(s, t.app, router.env)) ? null : 'No approved change covers this traffic change.'
}

// The rollback window: from the moment the new version took traffic, the minutes of the change that covers it
export function rollbackWindow(s, router) {
  if (router.kind !== 'blue-green' || router.liveAt === undefined || !router.prev) return null
  const t = (s.release?.tickets ?? []).find((x) => x.state !== 'New' && router.targets.some((y) => x.cis.includes(y.app)) && x.start <= router.liveAt && router.liveAt <= x.end)
  const minutes = Number(t?.rollbackMinutes) || router.rollbackMinutes || 30
  return { from: router.liveAt, until: router.liveAt + minutes * MINUTE, minutes, ticket: t?.id ?? null }
}

function closeStep(s, router) {
  const open = router.steps?.at(-1)
  if (!open || open.to !== undefined) return
  const c = roleOf(router, 'canary')
  const st = statsOf(s, router.env, c.app, open.from, s.clock)
  Object.assign(open, { to: s.clock, requests: st.requests, errors: st.errors })
}
function setWeights(s, router, canary, by) {
  const c = roleOf(router, 'canary')
  const st = roleOf(router, 'stable')
  closeStep(s, router)
  c.weight = canary
  st.weight = 100 - canary
  router.since = s.clock
  router.steps = [...(router.steps ?? []), { w: canary, from: s.clock, app: c.app, config: appIn(s, c.app, router.env)?.config ?? 0 }].slice(-20)
  router.history = [...router.history, { t: s.clock, text: `${by}: canary ${canary}%, stable ${100 - canary}%` }].slice(-30)
}

// What holds a canary step back from the next weight. null when it may go up.
export function holdError(s, router) {
  const w = canaryWeight(router)
  if (w === 0) return null
  const held = Math.floor((s.clock - router.since) / MINUTE)
  if (held < HOLD_MINUTES) return `Hold this step for at least ${HOLD_MINUTES} lab minutes. ${held} so far.`
  const c = roleOf(router, 'canary')
  const st = statsOf(s, router.env, c.app, router.since)
  if (st.requests === 0) return 'The canary has taken no requests in this step, so there is nothing to judge.'
  if (st.rate >= router.threshold) return `The canary error rate in this step is ${rateText(st.rate)}, at or above the threshold of ${rateText(router.threshold)}. Roll back, or fix and start again.`
  return null
}

// The canary weight from the field or the slider. Down is always allowed; up only when the current step held.
export function setCanaryWeight(state, id, weight) {
  const router = routerOf(state, id)
  if (!router || router.kind !== 'canary') return fail(state, `There is no canary release ${id}.`)
  const w = String(weight ?? '').trim() === '' ? NaN : Number(weight)
  if (!Number.isInteger(w) || w < 0 || w > 100) return fail(state, 'A weight is a whole number from 0 to 100.')
  const now = canaryWeight(router)
  if (w === now) return { state, errors: [] }
  if (w > now) {
    const c = roleOf(router, 'canary')
    if (appIn(state, c.app, router.env)?.status !== 'Running') return fail(state, `${c.app} is not running in ${router.env}.`)
    const gate = gateFor(state, router)
    if (gate) return fail(state, gate)
    const hold = holdError(state, router)
    if (hold) return fail(state, hold)
  }
  return edit(state, (s, r) => {
    setWeights(s, r.routers.find((x) => x.id === id), w, w < now ? (w === 0 ? 'Rolled back' : 'Lowered') : 'Raised')
    return { errors: [] }
  })
}

function switchTo(s, router, role, by) {
  const from = router.live
  for (const t of router.targets) t.weight = t.role === role ? 100 : 0
  router.live = role
  router.since = s.clock
  router.history = [...router.history, { t: s.clock, text: `${by}: all traffic to ${roleOf(router, role).app}` }].slice(-30)
  return from
}

// Promote: blue/green switches all traffic to the idle color; a canary goes to the next weight of its plan
export function promote(state, id) {
  const router = routerOf(state, id)
  if (!router) return fail(state, `There is no release ${id}.`)
  if (router.kind === 'canary') {
    const now = canaryWeight(router)
    const next = router.plan.find((w) => w > now)
    if (next === undefined) return fail(state, 'The canary takes all the traffic. The release is complete.')
    return setCanaryWeight(state, id, next)
  }
  const idle = otherRole(router.live)
  const target = roleOf(router, idle)
  if (appIn(state, target.app, router.env)?.status !== 'Running') return fail(state, `${target.app} is not running in ${router.env}. Deploy it and smoke test it first.`)
  const gate = gateFor(state, router)
  if (gate) return fail(state, gate)
  return edit(state, (s, r) => {
    const x = r.routers.find((y) => y.id === id)
    x.prev = switchTo(s, x, idle, 'Promoted')
    x.liveAt = s.clock
    return { errors: [] }
  })
}

// Roll back: blue/green goes back to the color that served before; a canary goes to weight 0
export function rollback(state, id) {
  const router = routerOf(state, id)
  if (!router) return fail(state, `There is no release ${id}.`)
  if (router.kind === 'canary') {
    if (canaryWeight(router) === 0) return fail(state, 'The canary takes no traffic.')
    return setCanaryWeight(state, id, 0)
  }
  if (!router.prev) return fail(state, 'Nothing to roll back to. No switch was made yet.')
  const back = roleOf(router, router.prev)
  if (appIn(state, back.app, router.env)?.status !== 'Running') return fail(state, `${back.app} is not running in ${router.env}.`)
  return edit(state, (s, r) => {
    const x = r.routers.find((y) => y.id === id)
    const win = rollbackWindow(s, x)
    const left = switchTo(s, x, x.prev, 'Rolled back')
    x.rollbacks = [...(x.rollbacks ?? []), { t: s.clock, from: left, to: x.live, within: win ? s.clock <= win.until : true, minutes: win ? Math.round((s.clock - win.from) / MINUTE) : 0 }].slice(-10)
    delete x.prev
    delete x.liveAt
    return { errors: [] }
  })
}

// ---------- tick ----------

// Once a lab minute: a Scheduled or Implement change whose window has passed gets a work note
export function releaseTick(s) {
  const r = upgradeRelease(s.release, s.clock)
  s.release = r
  for (const x of r.tickets) {
    if (APPROVED.includes(x.state) && x.end !== null && s.clock > x.end && !x.overdue) {
      x.overdue = s.clock
      addNote(x, note(s.clock, 'Change board', `The planned window ended at ${whenText(x.end)}. Move the change to Review and close it.`))
    }
  }
  return s
}
