export default {
  id: 'inc-161',
  category: 'incidents',
  title: 'A Clustered App Fails With Hazelcast Serialization Errors Halfway Through a Rolling Mule Upgrade on Runtime Fabric',
  level: 'EXPERT',
  tags: ['deployment', 'runtime-fabric', 'clustering', 'hazelcast', 'upgrade', 'rolling-update', 'environments'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '2026-11-11 21:00:04 INFO  [runtime-manager] prc-allocation: apply changes, runtime version changed, updateStrategy=rolling, clustered=true', relevant: true, why: 'A runtime version change is going through a rolling update on an app that runs in Mule cluster mode.' },
      { text: '2026-11-11 21:02:37 INFO  [prc-allocation-5c8b-new1] Starting Mule runtime ... members [3]', relevant: false },
      { text: '2026-11-11 21:02:51 ERROR [prc-allocation-5c8b-new1] com.hazelcast.nio.serialization.HazelcastSerializationException: incompatible data from member 10.42.3.17', relevant: true, why: 'Illustrative line: the new replica cannot exchange data with old replicas, which fits a Hazelcast version mismatch.' },
      { text: '2026-11-11 21:02:52 ERROR [prc-allocation-7d4f-old2] Object store operation failed on partition 41', relevant: true, why: 'Failures appear on the old replicas too, because the app shares state through the cluster.' },
      { text: '2026-11-11 21:03:10 WARN  [runtime-manager] prc-allocation: 2/3 replicas ready, 1 replica in Applying', relevant: true, why: 'The rollout is in the mixed window: two runtime versions exist in one cluster.' },
      { text: '2026-11-11 21:03:15 INFO  [prc-allocation-7d4f-old1] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-11 21:04:02 ERROR [ingress] POST /allocations 500 (rate 38% over 1 min)', relevant: true, why: 'User impact has started, so the mixed state must end quickly.' },
      { text: '2026-11-11 21:05:40 INFO  [sys-stock-api] GET /stock/SKU-99127 200 (41 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The rolling update created a cluster with members on different Hazelcast versions, which can fail with a Hazelcast serialization error if they are incompatible',
          'The new image has a bad application JAR',
          'Hazelcast cannot run on Kubernetes',
          'The ingress controller is rejecting replicas',
        ],
        answer: 0,
        explain: 'The Runtime Fabric page describes this exact case for Mule clustering when a rolling update uses a Mule runtime version with a Hazelcast version change.',
      },
      {
        type: 'single',
        prompt: 'What does the documentation say to use to prevent this error?',
        options: [
          'The Recreate update strategy',
          'More replicas',
          'A longer readiness probe',
          'The performance store profile',
        ],
        answer: 0,
        explain: 'Recreate terminates replicas before re-deployment, so the two versions never share a cluster. It also needs no additional resources, but the app is unavailable while it restarts.',
      },
      {
        type: 'single',
        prompt: 'The rollout is half done and users see errors. What is the sensible immediate decision?',
        options: [
          'End the mixed state by moving every replica to one runtime version: redeploy with Recreate in an agreed short outage, or roll back to the last successful configuration and confirm that the mixed state has gone',
          'Leave it running and hope that the remaining replica catches up',
          'Scale to 16 replicas',
          'Disable the Scheduler',
        ],
        answer: 0,
        explain: 'While members with incompatible versions coexist, failures can continue. Recreate is the strategy the docs name for this error. Rollback to a previous successful configuration is documented too, but the docs do not say how it interacts with the update strategy, so verify the result.',
      },
      {
        type: 'multi',
        prompt: 'What should you check before choosing Recreate on a clustered app?',
        options: [
          'What state lives only in the cluster grid, such as object stores and VM queues',
          'Whether the business accepts a short outage',
          'Whether in-flight work can be replayed or retried safely',
          'Whether Persistence Gateway or another external store should hold durable state',
          'Whether the Ingress template name contains a capital letter',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Recreate stops all replicas together. On customer-hosted clusters, stopping every node clears grid state unless JDBC persistence is in place, so never assume cluster memory survives on Runtime Fabric without verifying it.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Hold further changes and declare the incident',
          'Confirm the mixed version state from replica status and logs',
          'Assess state held in the cluster',
          'Roll back or redeploy with the Recreate strategy',
          'Verify traffic and reconcile allocations made during the window',
          'Change the deployment standard for clustered apps',
        ],
        explain: 'Stabilise first, protect state, then fix the process.',
      },
    ],
  },
  description: `
## Symptoms
- Wednesday 21:04: \`prc-allocation\` returns **HTTP 500 for about 38% of requests** during a planned Mule runtime upgrade.
- Runtime Manager shows two of three replicas ready, and one still applying.
- Logs on new and old replicas show serialization and object store errors.

## Change / Context
- \`prc-allocation\` runs on Runtime Fabric with three replicas and **Run in Runtime Clustering Mode** enabled, because it shares allocation locks and state through object stores in the cluster.
- The release notes for the target Mule version list a Hazelcast library upgrade. Nobody on the change board read that line.
- The app uses the default update strategy, \`rolling\`.
- Previous patches inside one Mule line went smoothly.

## Logs
\`\`\`
21:00:04 INFO  [runtime-manager] prc-allocation: apply changes, updateStrategy=rolling, clustered=true
21:02:51 ERROR [new1] com.hazelcast.nio.serialization.HazelcastSerializationException: incompatible data
21:02:52 ERROR [old2] Object store operation failed on partition 41
21:03:10 WARN  [runtime-manager] prc-allocation: 2/3 replicas ready, 1 replica in Applying
21:04:02 ERROR [ingress] POST /allocations 500 (rate 38% over 1 min)
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
    'A rolling update keeps old and new replicas running together. In cluster mode, those replicas are members of one cluster.',
    'If the runtime version has a Hazelcast version change, the cluster has members on different versions and may fail with a serialization error.',
    'The documented prevention is the Recreate update strategy.',
    '`rolling` is the default; it needs one additional replica\'s worth of resources. `recreate` terminates replicas first and needs none.',
    'If a deployment fails, the previous configuration can be rolled back to.',
    'The on-premises equivalent is the same: mixed versions can cause incompatible Hazelcast communication, and every node must be shut down to proceed.',
    'Recreate means an outage, so clustered apps need a window, and durable state must not depend on the cluster alone.',
    'Release notes are part of change assessment: look for library changes such as Hazelcast.',
  ],
  solution: `
