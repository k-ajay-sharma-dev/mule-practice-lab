// Anypoint Runtime Fabric: a Kubernetes cluster that Harbor runs itself (Amazon EKS), with nodes, pods, resource
// requests and limits, the scheduler, container restarts and Kubernetes events. Pure and import free. Lives in state.rtf.
//
// Shape of state.rtf once it is in use (a saved console may hold only the placeholder { created }):
//   { created, seq, instances: { 'harbor-rtf': { nodes: [{ name, ip, zone, since }], pods: [pod], events: [event] } } }
//   pod   = { name, app, env, config, node (index or null), phase, created, scheduled, started, restarts, streak,
//             last: { reason, code, started, finished } | null, backoff, why, crash, mem, cpu, prev: [log lines] }
//   event = { t, last, count, type, reason, obj, ns, msg }
// An application on Runtime Fabric has app.rtf = { instance, cpu, limit, memory, spread, lastMile }: vCores reserved,
// vCore limit, memory in GB (request and limit, the Mule heap is part of it), "Enforce deploying replicas across nodes"
// and last-mile security. app.store.rtfResidentMi is memory the app keeps resident (a cache), and a package that runs
// a big job writes app.store.rtfPeakMi for the minute it runs, so the pod can pass its limit and be OOMKilled.

const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
const BASE = Date.UTC(2026, 10, 2) // the same day zero as platform.js
const MAX_EVENTS = 60
const MAX_NODES = 6

export const RTF = 'harbor-rtf'
// RTF uses the environment ID as the namespace of the apps of that environment
export const NAMESPACES = { Sandbox: 'b7c4e2a0-1f6d-4c39-9a8e-5d2f7e61c0a4', Production: '3e9d1c57-8a2b-4f60-b1d4-7c0e95a2f318' }
const ENV_OF_NS = Object.fromEntries(Object.entries(NAMESPACES).map(([k, v]) => [v, k]))
// sample versions
export const INSTANCES = [{ name: RTF, status: 'Active', version: '2.11.4', k8s: 'v1.31.4-eks-0f56d01', vendor: 'Amazon EKS', region: 'us-east-2', envs: ['Sandbox', 'Production'], domain: 'rtf.harbor.lab', ingressClass: 'rtf-nginx' }]
// m5.large: 2 vCPU and 8 GiB. Allocatable is what is left after the kubelet and the system reserve.
export const NODE = { type: 'm5.large', cpu: 2000, mem: 7725, allocCpu: 1930, allocMem: 7051, pods: 29 }
export const RTF_CPU = [0.1, 0.2, 0.5, 1, 1.5, 2]
export const RTF_LIMIT = [0.5, 1, 1.5, 2, 3, 4]
export const RTF_MEMORY = [0.7, 1, 1.5, 2, 3, 4]
// lab-made: an idle Mule 4 runtime with its monitoring sidecar uses about this much of the container memory
export const MULE_BASE_MI = 420
export const rtfDefaults = () => ({ instance: RTF, cpu: 0.5, limit: 1, memory: 1.5, spread: true, lastMile: false })

const NODES = [
  { name: 'ip-10-20-1-14.us-east-2.compute.internal', ip: '10.20.1.14', zone: 'us-east-2a', since: -41 * DAY },
  { name: 'ip-10-20-2-87.us-east-2.compute.internal', ip: '10.20.2.87', zone: 'us-east-2b', since: -41 * DAY },
  { name: 'ip-10-20-3-112.us-east-2.compute.internal', ip: '10.20.3.112', zone: 'us-east-2c', since: -41 * DAY },
]
const MORE_NODES = [
  ['ip-10-20-1-203', '10.20.1.203', 'us-east-2a'],
  ['ip-10-20-2-41', '10.20.2.41', 'us-east-2b'],
  ['ip-10-20-3-58', '10.20.3.58', 'us-east-2c'],
]
// [namespace, name, cpu request m, memory request Mi, cpu use m, memory use Mi]
const DAEMONS = [
  ['kube-system', 'aws-node', 25, 40, 3, 38],
  ['kube-system', 'kube-proxy', 100, 40, 1, 22],
]
const PLACED = [
  [['rtf', 'agent', 100, 200, 6, 180], ['kube-system', 'coredns', 100, 70, 2, 24], ['ingress-nginx', 'ingress-nginx-controller', 100, 90, 4, 110]],
  [['rtf', 'resource-cache', 50, 64, 1, 30], ['kube-system', 'coredns', 100, 70, 2, 23], ['ingress-nginx', 'ingress-nginx-controller', 100, 90, 4, 104]],
  [['rtf', 'cluster-status-exporter', 50, 50, 1, 26], ['kube-system', 'ebs-csi-controller', 100, 120, 2, 48]],
]

// ---------- small helpers ----------

