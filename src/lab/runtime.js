// Simulates deploying Mule applications to CloudHub 2.0 style targets on a virtual clock.
// Pure: every action returns a new state. A deployment is a queue of steps that advance() plays back.
// Facts come from the CloudHub 2.0 pages; anything those pages do not state carries `basis: 'assumed'`.
const DOCS = 'https://docs.mulesoft.com/cloudhub-2/'

export const MASK = '******'
export const MAX_REPLICAS = 8 // 16 needs a higher subscription, which the lab does not model
export const MAX_CONFIGS = 10
export const DEPLOY_MODELS = ['Rolling update', 'Recreate']
export const RUNTIME_VERSIONS = ['4.6', '4.9', '4.10'] // sample versions, not the current support list
export const RUNTIME_VERSIONS_BASIS = 'assumed'

// Sizes and heap are the CloudHub 2.0 architecture table. heapMb is the same heap figure in MB, for comparing with a sample package.
export const REPLICA_SIZES = [
  { vCores: 0.1, memory: '1.4 GB', heap: '480 MB', heapMb: 480, storage: '8 GB' },
  { vCores: 0.2, memory: '2 GB', heap: '1 GB', heapMb: 1024, storage: '8 GB' },
  { vCores: 0.5, memory: '2.6 GB', heap: '1.3 GB', heapMb: 1331, storage: '10 GB' },
  { vCores: 1, memory: '4 GB', heap: '2 GB', heapMb: 2048, storage: '12 GB' },
  { vCores: 1.5, memory: '6 GB', heap: '3 GB', heapMb: 3072, storage: '20 GB' },
  { vCores: 2, memory: '8 GB', heap: '4 GB', heapMb: 4096, storage: '20 GB' },
  { vCores: 2.5, memory: '9.5 GB', heap: '4.75 GB', heapMb: 4864, storage: '20 GB' },
  { vCores: 3, memory: '11 GB', heap: '5.5 GB', heapMb: 5632, storage: '20 GB' },
  { vCores: 3.5, memory: '13 GB', heap: '6.5 GB', heapMb: 6656, storage: '20 GB' },
  { vCores: 4, memory: '15 GB', heap: '7.5 GB', heapMb: 7680, storage: '20 GB' },
]

// capacity is the lab's own allocation in vCores, kept small so the shortage can be practised
export const TARGETS = [
  { id: 'shared', name: 'Shared Space (lab region)', capacity: 6 },
  { id: 'private', name: 'Private Space lab-ps', capacity: 2 },
]

// Sample applications, invented for the lab. What each one needs to start is part of the exercise.
export const PACKAGES = [
  { id: 'hello-api', name: 'hello-api 1.0.0', requires: [], heapMb: 300, minRuntime: '4.6', note: 'Needs no properties.', basis: 'assumed' },
  {
    id: 'orders-api',
    name: 'orders-api 1.2.0',
    requires: ['db.host', 'db.user', 'db.password'],
    heapMb: 400,
    minRuntime: '4.6',
    note: 'Its configuration reads ${db.host}, ${db.user} and ${db.password}.',
    basis: 'assumed',
  },
  {
    id: 'inventory-sync',
    name: 'inventory-sync 2.0.0',
    requires: ['sftp.host'],
    heapMb: 1600,
    minRuntime: '4.9',
    note: 'Loads a large catalogue at startup, about 1.6 GB of heap. Built for Mule 4.9 or later. Reads ${sftp.host}.',
    basis: 'assumed',
  },
]

const ACTIVE = new Set(['Pending', 'Starting', 'Started', 'Applying', 'Stopping', 'Deleting'])
const SERVING = new Set(['Started', 'Applying'])

// Log text is the lab's own wording, so every line is assumed even when the event it reports is documented.
const line = (level, text) => ({ level, text, basis: 'assumed' })
const vCoreSum = (value) => Math.round(value * 100) / 100
const packageOf = (config) => PACKAGES.find((p) => p.id === config.packageId)
const targetOf = (config) => TARGETS.find((t) => t.id === config.target)
const sizeOf = (config) => REPLICA_SIZES.find((s) => s.vCores === config.vCores)
const versionNumbers = (version) => version.split('.').map(Number)

