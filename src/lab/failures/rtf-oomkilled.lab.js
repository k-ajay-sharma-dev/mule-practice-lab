// The guided lab rtf-oomkilled. See platform-labs.js for the shape of a lab.
import { advance, at, finishDeploys, MINUTE, newApp, newPlatform, startApp } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { defaultRtf, kubectl, NAMESPACES, podsOf, RTF, rtfDefaults } from '../platform-rtf.js'
import { EXPORT, FILE, RESIDENT_MI, streamingOn } from './rtf-oomkilled.pkg.js'

const NS = NAMESPACES.Sandbox
const exporter = (s) => app(s, EXPORT)
const pods = (s) => podsOf(s, EXPORT, 'Sandbox')
const seen = (s, key) => Boolean(s.seen[key])

const lab = {
  id: 'p-rtf-oomkilled',
  group: 'Runtime Fabric and gateways',
  title: 'The inventory export keeps restarting',
  minutes: 25,
  scenario: `${EXPORT} runs on the Runtime Fabric ${RTF}, a Kubernetes cluster of Brightmart on Amazon EKS. Every 5 minutes it sends the full inventory file ${FILE} to the marketplace feed. Since the file grew this week, the app restarts every few minutes and the marketplace shows stock from yesterday. It is 09:47 on Black Friday. Find out with kubectl why the pod dies, and make the export run without restarts.`,
  start() {
    const clock = at(25, 5)
    const s = newPlatform({
      clock,
      apps: [
        newApp(EXPORT, {
          status: 'Stopped',
          target: RTF,
          rtf: { ...rtfDefaults(), cpu: 0.5, limit: 1, memory: 1 },
          vCores: 0.5,
          props: { 'export.streaming': 'false', 'warehouse.share': 'smb://brightmart-wh01/exports' },
          store: { rtfResidentMi: RESIDENT_MI },
        }),
      ],
      rtf: defaultRtf(clock),
    })
    let later = finishDeploys(startApp(s, EXPORT))
    later = until(later, at(25, 9, 30))
    later.mail.push({
      t: at(25, 9, 30),
      to: OPS,
      subject: 'Marketplace stock is from yesterday',
      body: `The marketplace still shows stock from last night. Runtime Manager says ${EXPORT} restarted many times this morning, but its logs show no error handler and no failed message. We sell out of items that the marketplace still offers.`,
      source: 'Brightmart Ecommerce',
    })
    return until(later, at(25, 9, 47))
  },
  steps: [
    {
      title: 'List the pods of the Sandbox namespace',
      how: `Runtime Fabric, ${RTF}, kubectl. Run kubectl get pods -n ${NS}. The namespace is the environment ID; Associated environments lists it. Look at STATUS and RESTARTS.`,
      done: (s) => seen(s, `rtf-pods:${EXPORT}`),
    },
    {
      title: 'Describe the pod',
      how: `kubectl describe pod <the pod of ${EXPORT}> -n ${NS}. Read Last State, Reason, Exit Code, the memory limit and the events.`,
      done: (s) => seen(s, `rtf-oom:${EXPORT}`),
    },
    {
      title: 'Read the logs of the container that died',
      how: `kubectl logs <pod> -n ${NS} --previous. The current container started after the kill, so only --previous shows the last lines before it.`,
      done: (s) => seen(s, `rtf-logs-previous:${EXPORT}`),
    },
    {
      title: 'Compare the memory use with the limit',
      how: `kubectl top pods -n ${NS}. Between two exports the pod already uses most of its 1Gi limit.`,
      done: (s) => seen(s, `rtf-top:${EXPORT}`),
    },
    ask(
      'Container memory and the JVM heap',
      'The app has Memory 1 GB on Runtime Fabric. How does that relate to the Java heap of the Mule runtime?',
      [
        'The heap gets the full 1 GB, and the container may use more when it needs to',
        'The 1 GB is the memory request and limit of the container. The JVM heap is only a part of it: metaspace, thread stacks, direct buffers, the runtime itself and the monitoring agent need the rest. The heap can fill first and give OutOfMemoryError, and the whole process can also pass the container limit',
        'Memory on Runtime Fabric is only a hint for the scheduler and is not enforced',
        'The heap is set in the properties of the app, apart from the container memory',
      ],
      1,
      'Runtime Fabric sets the memory request and the limit of the app container to the value you choose, and sizes the heap of the JVM inside it from that value. A JVM always needs memory beyond the heap. Size the container for the whole process and the peak of the biggest message, not for the heap alone.',
    ),
    ask(
      'Why the error handler never ran',
      'The pod shows Reason OOMKilled and Exit Code 137, and the Mule logs show no error handler. Why is OOMKilled not a Mule error you can catch?',
      [
        'Mule does not log errors on Runtime Fabric',
        'An On Error Continue around the transform would have caught it',
        'The Linux kernel ends the container with SIGKILL when it passes its cgroup memory limit. Exit code 137 is 128 plus signal 9. The JVM gets no chance to run code, so no error handler, no log line and no rollback happen; the kubelet then restarts the container',
        'Exit code 137 means the liveness probe failed',
      ],
      2,
      'OutOfMemoryError inside the JVM is a fatal error that Mule does not hand to error handlers either, but OOMKilled is one level lower: the process is gone. Watch for it in kubectl describe pod (Last State: Terminated, Reason: OOMKilled), in the restart count and in the Kubernetes events, not in the Mule logs.',
    ),
    {
      title: 'Give the app memory that fits',
      how: `Runtime Manager, Applications, ${EXPORT}, Settings, Runtime. Set Memory to 1.5 GB or more. Keep the size reasonable: every replica reserves it on a node.`,
      done: (s) => (exporter(s)?.rtf?.memory ?? 0) >= 1.5,
    },
    {
      title: 'Stream the file instead of loading it',
      how: `Settings, Properties: set export.streaming to true, then Apply Changes. The flow then reads ${FILE} as a repeatable file store stream and writes the feed in chunks, so memory no longer grows with the file.`,
      done: (s) => streamingOn(exporter(s)?.props),
    },
    {
      title: 'Watch the exports run without restarts',
      how: `Move the clock 20 minutes. kubectl get pods -n ${NS} shows the new pod Running with 0 restarts, and the logs show each export done.`,
      done: (s) => {
        const a = exporter(s)
        const list = pods(s)
        if (a?.status !== 'Running' || !list.length || s.clock < a.updated + 20 * MINUTE) return false
        const done = (a.store?.exports ?? []).filter((x) => x.config === a.config && x.t > a.updated)
        return list.every((p) => p.phase === 'Running' && !p.restarts) && done.length >= 3
      },
    },
  ],
  why: 'On Runtime Fabric every replica is a pod whose app container has a memory request and limit equal to the Memory you choose. The JVM heap is a part of that memory, so a flow that loads a whole file fills the heap (java.lang.OutOfMemoryError: Java heap space), and the process passes the container limit. The kernel then kills it with SIGKILL: Reason OOMKilled, Exit Code 137. Nothing in Mule runs, the kubelet restarts the container with a growing back off (CrashLoopBackOff), and the restart count climbs. kubectl describe pod shows Last State, kubectl logs --previous shows the last lines of the dead container, and kubectl top pods shows how close to the limit the pod lives. The lasting fix is to stream big payloads, so memory no longer depends on the file size, and to give the container room for the runtime, the cache and the peak. In the lab the export adds a fixed amount of memory for one minute, and the heap is not modelled apart from the container.',
  docs: 'https://docs.mulesoft.com/runtime-fabric/latest/',
  solve(start) {
    let s = kubectl(start, `kubectl get pods -n ${NS}`).state
    const pod = pods(s)[0].name
    s = kubectl(s, `kubectl describe pod ${pod} -n ${NS}`).state
    s = kubectl(s, `kubectl logs ${pod} -n ${NS} --previous`).state
    // top pods lists running pods only, so wait for the restart if the pod is in back off
    while (pods(s)[0].phase !== 'Running') s = advance(s, MINUTE)
    s = kubectl(s, `kubectl top pods -n ${NS}`).state
    const a = exporter(s)
    s = change(s, EXPORT, { rtf: { ...a.rtf, memory: 2 }, props: { ...a.props, 'export.streaming': 'true' } })
    return advance(s, 21 * MINUTE)
  },
  answers: { 4: 1, 5: 2 },
}

export const LABS = [lab]
