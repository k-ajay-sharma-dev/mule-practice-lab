export default {
  id: 'inc-091',
  category: 'incidents',
  title: 'New Replicas Stuck in Pending on Runtime Fabric While Cluster CPU Sits at 35%',
  level: 'ADVANCED',
  tags: ['runtime-fabric', 'kubernetes', 'resources', 'capacity', 'deployment'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '18:30:05 INFO  [runtime-manager] prc-claims-rating: apply configuration, replicas 2 -> 4, Reserved vCPU 0.5 -> 1.0, vCPU Limit 1.0 -> 2.0', relevant: true, why: 'The new settings ask the cluster to reserve 4.0 vCPU in total, because cores apply to each replica.' },
      { text: '18:31:12 WARN  [runtime-manager] 1 or more replicas in unexpected state: [Kubernetes] Unschedulable', relevant: true, why: 'No node can currently take the requested replicas.' },
      { text: '18:31:40 INFO  [kubectl] pod/prc-claims-rating-6d9b7c-mtx5q 0/2 Pending 0 restarts', relevant: true, why: 'Pending means the pod was never scheduled, so the Mule app has not even started.' },
      { text: '18:31:41 INFO  [kubectl] Warning FailedScheduling 0/3 nodes are available: 3 Insufficient cpu', relevant: true, why: 'The scheduler compares CPU requests with what is left to reserve on each node. Actual usage is not the test.' },
      { text: '18:32:00 INFO  [prc-claims-rating-58f4d9-w2k7b] Rated claim CL-44172 in 212 ms', relevant: true, why: 'The old replicas are still serving, so there is no outage yet.' },
      { text: '18:32:10 INFO  [grafana] cluster CPU usage 35%, memory usage 48%', relevant: true, why: 'Low usage is misleading: reservations, not usage, decide whether a pod fits.' },
      { text: '18:33:00 INFO  [rtf-agent] heartbeat to control plane OK', relevant: false },
      { text: '18:34:02 INFO  [health] GET /api/health 200 (3 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are the replicas Pending when the cluster is only 35% busy?',
        options: [
          'Pods are placed by reserved CPU (the Kubernetes request), and no node has 1.0 vCPU left unreserved, even though actual usage is low',
          'Runtime Fabric refuses to schedule above 35% CPU',
          'The Mule app is crashing during startup',
          'The Runtime Fabric agent has lost the control plane',
        ],
        answer: 0,
        explain: '`Reserved vCPU` is guaranteed to the replica, so it has to fit on a node. The cluster can look idle while its capacity is almost fully reserved. Pending pods have not started, so this is not a crash.',
      },
      {
        type: 'single',
        prompt: 'Are customers affected right now, and what should the team avoid?',
        options: [
          'The earlier replicas are still serving, so there is time to act. Avoid deleting them to free capacity until the new ones can fit',
          'The app is down, so restart everything at once',
          'Pending replicas take traffic anyway, so nothing is affected',
          'Traffic has moved to CloudHub 2.0 automatically',
        ],
        answer: 0,
        explain: 'With a failed redeployment the previous app remains running and active, which is what makes Runtime Fabric redeployments zero-downtime. Removing the working replicas would turn a stalled change into an outage.',
      },
      {
        type: 'multi',
        prompt: 'Which are valid ways to make the deployment fit?',
        options: [
          'Add a worker node, then confirm licence compliance for the extra capacity',
          'Lower `Reserved vCPU` and keep a higher `vCPU Limit`, accepting that bursting is not guaranteed',
          'Reduce over-sized reservations on other apps, based on measured usage',
          'Disable the Anypoint Monitoring sidecar to save CPU',
          'Raise `vCPU Limit` further so that the scheduler gives the app more room',
        ],
        answer: [0, 1, 2],
        explain: 'The sidecar cannot be disabled, and the limit does not create reservable capacity. Whichever option you choose, cores apply per replica, so calculate the total.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Confirm old replicas are serving and pause further changes',
          'Check the warning and pod status with `kubectl get deployments,pods --namespace <ENVIRONMENT_NAMESPACE>`',
          'Read the scheduling events to find the shortage',
          'Add up reserved CPU per node, including sidecars and platform services',
          'Choose a fix: add capacity or change the reservation, then redeploy',
          'Confirm all replicas reach Started, then review capacity alerts',
        ],
        explain: 'Protect the working version, confirm the failure mode, work out the real numbers, then act.',
      },
    ],
  },
  description: `
## Symptoms
- Friday 18:30: ahead of a storm-claims surge, an engineer raises \`prc-claims-rating\` on Runtime Fabric from 2 to 4 replicas and doubles its CPU.
- After a minute, Runtime Manager shows: \`1 or more replicas in unexpected state: [Kubernetes] Unschedulable\`. The new pods stay **Pending**.
- A dashboard shows cluster CPU at **35%**, so the engineer suspects a Runtime Fabric defect.

## Change / Context
- The cluster is Amazon EKS with 3 worker nodes of 4 vCPU each, in one Runtime Fabric instance for production.
- Before the change, all apps together had 9.9 vCPU reserved, including 1.0 for \`prc-claims-rating\`.
- Most apps were sized generously at go-live, so reservations are much higher than use.
- The allocation page says Runtime Fabric services use between 0.3 and 0.5 vCPU on worker nodes, and each replica has an Anypoint Monitoring sidecar with a baseline of at least 50m CPU.
- New settings per replica: \`Reserved vCPU\` 1.0, \`vCPU Limit\` 2.0.

## Logs
\`\`\`
18:30:05 INFO  [runtime-manager] prc-claims-rating: replicas 2 -> 4,
          Reserved vCPU 0.5 -> 1.0, vCPU Limit 1.0 -> 2.0
18:31:12 WARN  [runtime-manager] 1 or more replicas in unexpected state:
          [Kubernetes] Unschedulable
18:31:40 INFO  [kubectl] pod/prc-claims-rating-6d9b7c-mtx5q 0/2 Pending 0 restarts
18:31:41 INFO  [kubectl] Warning FailedScheduling 0/3 nodes are available: 3 Insufficient cpu
18:32:10 INFO  [grafana] cluster CPU usage 35%, memory usage 48%
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Unschedulable means no node can run the requested replicas, and reasons include nodes without enough resources.',
    'Reserved vCPU is guaranteed, so it decides whether a replica fits. A vCPU Limit above it is only burst room on shared CPU.',
    'Cores and memory apply to each replica, so multiply before you deploy.',
    'Worker nodes also carry Runtime Fabric services, and every replica has a monitoring sidecar that cannot be disabled.',
    'Usage graphs do not show reservable capacity. Track reserved against allocatable per node.',
    'If a redeployment fails, the previous app stays running.',
    'Adding CPU capacity or raising limits has licence implications on Runtime Fabric.',
  ],
  solution: `