export const newState = () => ({ clock: 0, configSerial: 0, apps: [] })

export const newConfig = () => ({
  name: 'orders-api',
  packageId: 'orders-api',
  target: 'shared',
  runtime: '4.9',
  replicas: 1,
  vCores: 0.5,
  clustered: false,
  model: DEPLOY_MODELS[0],
  properties: {},
  protectedProperties: {},
})

export function parseProperties(text) {
  const entries = String(text ?? '')
    .split('\n')
    .flatMap((row) => {
      const at = row.indexOf('=')
      return at > 0 ? [[row.slice(0, at).trim(), row.slice(at + 1).trim()]] : []
    })
  return Object.fromEntries(entries)
}

export const formatProperties = (properties) =>
  Object.entries(properties)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

// A protected value is never shown again, so the form sends the mask and the stored value is kept.
export function keepProtected(next, previous = {}) {
  return Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v === MASK ? (previous[k] ?? '') : v]))
}

export const maskProtected = (properties) => Object.fromEntries(Object.keys(properties).map((k) => [k, MASK]))

export function validate(config) {
  const errors = []
  const add = (field, message) => errors.push({ field, message, basis: 'docs' })
  const name = String(config.name ?? '')
  if (name.length < 3 || name.length > 42) add('name', 'The application name must be 3 to 42 characters long.')
  if (!/^[a-zA-Z0-9-]*$/.test(name)) add('name', 'The application name can contain only letters, numbers and dashes.')
  if (!/^[a-zA-Z]/.test(name)) add('name', 'The application name must start with a letter.')
  if (name.endsWith('-')) add('name', 'The application name cannot end with a dash.')
  if (!Number.isInteger(config.replicas) || config.replicas < 1 || config.replicas > MAX_REPLICAS) {
    add('replicas', `Replica count must be from 1 to ${MAX_REPLICAS}.`)
  }
  if (!sizeOf(config)) add('vCores', 'Choose one of the available replica sizes. The largest is 4 vCores.')
  if (config.clustered && config.replicas < 2) add('clustered', 'Clustering requires at least two replicas.')
  return errors
}

export function usedVCores(state, targetId, exceptName) {
  return state.apps
    .filter((a) => a.name !== exceptName && a.config.target === targetId)
    .flatMap((a) => a.replicas.filter((r) => ACTIVE.has(r.status) && !(a.waiting && r.status === 'Pending')))
    .reduce((total, r) => total + r.vCores, 0)
}

// A rolling update keeps the old replicas until each new one has started, so it needs one replica more than the
// configuration uses. Returns null when the change has no such peak: a first deployment, or the Recreate model.
export function rollingNeed(state, config) {
  const app = state.apps.find((a) => a.name === config.name)
  const olds = app?.replicas.filter((r) => r.configId === app.applied && SERVING.has(r.status)) ?? []
  if (olds.length === 0 || config.model !== DEPLOY_MODELS[0]) return null
  const steady = vCoreSum(config.replicas * config.vCores)
  let peak = 0
  for (let done = 0; done < config.replicas; done++) {
    const kept = olds.slice(done).reduce((total, r) => total + r.vCores, 0)
    peak = Math.max(peak, vCoreSum(kept + (done + 1) * config.vCores))
  }
  return { peak, steady, extra: vCoreSum(peak - steady) }
}

const cannotResolve = (key) => `Could not resolve the configuration property \${${key}}. The application did not start.`