const ABC = 'bcdfghjklmnpqrstvwxz2456789' // the alphabet Kubernetes uses for generated names
function hash(text, n = 5) {
  let x = 2166136261
  for (const c of String(text)) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0
  let out = ''
  for (let i = 0; i < n; i++) {
    out += ABC[x % ABC.length]
    x = Math.imul(x ^ (i + 0x9e37), 2654435761) >>> 0
  }
  return out
}
const pad = (n, w = 2) => String(n).padStart(w, '0')
const k8sDate = (t) => new Date(BASE + t).toUTCString().replace('GMT', '+0000')
const logStamp = (t) => {
  const d = new Date(BASE + t)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())},${pad(d.getUTCMilliseconds(), 3)}`
}
// the way kubectl prints an age: 45s, 3m20s, 62m, 5h10m, 41d
export function age(ms) {
  const s = Math.max(0, Math.floor(ms / SECOND))
  if (s < 120) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 10) return s % 60 ? `${m}m${s % 60}s` : `${m}m`
  if (m < 180) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 8) return m % 60 ? `${h}h${m % 60}m` : `${h}h`
  if (h < 48) return `${h}h`
  const d = Math.floor(h / 24)
  return h < 192 && h % 24 ? `${d}d${h % 24}h` : `${d}d`
}
export const cpuText = (m) => (m % 1000 === 0 ? `${m / 1000}` : `${Math.round(m)}m`)
export const memText = (mi) => (mi % 1024 === 0 ? `${mi / 1024}Gi` : `${Math.round(mi)}Mi`)
const table = (rows) => {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)))
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(w[i] + 3))).join('').trimEnd()).join('\n')
}

// ---------- state ----------

export const defaultRtf = (now) => ({ created: now })
const freshInstances = () => ({ [RTF]: { nodes: NODES.map((n) => ({ ...n })), pods: [], events: [] } })
// A console saved while this module was a placeholder has state.rtf = { created }. Ticks and actions write the cluster
// into their draft the first time they need it.
export function upgradeRtf(s) {
  s.rtf ??= defaultRtf(s.clock ?? 0)
  s.rtf.instances ??= freshInstances()
  s.rtf.seq ??= 1
  return s.rtf
}
let VIEW = null
// state.rtf for reading, without writing the default cluster into the saved state
export const rtfView = (state) => (state?.rtf?.instances ? state.rtf : (VIEW ??= { created: 0, seq: 1, instances: freshInstances() }))
export const instanceMeta = (name) => INSTANCES.find((i) => i.name === name) ?? null
export const instanceOf = (state, name = RTF) => {
  const meta = instanceMeta(name)
  const inst = rtfView(state).instances[name]
  return meta && inst ? { ...meta, ...inst } : null
}
export const rtfTargets = (state, env) => INSTANCES.filter((i) => i.envs.includes(env ?? state?.env))
export const isRtfTarget = (name) => INSTANCES.some((i) => i.name === name)
export const rtfApps = (state, name = RTF) => (state?.apps ?? []).filter((a) => a.rtf?.instance === name)
export const podsOf = (state, app, env = 'Sandbox', name = RTF) => (rtfView(state).instances[name]?.pods ?? []).filter((p) => p.app === app && p.env === env)
// The ingress host of an app. It has the same -lab1a2.sbx. shape as the other endpoints, so apps can call it.
export const rtfEndpoint = (app) => `https://${app.name}-lab1a2.${app.env === 'Production' ? 'prd' : 'sbx'}.${instanceMeta(app.rtf?.instance)?.domain ?? 'rtf.harbor.lab'}`

const reqOf = (app) => ({ cpu: Math.round((app?.rtf?.cpu ?? 0.5) * 1000), lim: Math.round((app?.rtf?.limit ?? 1) * 1000), mem: Math.round((app?.rtf?.memory ?? 1) * 1024) })
const systemOn = (i) => [...DAEMONS, ...(PLACED[i] ?? [])]
export const systemPods = (inst) =>
  inst.nodes.flatMap((node, i) =>
    systemOn(i).map(([ns, base, cpu, mem, useCpu, useMem]) => ({
      name: DAEMONS.some((d) => d[1] === base) ? `${base}-${hash(base + node.name)}` : `${base}-${hash(base, 9)}-${hash(base + i)}`,
      ns, node: i, cpu, mem, lim: base === 'coredns' ? 170 : mem, useCpu, useMem, since: node.since,
    })),
  )
const appOf = (s, pod) => s.apps?.find((a) => a.name === pod.app && a.env === pod.env)

// what the pods on a node have asked for, and what they use
export function nodeUse(state, inst, i) {
  const sys = systemPods(inst).filter((p) => p.node === i)
  const pods = inst.pods.filter((p) => p.node === i)
  const out = { reqCpu: 0, reqMem: 0, limCpu: 0, limMem: 0, useCpu: 60, useMem: 610, pods: sys.length + pods.length }
  for (const p of sys) Object.assign(out, { reqCpu: out.reqCpu + p.cpu, reqMem: out.reqMem + p.mem, limMem: out.limMem + p.lim, useCpu: out.useCpu + p.useCpu, useMem: out.useMem + p.useMem })
  for (const p of pods) {
    const r = reqOf(appOf(state, p))
    out.reqCpu += r.cpu
    out.reqMem += r.mem
    out.limCpu += r.lim
    out.limMem += r.mem
    if (p.phase === 'Running') {
      out.useCpu += p.cpu ?? 0
      out.useMem += p.mem ?? 0
    }
  }
  return out
}

function event(inst, now, type, reason, obj, ns, msg) {
  const same = inst.events.find((e) => e.obj === obj && e.reason === reason && e.msg === msg)
  if (same) {
    same.count += 1
    same.last = now
    return
  }
  inst.events.push({ t: now, last: now, count: 1, type, reason, obj, ns, msg })
  if (inst.events.length > MAX_EVENTS) inst.events.splice(0, inst.events.length - MAX_EVENTS)
}

// ---------- the scheduler ----------

