// The guided lab rtf-node-pool. See platform-labs.js for the shape of a lab.
import { advance, at, finishDeploys, mark, MINUTE, newApp, newPlatform, startApp } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { defaultRtf, kubectl, NAMESPACES, podsOf, RTF, rtfDefaults } from '../platform-rtf.js'
import { CART, CATALOG, PRICES } from './rtf-node-pool.pkg.js'

const NS = NAMESPACES.Sandbox
const SALE = 6
const cartPods = (s) => podsOf(s, CART, 'Sandbox')
const ready = (s) => cartPods(s).filter((p) => p.phase === 'Running')
const seen = (s, key) => Boolean(s.seen[key])
const onRtf = (name, rtf, extra = {}) => newApp(name, { status: 'Stopped', target: RTF, rtf: { ...rtfDefaults(), ...rtf }, vCores: rtf.cpu, ...extra })

const lab = {
  id: 'p-rtf-node-pool',
  group: 'Runtime Fabric and gateways',
  title: 'Six cart replicas and three stay Pending',
  minutes: 25,
  scenario: `Brightmart runs a Black Friday load test in Sandbox on the Runtime Fabric ${RTF}, three m5.large nodes on Amazon EKS. At 09:00 the team raised ${CART} from 2 to ${SALE} replicas. Twenty minutes later only 3 replicas serve, and kubectl shows the others Pending, although the nodes are almost idle. Find out what blocks the scheduler and get all ${SALE} replicas running without buying more than you need.`,
  start() {
    const clock = at(25, 8, 30)
    const s = newPlatform({
      clock,
      apps: [
        onRtf(CATALOG, { cpu: 1, limit: 2, memory: 1.5, spread: true }, { replicas: 3 }),
        onRtf(PRICES, { cpu: 0.1, limit: 0.5, memory: 1, spread: true }),
        onRtf(CART, { cpu: 0.5, limit: 1, memory: 1, spread: false }, { replicas: 2 }),
      ],
      traffic: [{ app: CART, env: 'Sandbox', perMinute: 60, path: '/cart/C-100', method: 'GET' }],
      rtf: defaultRtf(clock),
    })
    let later = s
    for (const name of [CATALOG, PRICES, CART]) later = startApp(later, name)
    later = until(finishDeploys(later), at(25, 9))
    later = change(later, CART, { replicas: SALE })
    later = until(later, at(25, 9, 15))
    later.mail.push({
      t: at(25, 9, 15),
      to: OPS,
      subject: 'Load test: half of the cart replicas do nothing',
      body: `We asked for ${SALE} replicas of ${CART} at 09:00. Runtime Manager still counts 3 ready, and response times climb as we add load. Monitoring shows the nodes at about 10% CPU. Can you get the other replicas up before the 10:00 run?`,
      source: 'Brightmart Performance Team',
    })
    return until(later, at(25, 9, 20))
  },
  steps: [
    {
      title: `Look at the nodes of ${RTF}`,
      how: `Runtime Fabric, ${RTF}, Nodes. Compare the CPU reserved with the CPU used on each node.`,
      done: (s) => seen(s, 'rtf-nodes'),
    },
    {
      title: 'Describe a Pending pod',
      how: `Open the kubectl tab. Run kubectl get pods -n ${NS}, then kubectl describe pod <a Pending pod of ${CART}> -n ${NS}. Read the FailedScheduling event.`,
      done: (s) => seen(s, `rtf-pending:${CART}`),
    },
    {
      title: 'Read the allocated resources of a node',
      how: 'kubectl describe node <node>. The Non-terminated Pods and Allocated resources sections show who reserved the CPU.',
      done: (s) => seen(s, 'rtf-kubectl:describe-node'),
    },
    {
      title: 'Compare with what the nodes use',
      how: 'kubectl top nodes, and kubectl top pods -n <namespace> for the pods.',
      done: (s) => seen(s, 'rtf-kubectl:top-nodes'),
    },
    ask(
      'Why the pods do not fit',
      'The nodes use about 10% of their CPU, yet the scheduler says "0/3 nodes are available: 3 Insufficient cpu." Why?',
      [
        'The metrics of kubectl top are wrong',
        'The scheduler places pods by their requests, not by what pods use. vCores reserved is the CPU request, and the requests on each node already add up to almost all of its allocatable CPU. A pod fits only on a node whose unreserved CPU covers its request',
        'Kubernetes needs a restart of the nodes after a scale out',
        'The cart API has a limit of 6 replicas on Runtime Fabric',
      ],
      1,
      `${CATALOG} reserves 1 vCore on every node for a job that runs once a night and idles at a few millicores. That reservation is held all day, so the cart pods have nowhere to go. Right size the requests of idle apps, or add capacity.`,
    ),
    {
      title: `Get all ${SALE} cart replicas running`,
      how: `Either lower the vCores reserved of the app that reserves far more than it uses (Runtime Manager, Applications, the app, Settings, Runtime, vCores reserved, Apply Changes), or add capacity with Runtime Fabric, ${RTF}, Nodes, Add node. The Pending pods are scheduled in the next minute.`,
      done: (s) => ready(s).length >= SALE,
    },
    ask(
      'vCores reserved and vCore limit',
      `${CATALOG} has 1 vCore reserved and a 2 vCore limit. What do the two values do on the cluster?`,
      [
        'Both are the same thing shown twice',
        'The limit is what the scheduler reserves; the reserved value is only a hint',
        'vCores reserved is the request: it is set aside on the node whether the app uses it or not, and the scheduler counts it. The vCore limit is a ceiling: the app can burst up to it while the node has spare CPU, and is throttled above it. Requests decide where pods fit, limits decide how much they may use',
        'The limit makes Kubernetes kill the pod when it uses more CPU',
      ],
      2,
      'CPU over the limit is throttled, not killed; memory over the limit is OOMKilled. A low request with a higher limit packs more replicas on a node and still lets a nightly job burst, as long as the node has CPU to spare at that moment.',
    ),
    ask(
      'Enforce deploying replicas across nodes',
      `${CART} has Enforce deploying replicas across nodes turned off. What does the option do, and why does it matter?`,
      [
        'It makes the deployment faster',
        'It spreads the CPU of one replica over several nodes',
        'Nothing on a self managed cluster',
        'With it on, no two replicas of the app may run on the same node, so one node going down takes at most one replica. It needs as many nodes as replicas: with 6 replicas on 3 nodes, 3 stay Pending with "didn\'t match pod anti-affinity rules". With it off, the scheduler may pile replicas on one node, which fits more but weakens high availability',
      ],
      3,
      'For an API that must stay up during the sale, spreading replicas is the safe default. Then plan the node count with the replica count, or use a few larger replicas instead of many small ones.',
    ),
    {
      title: 'Watch the load test on all replicas',
      how: `Move the clock 10 minutes. kubectl get pods -n ${NS} shows ${SALE} Running cart pods, and kubectl get events -n ${NS} shows no new FailedScheduling.`,
      done: (s) => {
        const list = ready(s)
        return list.length >= SALE && cartPods(s).every((p) => p.phase === 'Running') && s.clock - Math.max(...list.map((p) => p.started)) >= 10 * MINUTE && app(s, CART)?.status === 'Running'
      },
    },
  ],
  why: 'The Kubernetes scheduler places a pod by its resource requests: a node fits when its allocatable CPU and memory, minus the requests of the pods already on it, cover the request of the new pod. On Runtime Fabric vCores reserved is the CPU request and memory is both request and limit, so an app that reserves 1 vCore holds that vCore all day, even when it idles at a few millicores. Pending pods with "0/3 nodes are available: 3 Insufficient cpu." mean the requests are full, not that the CPU is busy: kubectl describe node shows Allocated resources near 100% while kubectl top nodes shows low use. Right size the requests of idle apps from what they really use, keep a higher vCore limit for bursts, and add nodes when the real demand grows. Enforce deploying replicas across nodes adds a rule that replicas of one app must sit on different nodes, which protects availability and needs enough nodes. In the lab the cluster has one node group of m5.large nodes and a new node joins at once.',
  docs: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/',
  solve(start) {
    let s = mark(start, 'rtf-nodes')
    s = kubectl(s, `kubectl get pods -n ${NS}`).state
    const pending = cartPods(s).find((p) => p.phase === 'Pending')
    s = kubectl(s, `kubectl describe pod ${pending.name} -n ${NS}`).state
    const node = s.rtf.instances[RTF].nodes[0].name
    s = kubectl(s, `kubectl describe node ${node}`).state
    s = kubectl(s, 'kubectl top nodes').state
    const a = app(s, CATALOG)
    s = change(s, CATALOG, { rtf: { ...a.rtf, cpu: 0.2 }, vCores: 0.2 })
    return advance(s, 12 * MINUTE)
  },
  answers: { 4: 1, 6: 2, 7: 3 },
}

export const LABS = [lab]