// Returns what stops this configuration from starting, or null when it starts.
export function diagnose(config, state) {
  const pkg = packageOf(config)
  const target = targetOf(config)
  const rolling = rollingNeed(state, config)
  const needed = rolling?.peak ?? vCoreSum(config.replicas * config.vCores)
  const free = vCoreSum(target.capacity - usedVCores(state, target.id, config.name))
  if (needed > free) {
    const logs = [line('WARN', `Waiting for capacity: ${needed} vCores needed, ${free} free on ${target.name}.`)]
    if (rolling) {
      return {
        kind: 'capacity',
        title: 'Not enough vCores for a rolling update',
        cause: `A rolling update requires one additional replica's worth of resources. This one peaks at ${needed} vCores, ${rolling.extra} above the ${rolling.steady} it uses when finished, and ${target.name} has ${free} free.`,
        fix: 'Use the Recreate model, which needs no additional resources but has downtime, or free vCores on this target.',
        basis: 'docs',
        docs: `${DOCS}ch2-deploy-maven`,
        assumption: 'The lab holds the update in Pending and keeps the old replicas serving until the vCores are free.',
        logs,
      }
    }
    return {
      kind: 'capacity',
      title: 'Not enough vCores available',
      cause: `This deployment needs ${needed} vCores and ${target.name} has ${free} free. The application exists but cannot start until the vCores become available.`,
      fix: 'Lower the replica size or count, choose another target, or stop another application on this target.',
      basis: 'docs',
      docs: `${DOCS}ch2-architecture`,
      logs,
    }
  }
  const [major, minor] = versionNumbers(config.runtime)
  const [needMajor, needMinor] = versionNumbers(pkg.minRuntime)
  if (major < needMajor || (major === needMajor && minor < needMinor)) {
    return {
      kind: 'runtime',
      title: 'Runtime version too old for this application',
      cause: `${pkg.name} was built for Mule ${pkg.minRuntime} or later and this deployment selected ${config.runtime}.`,
      fix: `Select runtime version ${pkg.minRuntime} or later.`,
      basis: 'assumed',
      logs: [line('ERROR', `${pkg.name} requires Mule ${pkg.minRuntime} or later. Running on ${config.runtime}.`)],
    }
  }
  const missing = pkg.requires.filter((key) => !(config.properties[key] || config.protectedProperties[key]))
  if (missing.length > 0) {
    return {
      kind: 'property',
      title: 'Missing application property',
      cause: `The application reads ${missing.map((k) => `\${${k}}`).join(', ')} and no value was supplied.`,
      fix: 'Add the missing properties, as protected properties for secrets, and redeploy.',
      basis: 'assumed',
      logs: missing.map((key) => line('ERROR', cannotResolve(key))),
    }
  }
  if (sizeOf(config).heapMb < pkg.heapMb) {
    return {
      kind: 'memory',
      title: 'Out of memory at startup',
      cause: `${pkg.name} needs about ${pkg.heapMb} MB of heap and a ${config.vCores} vCore replica has ${sizeOf(config).heap}.`,
      fix: 'Increase the replica size, or reduce the memory the application uses.',
      basis: 'docs',
      docs: `${DOCS}ch2-migration-troubleshoot`,
      assumption: 'The heap this sample application needs is a lab value.',
      logs: [line('ERROR', 'java.lang.OutOfMemoryError: Java heap space'), line('WARN', 'Replica terminated, then Recovering. CloudHub 2.0 attempts to restart it.')],
    }
  }
  return null
}

const withStatus = (replicas, status) => replicas.map((r) => ({ ...r, status }))