// Filters every node the way the default scheduler does and picks the one with the most free CPU (LeastAllocated).
// "Enforce deploying replicas across nodes" is modelled as a required pod anti-affinity on the hostname.
function place(s, inst, pod, now) {
  const app = appOf(s, pod)
  const need = reqOf(app)
  const counts = {}
  let best = null
  let bestFree = -1
  inst.nodes.forEach((node, i) => {
    const u = nodeUse(s, inst, i)
    const miss = []
    if (app?.rtf?.spread && inst.pods.some((p) => p !== pod && p.app === pod.app && p.env === pod.env && p.node === i)) miss.push("node(s) didn't match pod anti-affinity rules")
    else {
      if (u.reqCpu + need.cpu > NODE.allocCpu) miss.push('Insufficient cpu')
      if (u.reqMem + need.mem > NODE.allocMem) miss.push('Insufficient memory')
      if (u.pods + 1 > NODE.pods) miss.push('Too many pods')
    }
    for (const m of miss) counts[m] = (counts[m] ?? 0) + 1
    const free = NODE.allocCpu - u.reqCpu
    if (!miss.length && free > bestFree) [best, bestFree] = [i, free]
  })
  const ns = NAMESPACES[pod.env]
  if (best === null) {
    const why = `0/${inst.nodes.length} nodes are available: ${Object.entries(counts).map(([m, n]) => `${n} ${m}`).sort().join(', ')}.`
    pod.why = why
    event(inst, now, 'Warning', 'FailedScheduling', `pod/${pod.name}`, ns, why)
    return false
  }
  Object.assign(pod, { node: best, phase: 'ContainerCreating', scheduled: now, why: null })
  event(inst, now, 'Normal', 'Scheduled', `pod/${pod.name}`, ns, `Successfully assigned ${ns}/${pod.name} to ${inst.nodes[best].name}`)
  return true
}

function start(inst, pod, now, again, app) {
  Object.assign(pod, { phase: 'Running', started: now, backoff: null })
  const ns = NAMESPACES[pod.env]
  if (!again) event(inst, now, 'Normal', 'Pulled', `pod/${pod.name}`, ns, 'Container image "rtf-runtime-registry.kprod.msap.io/mulesoft/poseidon-runtime" already present on machine')
  event(inst, now, 'Normal', 'Started', `pod/${pod.name}`, ns, 'Started container app')
  // a restarted container boots the runtime again, and its log says so
  if (again && app?.logs) {
    app.logs.push({ t: now, level: 'INFO', text: `Started app '${app.name}'`, logger: 'org.mule.runtime.deployment', config: pod.config }, { t: now, level: 'INFO', text: 'Mule is up and kicking (every 5000ms)', logger: 'org.mule.runtime.module.launcher', config: pod.config })
    if (app.logs.length > 120) app.logs.splice(0, app.logs.length - 120)
  }
}

// The kernel ends a container that passes its memory limit with SIGKILL: exit code 137, reason OOMKilled.
function kill(s, inst, pod, now, reason, code) {
  const app = appOf(s, pod)
  pod.streak = now - (pod.started ?? now) >= 10 * MINUTE ? 1 : (pod.streak ?? 0) + 1
  pod.restarts = (pod.restarts ?? 0) + 1
  pod.last = { reason, code, started: pod.started, finished: now }
  pod.prev = (app?.logs ?? []).filter((l) => l.t >= (pod.started ?? 0) && podLine(app, pod, l)).slice(-14)
  // the kubelet waits 10 s, 20 s, 40 s and so on up to 5 minutes before the next start
  pod.backoff = now + Math.min(300, 10 * 2 ** (pod.streak - 1)) * SECOND
  Object.assign(pod, { phase: 'Terminated', mem: 0, cpu: 0 })
  if (app) app.restarts = (app.restarts ?? 0) + 1
  if (reason === 'OOMKilled') event(inst, now, 'Warning', 'OOMKilling', `node/${inst.nodes[pod.node]?.name}`, '', `Memory cgroup out of memory: Killed process (java) in container app of pod ${pod.name}`)
}

// The ReplicaSet of the pods: an update that only changes the replica count keeps it (app.podConfig), so the running
// pods stay and keep their names. Any other update makes a new ReplicaSet with new pods.
const genOf = (app) => app.podConfig ?? app.config
const podGen = (p) => p.gen ?? p.config
// the log lines of a pod: those of its configuration, and those of later scale-only configurations of the same ReplicaSet
const podLine = (app, p, l) => l.config === p.config || (app != null && podGen(p) === genOf(app) && l.config > p.config && l.config <= app.config)

function newPod(s, inst, app, now) {
  const n = s.rtf.seq++
  return { name: `${app.name.slice(0, 40)}-${hash(app.name + genOf(app), 9)}-${hash(`${app.name}:${n}`)}`, app: app.name, env: app.env, config: app.config, gen: genOf(app), node: null, phase: 'Pending', created: now, restarts: 0, last: null, crash: app.rtfCrash ?? null, mem: 0, cpu: 0 }
}

