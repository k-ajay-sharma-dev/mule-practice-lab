export default {
  id: 'inc-166',
  category: 'incidents',
  title: 'Object Store Calls Fail on Runtime Fabric After the DBA Team Enforces TLS on the Persistence Gateway Database',
  level: 'ADVANCED',
  tags: ['deployment', 'runtime-fabric', 'persistence-gateway', 'object-store', 'postgresql', 'tls', 'kubernetes'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-18 19:00:05 INFO  [dba-change] pg-rtf-prod: hostnossl rejected, hostssl required for all users (security baseline v7)', relevant: true, why: 'The database now refuses plain text connections. Persistence Gateway supports only plain text connections to its database.' },
      { text: '2026-11-18 19:00:41 ERROR [persistence-gateway-6dfb98949c-7xns9] Connecting to PostgreSQL backend... failed: no pg_hba.conf entry for host, SSL off', relevant: true, why: 'Illustrative line: the gateway pod itself is what cannot reach the database.' },
      { text: '2026-11-18 19:01:03 WARN  [kubectl] persistence-gateway-6dfb98949c-7xns9  0/1  Running  3 (12s ago)', relevant: true, why: 'The gateway pod is unhealthy after the database change, so the fault is in the storage path.' },
      { text: '2026-11-18 19:01:15 ERROR [prc-claims-intake] OS:STORE_NOT_AVAILABLE Object store request failed', relevant: true, why: 'Illustrative line: apps use the Object Store connector through the gateway, so their calls now fail.' },
      { text: '2026-11-18 19:01:16 INFO  [prc-claims-intake] Message returned to the queue for redelivery', relevant: false },
      { text: '2026-11-18 19:02:00 INFO  [runtime-manager] prc-claims-intake: 3/3 replicas Running', relevant: true, why: 'Replica status is healthy, which shows why Runtime Manager alone gives no warning here.' },
      { text: '2026-11-18 19:03:44 INFO  [sys-members] GET /members/88213 200 (35 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The database now requires TLS, but only plain text connections are supported between Persistence Gateway and PostgreSQL',
          'The Persistence Gateway data expired after 30 days',
          'The app replicas are out of memory',
          'The `partition` keyword became reserved in PostgreSQL',
        ],
        answer: 0,
        explain: 'The Configuring Persistence Gateway page states this limitation. It does not describe how the failure looks, so the log lines here are illustrative: the answer rests on the documented limitation and on the timing of the DBA change.',
      },
      {
        type: 'single',
        prompt: 'What is the realistic immediate fix?',
        options: [
          'Roll back or make an exception so that the gateway\'s database user can connect in plain text again, and record the exception',
          'Add `sslmode=require` to the connection URL in the secret',
          'Set a higher `maxBackendConnectionPool`',
          'Redeploy all apps to a new namespace',
        ],
        answer: 0,
        explain: 'Plain text is the only supported mode, so changing the URL to force TLS is not supported, whatever it might seem to do. Pool size has nothing to do with this.',
      },
      {
        type: 'multi',
        prompt: 'How do you verify recovery?',
        options: [
          'Check that the `persistence-gateway` pods in the `rtf` namespace are ready',
          'Look in the pod logs for a successful connection to the PostgreSQL backend',
          'Test an Object Store operation from an app that uses it',
          'Check message backlogs and retries in the apps that failed',
          'Run `rtfctl backup` to repair the store',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The page shows `Successfully connected to the PostgreSQL backend.` as the healthy log entry. Backup has nothing to do with connection recovery.',
      },
      {
        type: 'multi',
        prompt: 'Security cannot accept plain text long-term. Which options are reasonable to put to them?',
        options: [
          'Keep the database on an isolated private network segment reachable only from the cluster, with a formal exception and compensating controls',
          'Move state that really needs an encrypted connection to a database the app reaches through the Database Connector with TLS',
          'Ask MuleSoft whether TLS support is planned for your agent version',
          'Remove the database password so that nothing sensitive crosses the wire',
        ],
        answer: [0, 1, 2],
        explain: 'Each option treats the limitation honestly. A design must also classify what is in the store: Persistence Gateway holds app data, so sensitive values need particular care.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm that the gateway pod, not the app, fails to reach the database',
          'Link the start time to the DBA change',
          'Restore plain text access for the gateway user',
          'Verify gateway logs and an Object Store operation',
          'Check for failed or duplicated work during the window',
          'Agree a long-term design with security',
        ],
        explain: 'Move from symptom to component, restore, verify and then deal with the architecture decision.',
      },
    ],
  },
  description: `
## Symptoms
- Wednesday 19:01: \`prc-claims-intake\` and two other Runtime Fabric apps start failing on every Object Store operation. Claims stay in their queues.
- Runtime Manager shows all replicas as **Running**.
- \`kubectl get pods -n rtf\` shows \`persistence-gateway\` pods restarting and not ready.

## Change / Context
- Persistence Gateway is configured with a dedicated PostgreSQL database. Apps deployed with **Use Persistent Object Storage** rely on it for dedup keys.
- At 19:00 the DBA team rolled out security baseline v7 on all PostgreSQL servers, which rejects connections that do not use TLS. The change request listed "no application impact" because the database owner field said "Platform".
- The original platform engineer has left the company. The design document does not mention how the gateway connects.

## Logs
\`\`\`
19:00:05 INFO  [dba-change] pg-rtf-prod: hostnossl rejected, hostssl required for all users
19:00:41 ERROR [persistence-gateway-6dfb98949c-7xns9] Connecting to PostgreSQL backend... failed: SSL off
19:01:03 WARN  [kubectl] persistence-gateway-6dfb98949c-7xns9  0/1  Running  3 (12s ago)
19:01:15 ERROR [prc-claims-intake] OS:STORE_NOT_AVAILABLE Object store request failed
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
    'Apps reach Persistence Gateway through the Object Store Connector, and the gateway reaches PostgreSQL.',
    'The docs say that only plain text connections to the database are supported.',
    'Failures begin with the DBA change, and the gateway pod is the failing component.',
    'Replica status in Runtime Manager does not show this kind of dependency failure.',
    'The healthy gateway log says `Successfully connected to the PostgreSQL backend.`',
    'Do not try to force TLS in the connection URL as a fix: it is not supported.',
    'Long-term choices are a controlled exception or moving state elsewhere.',
    'Dependencies of platform components need an owner in the CMDB and in change review.',
  ],
  solution: `