// Builds the step queue that moves replicas from where they are now to the app's current configuration.
function plan(state, app) {
  const config = app.config
  const configId = app.current
  const problem = diagnose(config, state)
  const olds = withStatus(
    app.replicas.filter((r) => r.configId === app.applied && SERVING.has(r.status)),
    'Started',
  )
  const steps = []
  let at = state.clock
  let cur = olds
  const step = (after, logs, extra = {}) => {
    at += after
    steps.push({ at, replicas: structuredClone(cur), logs, ...extra })
  }
  const replica = (status) => ({ id: `${app.name}-${++app.serial}`, status, configId, vCores: config.vCores })
  const requested = line('INFO', `Applying ${configId}: ${config.replicas} x ${config.vCores} vCore on Mule ${config.runtime}.`)
  const started = line('INFO', `Application ${app.name} started on Mule ${config.runtime}.`)

  if (olds.length > 0 && config.model === DEPLOY_MODELS[0]) {
    const waiting = [...withStatus(olds, 'Applying')]
    const first = replica('Pending')
    cur = [...waiting, first]
    if (problem?.kind === 'capacity') {
      step(0, [requested, ...problem.logs], { wait: true, problem })
      return steps
    }
    step(0, [requested, line('INFO', 'Rolling update: the previous configuration keeps serving until each new replica has started.')])
    let fresh = withStatus([first], 'Starting')
    cur = [...waiting, ...fresh]
    step(2000, [line('INFO', `Replica ${first.id} is starting.`)])
    if (problem) {
      cur = [...waiting, ...withStatus(fresh, 'Failed')]
      step(3000, problem.logs)
      cur = olds
      step(1000, [line('WARN', 'Update failed. The last successful configuration is retained.')], { finish: 'rolled-back', problem })
      return steps
    }
    for (let i = 0; i < config.replicas; i++) {
      fresh = fresh.map((r) => ({ ...r, status: 'Started' }))
      const leaving = waiting.shift()
      cur = [...waiting, ...(leaving ? [{ ...leaving, status: 'Deleting' }] : []), ...fresh]
      step(3000, [line('INFO', `Replica ${fresh.at(-1).id} is receiving traffic.`)])
      if (i < config.replicas - 1) {
        fresh = [...fresh, replica('Starting')]
        cur = [...waiting, ...fresh]
        step(1000, [line('INFO', `Replica ${fresh.at(-1).id} is starting.`)])
      }
    }
    cur = fresh
    step(1000, [started], { finish: 'applied' })
    return steps
  }

  if (olds.length > 0) {
    cur = withStatus(olds, 'Stopping')
    step(0, [requested, line('INFO', 'Recreate: replicas are terminated before redeployment.')])
    cur = []
    step(1500, [line('INFO', 'Previous replicas deleted. The application is not receiving traffic.')])
  }
  const fresh = Array.from({ length: config.replicas }, () => replica('Pending'))
  cur = fresh
  const opening = olds.length > 0 ? [] : [requested]
  if (problem?.kind === 'capacity') {
    step(0, [...opening, ...problem.logs], { wait: true, problem })
    return steps
  }
  step(0, opening)
  cur = withStatus(fresh, 'Starting')
  step(2000, [line('INFO', `Starting ${cur.length} replica(s) with ${packageOf(config).name}.`)])
  if (!problem) {
    cur = withStatus(fresh, 'Started')
    step(3000, [started], { finish: 'applied' })
    return steps
  }
  cur = withStatus(fresh, 'Failed')
  step(3000, problem.logs, olds.length > 0 ? {} : { finish: 'failed', problem })
  if (olds.length > 0) {
    cur = withStatus(olds, 'Starting')
    step(1000, [line('WARN', 'Rolling back to the last successful configuration.')])
    cur = olds
    step(3000, [line('WARN', 'Update failed. The last successful configuration is running again.')], { finish: 'rolled-back', problem })
  }
  return steps
}

const entry = (app, id) => app.history.find((h) => h.id === id)

function runStep(state, app) {
  const step = app.queue.shift()
  state.clock = Math.max(state.clock, step.at)
  app.replicas = step.replicas
  app.logs.push(...step.logs.map((l) => ({ ...l, at: step.at })))
  app.logs = app.logs.slice(-200)
  if (step.wait) {
    app.waiting = true
    app.outcome = step.problem
  }
  if (!step.finish) return
  const current = entry(app, app.current)
  if (step.finish === 'applied') {
    app.applied = app.current
    app.outcome = null
    if (current) current.status = 'Applied'
  }
  if (step.finish === 'failed') {
    app.outcome = step.problem
    if (current) current.status = 'Failed'
  }
  if (step.finish === 'rolled-back') {
    app.outcome = step.problem
    if (current) current.status = 'Update failed'
    app.current = app.applied
    app.config = structuredClone(entry(app, app.applied)?.config ?? app.config)
  }
  wakeWaiting(state)
}

// Freed vCores let a waiting application start without a new deployment.
function wakeWaiting(state) {
  for (const app of state.apps) {
    if (!app.waiting || diagnose(app.config, state)?.kind === 'capacity') continue
    app.waiting = false
    app.outcome = null
    app.queue = plan(state, app)
  }
}

