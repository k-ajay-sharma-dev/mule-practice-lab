export default {
  id: 'inc-090',
  category: 'incidents',
  title: 'Report Status Polls Return 404 Two Times Out of Three After Scaling to Three Replicas',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'replicas', 'object-store', 'scaling', 'clustering', 'deployment'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '14:02:11 INFO  [runtime] report-api: replicas scaled from 1 to 3, cluster mode OFF, Object Store V2 OFF', relevant: true, why: 'Three independent replicas now exist, with no clustering and no Object Store v2, so nothing shares object store data.' },
      { text: '14:06:40 INFO  [report-api-7c9f-a1x2] POST /reports accepted, job=R-5512 stored in object store report-jobs', relevant: true, why: 'The job status is written on replica a1x2 only.' },
      { text: '14:06:44 WARN  [report-api-7c9f-k8d3] GET /reports/R-5512 -> OS:KEY_NOT_FOUND, returning 404', relevant: true, why: 'Another replica cannot see the key, because each replica has its own store.' },
      { text: '14:06:48 WARN  [report-api-7c9f-q4m7] GET /reports/R-5512 -> OS:KEY_NOT_FOUND, returning 404', relevant: true, why: 'The third replica cannot see it either.' },
      { text: '14:06:52 INFO  [report-api-7c9f-a1x2] GET /reports/R-5512 -> 200 status=RUNNING', relevant: true, why: 'The poll succeeds only when round-robin reaches the replica that wrote the key.' },
      { text: '14:07:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '14:07:10 INFO  [runtime] report-api: CPU 22%, memory 54% on each replica', relevant: false },
      { text: '14:09:30 INFO  [report-api-7c9f-a1x2] Report R-5512 complete, 1,840 rows', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why do about two out of three polls return 404?',
        options: [
          'Object stores are not shared between replicas without clustering or Cloud Object Store, and the load balancer distributes requests round-robin across replicas',
          'The object store has a rate limit of one read per job',
          'Two of the replicas are running an older app version',
          'The jobs expire after a few seconds on CloudHub 2.0',
        ],
        answer: 0,
        explain: 'The Clustering page states that if an object is written to one replica, the others will not see it unless Cloud Object Store is used. Round-robin explains the pattern, with one replica in three holding the key.',
      },
      {
        type: 'single',
        prompt: 'Which change fixes this, and also keeps job status across restarts?',
        options: [
          'Enable Object Store v2 for the app in Runtime Manager',
          'Enable clustering only',
          'Set `persistent="true"` on the object store',
          'Add a fourth replica',
        ],
        answer: 0,
        explain: 'Clustering shares objects between replicas, but persistent local stores are lost on restart or redeploy. Object Store v2 stores data externally. You enable it in Runtime Manager, and the store must stay persistent: the Object Store v2 guide says an app with `persistent="false"` does not use it.',
      },
      {
        type: 'single',
        prompt: 'While the fix is prepared, what is a safe short-term mitigation?',
        options: [
          'Return the app to 1 replica, accept reduced capacity, and tell clients in-flight jobs may need resubmitting',
          'Add client retries until a poll succeeds',
          'Ignore the 404s, because the reports do complete',
          'Pin clients to one replica by its pod name',
        ],
        answer: 0,
        explain: 'One replica restores consistency straight away. Changing a deployment replaces replicas, and CloudHub 2.0 clears local storage on restart or redeploy, so some job status can be lost either way.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in prevention?',
        options: [
          'Add a pre-scale checklist that looks for object stores, in-memory caches, local files and schedulers',
          'Run a test with at least two replicas before production for any app that holds state',
          'Keep state out of the replica, as the HA guidance advises: external store, queue or database',
          'Rely on `persistent="true"` because it works in Studio',
          'Keep the object store usage limit in mind, because Object Store v2 is rate limited',
        ],
        answer: [0, 1, 2, 4],
        explain: 'Local behaviour does not carry over: Studio and standalone runtimes retain data across restarts, but CloudHub 2.0 replicas use volatile storage.',
      },
    ],
  },
  description: `
## Symptoms
- After Tuesday's scale-out, clients of the report API see \`GET /reports/{id}\` return **404** about two times out of three, for jobs that were created seconds earlier.
- Retrying the same request sometimes returns \`200\` with \`status=RUNNING\`. The reports do finish.
- CPU and memory are normal. There are no errors from the database.

## Change / Context
- \`report-api\` runs on CloudHub 2.0. \`POST /reports\` stores job status in an object store named \`report-jobs\`, starts the work asynchronously and returns a job id. Clients poll \`GET /reports/{id}\`.
- About 6,000 reports run on a busy day, and month-end demand was causing slow responses on the single replica.
- On Tuesday at 14:00 the team changed the replica count from **1 to 3** for capacity. **Run in Runtime Cluster Mode** is off and **Use Object Store V2** is off.
- \`report-jobs\` is declared with \`persistent="true"\`, so the team assumed it was safe.

## Logs
\`\`\`
14:02:11 INFO  [runtime] report-api: replicas scaled from 1 to 3, cluster mode OFF
14:06:40 INFO  [report-api-7c9f-a1x2] POST /reports accepted, job=R-5512
14:06:44 WARN  [report-api-7c9f-k8d3] GET /reports/R-5512 -> OS:KEY_NOT_FOUND, returning 404
14:06:48 WARN  [report-api-7c9f-q4m7] GET /reports/R-5512 -> OS:KEY_NOT_FOUND, returning 404
14:06:52 INFO  [report-api-7c9f-a1x2] GET /reports/R-5512 -> 200 status=RUNNING
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
    'The load-balancing service distributes requests round-robin across replicas, so a poll rarely lands on the replica that wrote the job.',
    'With two or more replicas and no clustering, object stores are not shared unless Cloud Object Store is used.',
    'persistent="true" writes to local disk, and CloudHub 2.0 local storage is cleared on restart or redeploy.',
    'Clustering shares object stores between replicas. Object Store v2 stores data externally and survives restarts.',
    'Object Store v2 is enabled in Runtime Manager and is rate limited.',
    'Before scaling out, look for state held in the replica.',
  ],
  solution: `