// pods follow the replicas and the configuration of their app; a stopped, deleted or moved app loses its pods
function reconcile(s, name, inst, now) {
  const meta = instanceMeta(name) ?? INSTANCES[0]
  const keep = []
  for (const p of inst.pods) {
    const a = appOf(s, p)
    if (a?.status === 'Starting' && a.rtf?.instance === meta.name) keep.push(p) // a deployment is in progress: the old pods keep serving
    else if (a && a.rtf?.instance === meta.name && a.status !== 'Stopped' && podGen(p) === genOf(a)) keep.push(p)
    else event(inst, now, 'Normal', 'Killing', `pod/${p.name}`, NAMESPACES[p.env], 'Stopping container app')
  }
  inst.pods = keep
  for (const a of s.apps.filter((x) => x.rtf?.instance === meta.name && meta.envs.includes(x.env) && x.status !== 'Stopped' && x.status !== 'Starting')) {
    const mine = inst.pods.filter((p) => p.app === a.name && p.env === a.env)
    for (let i = mine.length; i < (a.replicas ?? 1); i++) inst.pods.push(newPod(s, inst, a, now))
    for (const extra of mine.slice(a.replicas ?? 1)) {
      inst.pods = inst.pods.filter((p) => p !== extra)
      event(inst, now, 'Normal', 'Killing', `pod/${extra.name}`, NAMESPACES[extra.env], 'Stopping container app')
    }
  }
  for (const p of inst.pods.filter((x) => x.phase === 'Pending').sort((x, y) => x.created - y.created)) place(s, inst, p, now)
}

// memory and CPU of a running pod: the runtime, what the app keeps resident, the load, and a big job of this minute
function usage(s, inst, now) {
  for (const a of s.apps.filter((x) => x.rtf?.instance && inst.pods.some((p) => p.app === x.name && p.env === x.env))) {
    const running = inst.pods.filter((p) => p.app === a.name && p.env === a.env && p.phase === 'Running')
    const perMinute = (s.traffic ?? []).filter((x) => x.app === a.name && x.env === a.env).reduce((n, x) => n + x.perMinute, 0)
    const each = running.length ? perMinute / running.length : 0
    const r = reqOf(a)
    running.forEach((p, i) => {
      const peak = i === 0 ? (a.store?.rtfPeakMi ?? 0) : 0 // lab-made: the scheduler of the app runs its job on one replica
      p.mem = Math.round(MULE_BASE_MI + (a.store?.rtfResidentMi ?? 0) + Math.min(700, each * 1.2) + peak)
      p.cpu = Math.min(r.lim, Math.round(6 + each * 1.5 + (peak ? r.lim * 0.9 : 0)))
      if (p.mem > r.mem) kill(s, inst, p, now, 'OOMKilled', 137)
      else if (p.crash && now - p.started >= MINUTE) kill(s, inst, p, now, 'Error', 1)
    })
    if (a.store?.rtfPeakMi) delete a.store.rtfPeakMi
  }
}

// An app on Runtime Fabric is Running while at least one replica is ready and serves. With no ready replica it is
// Failed, with the reason of its pods. lab-made: Runtime Manager also shows the ready count, on the Runtime Fabric page.
function settle(s, name, inst, app) {
  if (!app.rtf || app.status === 'Stopped' || app.status === 'Starting' || !instanceMeta(name)?.envs.includes(app.env)) return
  const pods = inst.pods.filter((p) => p.app === app.name && p.env === app.env)
  const ready = pods.filter((p) => p.phase === 'Running').length
  if (app.rtfCrash) {
    Object.assign(app, { status: 'Failed', error: app.rtfCrash })
    return
  }
  if (ready > 0) {
    if (app.status !== 'Running') app.started = s.clock
    Object.assign(app, { status: 'Running', error: null })
    return
  }
  const pending = pods.find((p) => p.phase === 'Pending')
  const crashed = pods.find((p) => p.last && p.phase !== 'ContainerCreating')
  // pods that found a node and are starting keep the status the app has
  if (!pending && !crashed) return
  const n = app.replicas ?? 1
  const error = pending
    ? `0 of ${n} replicas are ready. Pod ${pending.name} is Pending: ${pending.why ?? 'waiting for a node'}`
    : `0 of ${n} replicas are ready. Pod ${crashed.name} is in CrashLoopBackOff. Last State: Terminated, Reason: ${crashed.last.reason}, Exit Code: ${crashed.last.code}.`
  Object.assign(app, { status: 'Failed', error })
}

function tickInstance(s, name, inst, now) {
  reconcile(s, name, inst, now)
  for (const p of inst.pods) {
    if (p.phase === 'ContainerCreating' && now - p.scheduled >= MINUTE) start(inst, p, now)
    else if (p.phase === 'Terminated' || p.phase === 'CrashLoopBackOff') {
      if (now >= p.backoff) start(inst, p, now, true, appOf(s, p))
      else if (p.phase === 'Terminated') {
        p.phase = 'CrashLoopBackOff'
        event(inst, now, 'Warning', 'BackOff', `pod/${p.name}`, NAMESPACES[p.env], `Back-off restarting failed container app in pod ${p.name}_${NAMESPACES[p.env]}`)
      }
    }
  }
  usage(s, inst, now)
  for (const a of s.apps) if (a.rtf?.instance === name) settle(s, name, inst, a)
}

// runs once a lab minute while state.rtf exists; it does nothing until an app is deployed to Runtime Fabric
export function rtfTick(s) {
  if (!s.rtf || (!s.rtf.instances && !s.apps?.some((a) => a.rtf?.instance))) return s
  upgradeRtf(s)
  for (const [name, inst] of Object.entries(s.rtf.instances)) if (inst.pods.length || s.apps.some((a) => a.rtf?.instance === name)) tickInstance(s, name, inst, s.clock)
  return s
}