**Diagnosis.** The rollout is partly complete and the errors started with the first new replica. Serialization errors between members plus object store failures on both old and new replicas show that the cluster itself is broken, not one replica. This matches the note in the Runtime Fabric docs: during a rolling update to a runtime with a Hazelcast change, the cluster has members on different versions. Exact log text is illustrative; the behaviour is documented.

**Immediate mitigation.** End the mixed state.
- To abandon the upgrade, roll back to the previous successful configuration. New configurations are applied as rolling updates by default, and the docs do not say how a rollback interacts with the update strategy, so do not assume it avoids a second mixed state: watch the replicas and verify the result.
- If the upgrade must proceed, agree a short outage and redeploy with \`updateStrategy: recreate\`, which terminates all replicas before creating new ones.
- Before either step, work out what is held in cluster memory. Treat all grid state as at risk if every replica stops.
- Reconcile allocations made in the error window, because some requests failed partway through.

**Root cause.** The default rolling strategy is unsafe for a clustered app when the Hazelcast version changes, and the change assessment did not look for this. Earlier patches had worked, which built false confidence.

**Permanent fix.**
- Set \`recreate\` for runtime upgrades of clustered apps, at least where the release notes show a Hazelcast change.
- Move durable state out of the cluster. Runtime Fabric recommends Persistence Gateway for stateful apps needing shared storage, and the HA guidance says to keep integrations stateless and externalize state.
- Ask whether clustering is really needed. Many apps run well as independent replicas with external state, and then rolling updates are safe again.

**Prevention.** Add "Hazelcast change?" to the upgrade checklist, test the exact upgrade path in non-production with the same replica count and clustering on, and keep a documented outage window for clustered apps.
`,
  followUps: [
    {
      q: 'Why is this not a problem for non-clustered apps?',
      a: 'Replicas without clustering do not form a Hazelcast cluster, so old and new versions run side by side without exchanging grid data. The rolling note still applies: different app versions run at the same time, so they must be compatible.',
    },
    {
      q: 'What is the equivalent on an on-premises cluster?',
      a: 'The upgrade guide says zero downtime cannot be guaranteed: during an upgrade the cluster is in a mixed state and Hazelcast instances might have incompatible protocols. When such errors occur, every node must be shut down to proceed.',
    },
    {
      q: 'How do you set the strategy in a pipeline?',
      a: 'In the Mule Maven plugin, `updateStrategy` under `deploymentSettings` accepts `rolling` or `recreate`. With `enforceDeployingReplicasAcrossNodes`, recreate allows replicas up to the number of nodes, and rolling one less.',
    },
  ],
}