**Diagnosis.** Work down the chain: the app reports Object Store errors, the gateway pods are not ready, and their logs show failed database connections. The database stopped accepting plain text at 19:00. The error text and the pod and app symptoms are illustrative, because the docs do not describe this failure; the limitation is documented: "Only plain text connections to the database are supported."

**Immediate mitigation.**
- Ask the DBA team to roll back the rule for the gateway user, as an emergency exception.
- Check the \`persistence-gateway\` pods are ready and that their logs show a successful connection.
- Test one Object Store operation from an affected app.
- Review the window. Depending on each app's error handling, messages can have been retried, or dedup checks skipped. Check for duplicates and reconcile.

**Root cause.** A database-wide security change was applied to a component with a documented limitation that nobody had recorded. Ownership was vague, so the change review found no consumer. The platform design had no statement about the plain text connection.

**Permanent fix.**
- Record the risk with the security team. Options: keep the database on a tightly restricted private segment, with a formal exception and compensating controls; or, for apps that need an encrypted path, keep that state in a database accessed through the Database Connector with TLS.
- Ask MuleSoft whether a later agent version changes this, and re-read the page at every upgrade.
- Classify what is held in the store, including whether it needs encryption by the app before storage.

**Prevention.** Name an owner for this database and record the Persistence Gateway dependency. Add it to the change review for database baselines. Alert on gateway pod readiness, not only on app status. Rehearse Object Store unavailability, so that apps fail in a controlled way.
`,
  followUps: [
    {
      q: 'Why are apps Running if a dependency is down?',
      a: 'Replica status reflects the app replicas. Persistence Gateway is a separate component in the rtf namespace, so check it and its dependency directly.',
    },
    {
      q: 'What other connection mistakes does the page warn about?',
      a: 'Do not use "@" in the database username, and encode the connection URL if the password contains special characters. The value of `secretRef: name` must match the Kubernetes secret, and `--from-literal=persistence-gateway-creds` must not be renamed.',
    },
    {
      q: 'What is the data retention of this store?',
      a: 'Persistence Gateway has a maximum TTL of 30 days, and after an app is deleted its persistent data may stay until the 60-minute cleanup runs.',
    },
    {
      q: 'Does changing the password need an app redeploy?',
      a: 'The sample pod log shows the gateway watching `/var/run/secrets/rtf-object-store/persistence-gateway-creds` for changes, which suggests it reacts to a secret update. The page does not state the rotation procedure, so test it first.',
    },
  ],
}