// ---------- deploy from Runtime Manager ----------

export function rtfDeployErrors(state, form) {
  const r = form.rtf
  const meta = instanceMeta(r?.instance ?? form.target)
  if (!meta) return [`There is no Runtime Fabric named ${r?.instance ?? form.target}.`]
  const errors = []
  if (!meta.envs.includes(state.env)) errors.push(`Runtime Fabric ${meta.name} is not associated with the environment ${state.env}.`)
  if (!(r.cpu > 0 && r.cpu <= 4)) errors.push('vCores reserved is 0.1 to 4.')
  if (!(r.limit >= r.cpu)) errors.push('The vCore limit must be at least the vCores reserved.')
  if (!(r.memory >= 0.7 && r.memory <= 16)) errors.push('Memory is 0.7 GB to 16 GB.')
  return errors
}

// Called from boot() in platform.js after the runtime checked the app. The new configuration gets new pods and the old
// ones go. lab-made: the image is on the node already, so a pod that finds a node is ready in the same minute, and the
// rolling update of the Deployment is done in one step.
export function rtfDeploy(s, app) {
  upgradeRtf(s)
  const inst = s.rtf.instances[app.rtf.instance]
  const meta = instanceMeta(app.rtf.instance)
  if (!inst || !meta?.envs.includes(app.env)) {
    Object.assign(app, { status: 'Failed', error: `Runtime Fabric ${app.rtf.instance} is not associated with the environment ${app.env}.` })
    return s
  }
  app.vCores = app.rtf.cpu
  if (app.status === 'Failed') app.rtfCrash = app.error
  else delete app.rtfCrash
  reconcile(s, meta.name, inst, s.clock)
  for (const p of inst.pods) if (p.app === app.name && p.env === app.env && p.phase === 'ContainerCreating') start(inst, p, s.clock)
  settle(s, meta.name, inst, app)
  return s
}

// Lab action: the node group of the EKS cluster gets one more node, and the scheduler can use it at once
export function addNode(state, name = RTF) {
  const s = structuredClone(state)
  const inst = upgradeRtf(s).instances[name]
  if (!inst || inst.nodes.length >= MAX_NODES) return { state, error: `The node group of ${name} has its maximum of ${MAX_NODES} nodes.` }
  const [host, ip, zone] = MORE_NODES[inst.nodes.length - NODES.length] ?? MORE_NODES[0]
  const node = { name: `${host}.us-east-2.compute.internal`, ip, zone, since: s.clock }
  inst.nodes.push(node)
  event(inst, s.clock, 'Normal', 'RegisteredNode', `node/${node.name}`, '', `Node ${node.name} event: Registered Node ${node.name} in Controller`)
  reconcile(s, name, inst, s.clock)
  return { state: s, error: null }
}

// ---------- kubectl ----------

const HELP = [
  'The lab answers these kubectl commands:',
  '  kubectl get nodes',
  '  kubectl describe node <node>',
  '  kubectl get pods -n <namespace>      (or -A for every namespace)',
  '  kubectl describe pod <pod> -n <namespace>',
  '  kubectl logs <pod> -n <namespace> [--previous]',
  '  kubectl top pods -n <namespace>',
  '  kubectl top nodes',
  '  kubectl get events -n <namespace>',
].join('\n')

const STATUS = (p) => (p.phase === 'Terminated' ? p.last?.reason ?? 'Error' : p.phase)
const nodeName = (inst, p) => (p.node === null || p.node === undefined ? '<none>' : inst.nodes[p.node]?.name ?? '<none>')
function allPods(s, inst) {
  const sys = systemPods(inst).map((p) => ({ ns: p.ns, name: p.name, ready: '1/1', status: 'Running', restarts: '0', age: age(s.clock - p.since), cpu: p.useCpu, mem: p.useMem, node: inst.nodes[p.node].name, system: p }))
  const apps = inst.pods.map((p) => ({
    ns: NAMESPACES[p.env],
    name: p.name,
    ready: `${p.phase === 'Running' ? 2 : p.phase === 'Pending' || p.phase === 'ContainerCreating' ? 0 : 1}/2`,
    status: STATUS(p),
    restarts: p.restarts ? `${p.restarts} (${age(s.clock - p.last.finished)} ago)` : '0',
    age: age(s.clock - p.created),
    cpu: p.cpu,
    mem: p.mem,
    node: nodeName(inst, p),
    pod: p,
  }))
  return [...sys, ...apps]
}

function parse(line) {
  const words = line.trim().split(/\s+/).filter(Boolean)
  if (words[0] === 'kubectl') words.shift()
  const out = { args: [], ns: null, all: false, previous: false, container: null, wide: false }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w === '-n' || w === '--namespace') out.ns = words[++i] ?? ''
    else if (w.startsWith('--namespace=')) out.ns = w.slice(12)
    else if (w === '-A' || w === '--all-namespaces') out.all = true
    else if (w === '-p' || w === '--previous' || w === '--previous=true') out.previous = true
    else if (w === '-c' || w === '--container') out.container = words[++i] ?? ''
    else if (w === '-o') out.wide = words[++i] === 'wide'
    else if (w === '-owide' || w === '-o=wide' || w === '--output=wide') out.wide = true
    else if (w.startsWith('--sort-by') || w.startsWith('--tail') || w === '--watch=false') continue
    else out.args.push(w)
  }
  return out
}
const KINDS = { pods: 'pods', pod: 'pods', po: 'pods', nodes: 'nodes', node: 'nodes', no: 'nodes', events: 'events', event: 'events', ev: 'events' }