export function advance(state, ms) {
  const next = structuredClone(state)
  const end = next.clock + ms
  for (;;) {
    const due = next.apps.filter((a) => a.queue[0]?.at <= end).sort((a, b) => a.queue[0].at - b.queue[0].at)[0]
    if (!due) break
    runStep(next, due)
  }
  next.clock = end
  return next
}

export function settle(state) {
  let next = state
  for (let guard = 0; guard < 200; guard++) {
    const times = next.apps.flatMap((a) => (a.queue[0] ? [a.queue[0].at] : []))
    if (times.length === 0) break
    next = advance(next, Math.max(0, Math.min(...times) - next.clock))
  }
  return next
}

const supersede = (app) => {
  for (const earlier of app.history) if (earlier.status === 'In progress') earlier.status = 'Superseded'
}

function launch(state, app, id, config) {
  app.config = structuredClone(config)
  app.current = id
  app.waiting = false
  app.stopped = false
  app.outcome = null
  app.queue = plan(state, app)
}

export function deploy(state, input) {
  const errors = validate(input)
  const existing = state.apps.find((a) => a.name === input.name)
  if (existing?.queue.length) errors.push({ field: 'name', message: 'A change to this application is still in progress.', basis: 'assumed' })
  if (errors.length > 0) return { state, errors }
  const next = structuredClone(state)
  let app = next.apps.find((a) => a.name === input.name)
  if (!app) {
    app = { name: input.name, serial: 0, replicas: [], queue: [], logs: [], history: [], applied: null, current: null, waiting: false, stopped: false, outcome: null }
    next.apps.push(app)
  }
  const id = `config-${++next.configSerial}`
  supersede(app)
  app.history = [{ id, at: next.clock, config: structuredClone(input), status: 'In progress' }, ...app.history].slice(0, MAX_CONFIGS)
  launch(next, app, id, input)
  return { state: advance(next, 0), errors: [] }
}

function change(state, name, action) {
  const next = structuredClone(state)
  const app = next.apps.find((a) => a.name === name)
  if (!app || app.queue.length > 0) return state
  action(next, app)
  return advance(next, 0)
}

export const stop = (state, name) =>
  change(state, name, (next, app) => {
    const at = next.clock
    app.waiting = false
    app.stopped = true
    app.queue = [
      { at, replicas: withStatus(app.replicas, 'Stopping'), logs: [line('INFO', 'Stop requested.')] },
      { at: at + 2000, replicas: withStatus(app.replicas, 'Stopped'), logs: [line('INFO', 'Replicas have stopped and are not receiving traffic.')], finish: 'stopped' },
    ]
  })

export const start = (state, name) =>
  change(state, name, (next, app) => {
    app.stopped = false
    app.outcome = null
    app.queue = plan(next, app)
  })

export function remove(state, name) {
  const next = structuredClone(state)
  next.apps = next.apps.filter((a) => a.name !== name)
  wakeWaiting(next)
  return advance(next, 0)
}

// Deploys an earlier successful configuration again. It moves to the top of the history with a new deployment date
// and keeps its identifier, so no new entry is created.
export function rollback(state, name, configId) {
  const app = state.apps.find((a) => a.name === name)
  const target = app && entry(app, configId)
  if (target?.status !== 'Applied') return { state, errors: [{ field: 'name', message: 'Only a successful configuration can be rolled back to.', basis: 'docs' }] }
  if (app.queue.length) return { state, errors: [{ field: 'name', message: 'A change to this application is still in progress.', basis: 'assumed' }] }
  const next = structuredClone(state)
  const nextApp = next.apps.find((a) => a.name === name)
  const moved = { ...entry(nextApp, configId), at: next.clock }
  supersede(nextApp)
  nextApp.history = [moved, ...nextApp.history.filter((h) => h.id !== configId)]
  launch(next, nextApp, configId, moved.config)
  return { state: advance(next, 0), errors: [] }
}

export function appStatus(app) {
  return app.replicas.some((r) => SERVING.has(r.status)) ? 'Running' : 'Not running'
}

export function deploymentStatus(app) {
  if (app.waiting) return 'Pending'
  if (app.queue.length > 0) return 'Applying'
  if (app.stopped) return 'Stopped'
  if (app.outcome) return app.applied ? 'Update failed' : 'Failed'
  return 'Applied'
}
