// Batch job instances of the Platform Lab, in the style of the batch view of Runtime Manager and Monitoring. Pure and
// import free: platform.js turns the `batch` report of a package run into an instance with batchInstanceOf and keeps the
// last MAX_INSTANCES on app.batches, newest first.
//
// What a package may report in `result.batch` (every field is optional, the old { total, processed, ok, failed } still works):
//   job, instance (id), status, total, processed, successful (or ok), failed, blockSize, maxFailedRecords,
//   loadMs (the Load and Dispatch phase), completeMs (On Complete), inputError (a FAILED_INPUT message),
//   steps: [{ name, accept: 'NO_FAILURES' | 'ONLY_FAILURES' | 'ALL', processed, failed,
//             errors: [{ type, message, count, record }] }]   record is the first record with that error, as text
//
// Lab simplification: the package does all its work when the run starts. The instance shows EXECUTING until its end
// time on the lab clock, and the counts grow block by block over that time. Stop cuts the counts at the block reached,
// although the records the package already wrote stay written.

export const BATCH_STATUSES = ['EXECUTING', 'SUCCESSFUL', 'FAILED_PROCESS_RECORDS', 'STOPPED', 'FAILED_INPUT']
export const ACCEPT_POLICIES = ['NO_FAILURES', 'ONLY_FAILURES', 'ALL']
export const MAX_INSTANCES = 20
export const DEFAULT_BLOCK_SIZE = 100
const FINAL = ['SUCCESSFUL', 'FAILED_PROCESS_RECORDS', 'STOPPED', 'FAILED_INPUT']

const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' && v !== undefined ? Number(v) : fallback)
const hash = (text) => {
  let h = 2166136261
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
const hex = (n, size) => (n >>> 0).toString(16).padStart(8, '0').slice(0, size)

// A job instance id in the form of a UUID, the same for the same seed
export function instanceIdOf(seed) {
  const a = hash(seed)
  const b = hash(`${seed}|b`)
  const c = hash(`${seed}|c`)
  return `${hex(a, 8)}-${hex(b, 4)}-11f1-${hex(c, 4)}-${hex(hash(`${seed}|d`), 8)}${hex(c >>> 8, 4)}`
}

const stepOf = (x, i) => ({
  name: String(x.name ?? `step-${i + 1}`),
  accept: ACCEPT_POLICIES.includes(x.accept) ? x.accept : 'NO_FAILURES',
  processed: Math.max(0, num(x.processed, 0)),
  failed: Math.max(0, num(x.failed, 0)),
  errors: (x.errors ?? []).map((e) => ({ type: String(e.type ?? 'MULE:UNKNOWN'), message: String(e.message ?? ''), count: Math.max(1, num(e.count, 1)), record: e.record ?? null })),
})

// The status a finished run reports, when the package does not name one
function statusOf(report, ok, processed, failed) {
  if (BATCH_STATUSES.includes(report.status) && report.status !== 'EXECUTING') return report.status
  if (report.inputError) return 'FAILED_INPUT'
  const max = num(report.maxFailedRecords, null)
  if (max !== null && max !== -1 && failed > max) return 'FAILED_PROCESS_RECORDS'
  if (ok === false && processed === 0) return 'FAILED_INPUT'
  if (ok === false && failed > 0) return 'FAILED_PROCESS_RECORDS'
  return 'SUCCESSFUL'
}

// Turns the report of one run into a stored instance. `taken` is the list of instances already kept, so an id is never used twice.
export function batchInstanceOf(report, { app, flow, now, ms = 0, ok, taken = [] }) {
  const total = Math.max(0, num(report.total, 0))
  const failed = Math.max(0, num(report.failed, 0))
  const processed = Math.max(0, num(report.processed, report.inputError ? 0 : total))
  const successful = Math.max(0, num(report.successful ?? report.ok, processed - failed))
  const length = Math.max(1000, num(report.ms, ms))
  const loadMs = Math.min(length, Math.max(0, num(report.loadMs, Math.round(length * 0.04))))
  const completeMs = Math.min(length - loadMs, Math.max(0, num(report.completeMs, Math.round(length * 0.01))))
  let id = String(report.instance ?? instanceIdOf(`${app.name}|${app.env}|${flow}|${now}`))
  for (let n = 2; taken.some((x) => x.id === id); n++) id = instanceIdOf(`${id}|${n}`)
  return {
    id,
    job: String(report.job ?? app.name),
    app: app.name,
    env: app.env,
    flow,
    status: statusOf(report, ok, processed, failed),
    start: now,
    loaded: now + loadMs,
    completing: now + length - completeMs,
    end: now + length,
    total,
    processed,
    successful,
    failed,
    blockSize: Math.max(1, num(report.blockSize, DEFAULT_BLOCK_SIZE)),
    maxFailedRecords: num(report.maxFailedRecords, 0),
    steps: (report.steps ?? []).map(stepOf),
    message: report.inputError ?? report.message ?? null,
  }
}

// The kept list with a new instance first
export const addInstance = (list, inst) => [inst, ...(list ?? []).filter((x) => x.id !== inst.id)].slice(0, MAX_INSTANCES)

// The counts of an instance cut at a share of its records, at a whole block
function cut(inst, share) {
  if (share >= 1) return inst
  const blocks = Math.ceil((inst.processed * Math.max(0, share)) / inst.blockSize)
  const processed = Math.min(inst.processed, blocks * inst.blockSize)
  const r = inst.processed ? processed / inst.processed : 0
  const part = (n) => Math.round(n * r)
  const failed = Math.min(processed, part(inst.failed))
  return {
    ...inst,
    processed,
    failed,
    successful: processed - failed,
    steps: inst.steps.map((x) => ({ ...x, processed: part(x.processed), failed: part(x.failed), errors: x.errors.map((e) => ({ ...e, count: part(e.count) })).filter((e) => e.count > 0) })),
  }
}

export const isExecuting = (inst, now) => !['STOPPED', 'FAILED_INPUT'].includes(inst.status) && now < inst.end

// An instance as the monitor shows it at `now`: while it runs, the status is EXECUTING and the counts are those reached
export function liveOf(inst, now) {
  if (!isExecuting(inst, now)) return { ...inst, phase: FINAL.includes(inst.status) ? 'Finished' : inst.status }
  const phase = now < inst.loaded ? 'Loading' : now < inst.completing ? 'Processing' : 'On Complete'
  const share = now < inst.loaded ? 0 : (now - inst.loaded) / Math.max(1, inst.completing - inst.loaded)
  return { ...cut(inst, share), status: 'EXECUTING', phase, final: inst.status }
}

// Stops an executing instance at the block it reached. Returns null when it is not executing.
export function stopInstance(inst, now) {
  if (!isExecuting(inst, now)) return null
  const live = liveOf(inst, now)
  const stopped = { ...live, status: 'STOPPED', end: now, completing: now, stoppedAt: now, stoppedIn: live.phase }
  delete stopped.phase
  delete stopped.final
  return stopped
}

// The errors of every step grouped by error type, the most frequent first
export function errorGroupsOf(inst) {
  const groups = {}
  for (const step of inst.steps ?? [])
    for (const e of step.errors) {
      const g = (groups[e.type] ??= { type: e.type, count: 0, steps: [], message: e.message, record: e.record })
      g.count += e.count
      g.steps.push({ step: step.name, count: e.count, message: e.message, record: e.record })
    }
  return Object.values(groups).sort((a, b) => b.count - a.count)
}

export const percent = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0)
export function durationText(ms) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`
}