function describeNode(s, inst, i) {
  const node = inst.nodes[i]
  const u = nodeUse(s, inst, i)
  const pct = (a, b) => `${Math.round((a / b) * 100)}%`
  const rows = [['Namespace', 'Name', 'CPU Requests', 'CPU Limits', 'Memory Requests', 'Memory Limits', 'Age']]
  for (const p of systemPods(inst).filter((x) => x.node === i)) rows.push([p.ns, p.name, `${cpuText(p.cpu)} (${pct(p.cpu, NODE.allocCpu)})`, '0 (0%)', `${memText(p.mem)} (${pct(p.mem, NODE.allocMem)})`, `${memText(p.lim)} (${pct(p.lim, NODE.allocMem)})`, age(s.clock - p.since)])
  for (const p of inst.pods.filter((x) => x.node === i)) {
    const r = reqOf(appOf(s, p))
    rows.push([NAMESPACES[p.env], p.name, `${cpuText(r.cpu)} (${pct(r.cpu, NODE.allocCpu)})`, `${cpuText(r.lim)} (${pct(r.lim, NODE.allocCpu)})`, `${memText(r.mem)} (${pct(r.mem, NODE.allocMem)})`, `${memText(r.mem)} (${pct(r.mem, NODE.allocMem)})`, age(s.clock - p.created)])
  }
  const indent = (text) => text.split('\n').map((l) => `  ${l}`).join('\n')
  return [
    `Name:               ${node.name}`,
    'Roles:              <none>',
    `Labels:             node.kubernetes.io/instance-type=${NODE.type}`,
    `                    topology.kubernetes.io/zone=${node.zone}`,
    `                    kubernetes.io/hostname=${node.name}`,
    `CreationTimestamp:  ${k8sDate(node.since)}`,
    'Conditions:',
    '  Type             Status  Reason                       Message',
    '  ----             ------  ------                       -------',
    '  MemoryPressure   False   KubeletHasSufficientMemory   kubelet has sufficient memory available',
    '  DiskPressure     False   KubeletHasNoDiskPressure     kubelet has no disk pressure',
    '  PIDPressure      False   KubeletHasSufficientPID      kubelet has sufficient PID available',
    '  Ready            True    KubeletReady                 kubelet is posting ready status',
    'Addresses:',
    `  InternalIP:  ${node.ip}`,
    'Capacity:',
    `  cpu:                ${NODE.cpu / 1000}`,
    `  memory:             ${NODE.mem * 1024}Ki`,
    `  pods:               ${NODE.pods}`,
    'Allocatable:',
    `  cpu:                ${NODE.allocCpu}m`,
    `  memory:             ${NODE.allocMem * 1024}Ki`,
    `  pods:               ${NODE.pods}`,
    `Non-terminated Pods:          (${rows.length - 1} in total)`,
    indent(table(rows)),
    'Allocated resources:',
    '  (Total limits may be over 100 percent, i.e., overcommitted.)',
    indent(table([['Resource', 'Requests', 'Limits'], ['--------', '--------', '------'], ['cpu', `${u.reqCpu}m (${pct(u.reqCpu, NODE.allocCpu)})`, `${u.limCpu}m (${pct(u.limCpu, NODE.allocCpu)})`], ['memory', `${u.reqMem}Mi (${pct(u.reqMem, NODE.allocMem)})`, `${u.limMem}Mi (${pct(u.limMem, NODE.allocMem)})`]])),
    'Events:              <none>',
  ].join('\n')
}

function podEvents(s, inst, p) {
  const list = inst.events.filter((e) => e.obj === `pod/${p.name}`)
  if (!list.length) return 'Events:            <none>'
  const rows = [['Type', 'Reason', 'Age', 'From', 'Message'], ['----', '------', '----', '----', '-------']]
  for (const e of list) rows.push([e.type, e.reason, e.count > 1 ? `${age(s.clock - e.last)} (x${e.count} over ${age(s.clock - e.t)})` : age(s.clock - e.t), e.reason === 'Scheduled' || e.reason === 'FailedScheduling' ? 'default-scheduler' : 'kubelet', e.msg])
  return `Events:\n${table(rows).split('\n').map((l) => `  ${l}`).join('\n')}`
}