**Diagnosis.** The pods are Pending, not crashing, and the events say \`Insufficient cpu\`. The numbers explain it:

| Item | vCPU |
|---|---|
| Worker capacity (3 x 4) | 12.0 |
| Runtime Fabric services (the page says 0.3 to 0.5, without saying whether that is per node) | 0.5 to 1.5 |
| Already reserved by apps | 9.9 |
| Left to reserve, across all three nodes | about 0.6 to 1.6 |
| Requested by the update (4 x 1.0, plus sidecars) | over 4.0 |

Each new pod needs 1.0 vCPU on a single node. At most about 1.6 is left across the whole cluster, before sidecars, and the \`Insufficient cpu\` events show that no single node has 1.0 free. The 35% figure measures usage, while the scheduler works from requests.

**Immediate mitigation.**
- Leave the old replicas alone. They are still serving claims.
- Decide quickly, because the surge is coming. The fastest safe option is to add a worker node, or apply a smaller reservation, for example \`Reserved vCPU\` 0.5 with \`vCPU Limit\` 2.0, and let the app burst. Note that this needs reservable capacity too, and that bursting is not guaranteed.
- If capacity is needed right now, reduce a low-priority app's reservation after checking its measured usage.

**Root cause.** The change was sized against a usage dashboard rather than against reservable capacity. \`Reserved vCPU\` is guaranteed to each replica, the requested cores apply to every replica, and the cluster's capacity was almost fully reserved because earlier apps had been sized generously. Nothing was wrong with Runtime Fabric. A rolling update makes this tighter, because the old replicas keep their reservations until new ones are running.

**Permanent fix.**
- Right-size reservations from load tests and measured use, so \`Reserved vCPU\` reflects what each app needs. The allocation page says to run performance and load testing to determine resources.
- Keep burst for apps that tolerate it, and use guaranteed allocation (reserved equal to limit) for critical, latency-sensitive apps.
- Add node capacity with headroom for rolling updates, and consider the cluster autoscaling recommendations if you use HPA.
- Check licence compliance for any change: the sum of CPU Limits per replica, or the total worker CPU, must stay within the licensed quantity.

**Prevention.**
- Dashboard: reserved against allocatable per node, with an alert when there is too little left for the largest rolling update.
- Add a pipeline or change-review step that calculates replicas x cores before deploying.
- Plan surge capacity ahead of known events.
- Treat \`Unschedulable\` warnings that persist as actionable. Temporary ones can clear, for example when a node comes back from maintenance.
`,
  followUps: [
    { q: 'What if the same thing happens with spare capacity and Enforce deploying replicas across nodes turned on?', a: 'That option needs a separate node for each replica. With more replicas than suitable nodes, some replicas stay Pending, and the deployment becomes Running only after all replicas are on different nodes.' },
    { q: 'How does this differ from CrashLoopBackOff?', a: 'Pending means the pod was never scheduled. CrashLoopBackOff means it started and keeps failing: the docs give examples such as a corrupt artifact or a database the app needs at startup being down.' },
    { q: 'Would autoscaling have avoided this?', a: 'Not by itself. HPA adds replicas, and these still have to be scheduled. It needs metrics APIs, licensing support and spare or auto-scaled nodes, and is recommended for smaller CPU applications.' },
  ],
}