**Diagnosis.** The pattern follows the replica names: the job is written on \`a1x2\`, and only \`a1x2\` finds it. With 3 replicas and round-robin load balancing, about two polls in three reach a replica without the key, which matches the symptom. CPU and memory are irrelevant.

**Immediate mitigation.**
- Set the replica count back to 1 to restore consistent answers, and accept slower month-end performance for now.
- Warn clients that jobs in flight may need resubmitting, because a deployment change replaces replicas and CloudHub 2.0 clears local storage on restart or redeploy.

**Root cause.** The app kept shared state inside a replica. The Clustering page lists the behaviour of two or more replicas without clustering: object stores are not shared, and an object written to one replica is not visible to the others unless Cloud Object Store is used. \`persistent="true"\` does not help, because it writes to local disk, which is per replica and volatile. It worked on one replica only because every request reached the same store.

**Permanent fix.**
- Turn on **Use Object Store V2** for the app in Runtime Manager and redeploy. On CloudHub 2.0 you enable this in Runtime Manager rather than configuring the app. Keep \`persistent="true"\` on \`report-jobs\`, because the guide says \`persistent="false"\` does not use Object Store v2, and expect the status of jobs in flight not to carry over. All replicas then share a store that lives outside them and survives restarts.
- Clustering alone would share the store between replicas. But the docs direct you to Object Store v2 for data that must persist across restarts, so it is not enough on its own.
- Check the Object Store v2 limits against the polling rate, since it is rate limited. Ask clients to poll at a sensible interval. If job status is business data, a database is a good alternative.
- Then scale to 3 replicas, and test with several replicas.

**Prevention.**
- Add a scale-out checklist: object stores, in-memory caches, local files, schedulers, batch jobs and per-replica rate limits.
- Run non-production with at least two replicas, so this class of defect appears before production.
- Follow the HA guidance: keep each replica's state independent, and persist data in an external store.
- Remember that restarts are routine, so test what happens to state during one.
`,
  followUps: [
    { q: 'Would sticky sessions be a better fix?', a: 'The docs describe round-robin distribution, and even with affinity a replica can restart and lose its local storage. Move the state out of the replica instead.' },
    { q: 'What changes if both Clustering and Use Object Store V2 are enabled?', a: 'All Object Store access routes to Object Store v2, including internal runtime, policy and connector usage. That can create metered usage even if the app does not use Object Store directly.' },
    { q: 'Why did nobody see this on the single replica?', a: 'Every request hit the same local store, so reads always matched writes. The fault was present but invisible, apart from data loss after restarts.' },
  ],
}