function describePod(s, inst, p) {
  const app = appOf(s, p)
  const r = reqOf(app)
  const node = p.node === null ? null : inst.nodes[p.node]
  const ns = NAMESPACES[p.env]
  const ready = p.phase === 'Running'
  const state =
    p.phase === 'Running'
      ? ['    State:          Running', `      Started:      ${k8sDate(p.started)}`]
      : p.phase === 'Terminated'
        ? ['    State:          Terminated', `      Reason:       ${p.last.reason}`, `      Exit Code:    ${p.last.code}`]
        : p.phase === 'CrashLoopBackOff'
          ? ['    State:          Waiting', '      Reason:       CrashLoopBackOff']
          : ['    State:          Waiting', '      Reason:       ContainerCreating']
  const last = p.last
    ? ['    Last State:     Terminated', `      Reason:       ${p.last.reason}`, `      Exit Code:    ${p.last.code}`, `      Started:      ${k8sDate(p.last.started ?? p.created)}`, `      Finished:     ${k8sDate(p.last.finished)}`]
    : []
  return [
    `Name:             ${p.name}`,
    `Namespace:        ${ns}`,
    'Priority:         0',
    `Service Account:  ${p.app}`,
    `Node:             ${node ? `${node.name}/${node.ip}` : '<none>'}`,
    ...(p.scheduled ? [`Start Time:       ${k8sDate(p.scheduled)}`] : []),
    `Labels:           app=${p.app}`,
    `                  rtf.mulesoft.com/env=${p.env}`,
    '                  rtf.mulesoft.com/agentNamespace=rtf',
    `Status:           ${p.phase === 'Pending' ? 'Pending' : 'Running'}`,
    `Controlled By:    ReplicaSet/${p.name.replace(/-[^-]+$/, '')}`,
    'Containers:',
    '  app:',
    `    Image:          rtf-runtime-registry.kprod.msap.io/mulesoft/poseidon-runtime-${app?.version ?? '4.9'}.0:v1.2.94`,
    '    Port:           8081/TCP',
    ...(p.phase === 'Pending' ? ['    State:          Waiting', '      Reason:       (none)'] : state),
    ...last,
    `    Ready:          ${ready ? 'True' : 'False'}`,
    `    Restart Count:  ${p.restarts ?? 0}`,
    '    Limits:',
    `      cpu:     ${cpuText(r.lim)}`,
    `      memory:  ${memText(r.mem)}`,
    '    Requests:',
    `      cpu:        ${cpuText(r.cpu)}`,
    `      memory:     ${memText(r.mem)}`,
    '  anypoint-monitoring:',
    `    State:          ${p.phase === 'Pending' ? 'Waiting' : 'Running'}`,
    `    Ready:          ${p.phase === 'Pending' || p.phase === 'ContainerCreating' ? 'False' : 'True'}`,
    'Conditions:',
    '  Type              Status',
    `  Initialized       ${p.phase === 'Pending' ? 'False' : 'True'}`,
    `  Ready             ${ready ? 'True' : 'False'}`,
    `  ContainersReady   ${ready ? 'True' : 'False'}`,
    `  PodScheduled      ${p.phase === 'Pending' ? 'False' : 'True'}`,
    `QoS Class:         ${r.cpu === r.lim ? 'Guaranteed' : 'Burstable'}`,
    ...(app?.rtf?.spread ? [`Affinity:          required pod anti-affinity on kubernetes.io/hostname for app=${p.app} (Enforce deploying replicas across nodes)`] : []),
    podEvents(s, inst, p),
  ].join('\n')
}

const logText = (lines, app) => lines.map((l) => `${l.level.padEnd(5)} ${logStamp(l.t)} [[MuleRuntime].uber.01: [${app}]] ${l.logger ?? 'org.mule.runtime'}: ${l.text}`).join('\n')

// One kubectl command against the cluster. Returns the next state, with the seen keys the labs check, and the output.
export function kubectl(state, line, name = RTF) {
  const s = structuredClone(state)
  const see = (key) => {
    if (s.seen && !s.seen[key]) s.seen[key] = s.clock
  }
  const answer = (out) => ({ state: s, out })
  const inst = { ...instanceMeta(name), ...rtfView(s).instances[name] }
  const cmd = parse(line)
  const [verb, kind0, target0] = cmd.args
  let kind = kind0
  let target = target0
  if (kind?.includes('/')) [kind, target] = kind.split('/')
  const k = KINDS[kind]
  if (!verb || verb === 'help' || verb === '--help') return answer(HELP)
  const nsPods = () => allPods(s, inst).filter((p) => cmd.all || p.ns === (cmd.ns ?? 'default'))
  const noNs = () => `No resources found in ${cmd.ns ?? 'default'} namespace.`
  const findPod = () => inst.pods.find((p) => p.name === target && (NAMESPACES[p.env] === (cmd.ns ?? 'default')))
  if (verb === 'get') {
    if (!k) return answer(`error: the server doesn't have a resource type "${kind ?? ''}"`)
    if (k === 'nodes') {
      see('rtf-kubectl:get-nodes')
      const head = ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION', ...(cmd.wide ? ['INTERNAL-IP', 'OS-IMAGE'] : [])]
      return answer(table([head, ...inst.nodes.map((n) => [n.name, 'Ready', '<none>', age(s.clock - n.since), inst.k8s, ...(cmd.wide ? [n.ip, 'Amazon Linux 2023'] : [])])]))
    }
    if (k === 'pods') {
      const list = nsPods()
      if (!list.length) return answer(noNs())
      see('rtf-kubectl:get-pods')
      for (const p of list) if (p.pod) see(`rtf-pods:${p.pod.app}`)
      const head = [...(cmd.all ? ['NAMESPACE'] : []), 'NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(cmd.wide ? ['NODE'] : [])]
      return answer(table([head, ...list.map((p) => [...(cmd.all ? [p.ns] : []), p.name, p.ready, p.status, p.restarts, p.age, ...(cmd.wide ? [p.node] : [])])]))
    }
    const list = inst.events.filter((e) => cmd.all || e.ns === (cmd.ns ?? 'default'))
    if (!list.length) return answer(noNs())
    see('rtf-kubectl:events')
    return answer(table([[...(cmd.all ? ['NAMESPACE'] : []), 'LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'], ...list.sort((a, b) => a.last - b.last).map((e) => [...(cmd.all ? [e.ns || 'default'] : []), age(s.clock - e.last), e.type, e.reason, e.obj, e.msg])]))
  }
  if (verb === 'describe') {
    if (k === 'nodes') {
      const list = target ? inst.nodes.map((n, i) => [n, i]).filter(([n]) => n.name === target) : inst.nodes.map((n, i) => [n, i])
      if (!list.length) return answer(`Error from server (NotFound): nodes "${target}" not found`)
      see('rtf-kubectl:describe-node')
      return answer(list.map(([, i]) => describeNode(s, inst, i)).join('\n\n'))
    }
    if (k === 'pods') {
      if (!target) return answer('error: the lab describes one pod at a time: kubectl describe pod <pod> -n <namespace>')
      const p = findPod()
      if (!p) return answer(`Error from server (NotFound): pods "${target}" not found`)
      see('rtf-kubectl:describe')
      see(`rtf-describe:${p.app}`)
      if (p.phase === 'Pending') see(`rtf-pending:${p.app}`)
      if (p.last?.reason === 'OOMKilled') see(`rtf-oom:${p.app}`)
      return answer(describePod(s, inst, p))
    }
    return answer(`error: the server doesn't have a resource type "${kind ?? ''}"`)
  }
  if (verb === 'logs') {
    target = kind0?.includes('/') ? target : kind0
    const p = inst.pods.find((x) => x.name === target && NAMESPACES[x.env] === (cmd.ns ?? 'default'))
    if (!p) return answer(`Error from server (NotFound): pods "${target ?? ''}" not found`)
    if (cmd.container && cmd.container !== 'app') return answer(cmd.container === 'anypoint-monitoring' ? 'The lab does not keep the logs of the monitoring sidecar.' : `error: container ${cmd.container} is not valid for pod ${p.name}`)
    const head = cmd.container ? '' : 'Defaulted container "app" out of: app, anypoint-monitoring\n'
    see('rtf-kubectl:logs')
    if (cmd.previous) {
      if (!p.last) return answer(`${head}Error from server (BadRequest): previous terminated container "app" in pod "${p.name}" not found`)
      see(`rtf-logs-previous:${p.app}`)
      return answer(head + logText(p.prev ?? [], p.app))
    }
    if (p.phase !== 'Running') return answer(`${head}Error from server (BadRequest): container "app" in pod "${p.name}" is waiting to start: ${p.phase === 'CrashLoopBackOff' || p.phase === 'Terminated' ? 'CrashLoopBackOff' : 'ContainerCreating'}`)
    const app = appOf(s, p)
    return answer(head + logText((app?.logs ?? []).filter((l) => l.t >= p.started && podLine(app, p, l)).slice(-20), p.app))
  }
  if (verb === 'top') {
    if (k === 'nodes') {
      see('rtf-kubectl:top-nodes')
      return answer(table([['NAME', 'CPU(cores)', 'CPU%', 'MEMORY(bytes)', 'MEMORY%'], ...inst.nodes.map((n, i) => {
        const u = nodeUse(s, inst, i)
        return [n.name, `${u.useCpu}m`, `${Math.round((u.useCpu / NODE.allocCpu) * 100)}%`, `${u.useMem}Mi`, `${Math.round((u.useMem / NODE.allocMem) * 100)}%`]
      })]))
    }
    if (k === 'pods') {
      const list = nsPods().filter((p) => p.status === 'Running')
      if (!list.length) return answer(cmd.ns || cmd.all ? `error: Metrics not available for pod in namespace ${cmd.ns ?? ''}` : noNs())
      see('rtf-kubectl:top')
      for (const p of list) if (p.pod) see(`rtf-top:${p.pod.app}`)
      return answer(table([[...(cmd.all ? ['NAMESPACE'] : []), 'NAME', 'CPU(cores)', 'MEMORY(bytes)'], ...list.map((p) => [...(cmd.all ? [p.ns] : []), p.name, `${p.cpu}m`, `${p.mem}Mi`])]))
    }
    return answer(`error: unknown command "${kind ?? ''}" for "kubectl top"`)
  }
  return answer(`error: unknown command "${verb}" for "kubectl"\n\n${HELP}`)
}

export const envOfNamespace = (ns) => ENV_OF_NS[ns] ?? null
// the console alerts of a Runtime Fabric, worked out from the cluster as it is now
export function rtfAlerts(state, name = RTF) {
  const inst = instanceOf(state, name)
  if (!inst) return []
  const now = state.clock
  const full = inst.nodes.map((n, i) => [n, nodeUse(state, inst, i)]).filter(([, u]) => u.reqCpu / NODE.allocCpu >= 0.9)
  const pending = inst.pods.filter((p) => p.phase === 'Pending' && now - p.created >= 5 * MINUTE)
  const restarting = inst.pods.filter((p) => p.last && now - p.last.finished <= 30 * MINUTE)
  return [
    { name: 'Node CPU requests above 90%', firing: full.length > 0, detail: full.map(([n]) => n.name).join(', ') },
    { name: 'Pods pending for more than 5 minutes', firing: pending.length > 0, detail: pending.map((p) => p.name).join(', ') },
    { name: 'Containers restarted in the last 30 minutes', firing: restarting.length > 0, detail: restarting.map((p) => `${p.name} (${p.last.reason}, exit ${p.last.code})`).join(', ') },
    { name: 'Node not ready', firing: false, detail: '' },
  ]
}
