export default {
  id: 'inc-035',
  category: 'incidents',
  title: 'Deployment Never Becomes Healthy Because the Database Is in Maintenance',
  level: 'INTERMEDIATE',
  tags: ['deployment', 'startup', 'connectivity', 'database', 'resilience'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '22:00:00.000 INFO  [change-calendar] customer DB (cust-db.corp) planned maintenance 22:00-23:00', relevant: true, why: 'The release was started inside a known DB maintenance window.' },
      { text: '22:05:30.112 INFO  [runtime-manager] Stopping customer-sapi v3.1.4 (replace strategy, not rolling)', relevant: true, why: 'The old version was stopped first, so a failed start of the new version means a full outage.' },
      { text: '22:05:41.850 INFO  [customer-sapi] Initialising config \'HTTP_Listener_config\'', relevant: false },
      { text: '22:05:41.990 INFO  [customer-sapi] Testing connectivity for config \'Database_Config\'', relevant: false },
      { text: '22:06:12.004 ERROR [customer-sapi] Connectivity test failed for config \'Database_Config\' DB:CONNECTIVITY Cannot get connection for URL jdbc:sqlserver://cust-db.corp:1433 ... Connection refused', relevant: true, why: 'The startup connectivity test fails because the DB is down for maintenance.' },
      { text: '22:06:12.010 ERROR [customer-sapi] Could not initialise application \'customer-sapi\' ... failed to start', relevant: true, why: 'The failed connectivity test is configured to block deployment, so the app never starts. The HTTP fix itself is irrelevant.' },
      { text: '22:06:13.400 INFO  [customer-sapi] Initialising config \'SMTP_Config\' skipped (startup aborted)', relevant: false },
      { text: '22:10:00.000 INFO  [anypoint-monitoring] call-centre-eapi health check 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the deployment fail?',
        options: [
          'Mule tests DB connectivity at startup, the DB is in planned maintenance, and the failed test blocks deployment',
          'The HTTP endpoint fix contains a syntax error',
          'The SMTP server rejected the alert email configuration',
          'CloudHub ran out of capacity in the region',
        ],
        answer: 0,
        explain: 'The connectivity test on `Database_Config` fails with connection refused during the 22:00-23:00 window, and that failure prevents the app from initialising.',
      },
      {
        type: 'single',
        prompt: 'Will redeploying the **old** version restore service right now?',
        options: [
          'Yes, the old version worked an hour ago',
          'No, it tests the same DB connection at startup and will fail the same way until the DB is back or startup behaviour is relaxed',
          'Yes, because old versions skip connectivity tests',
          'Only if you add more replicas',
        ],
        answer: 1,
        explain: 'The problem is the dependency, not the version. Options: ask the DBA to finish early, or deploy with relaxed startup behaviour so the app starts and serves what it can; inform the call centre.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Reconnection strategies, and decide per config whether a failed connectivity test should fail deployment (not for SMTP)',
          'Return a fast 503 from DB-dependent endpoints when the DB is unavailable',
          'Use rolling updates so old replicas keep serving until new ones are ready',
          'Turn off connectivity testing for every config in production and never test connections',
        ],
        answer: [0, 1, 2],
        explain: 'Make startup tolerant where it should be, degrade clearly and never stop the old version before the new one is healthy. Blanket disabling of connectivity tests is a development aid, not a production policy.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Read the startup log: DB connectivity test failed',
          'Correlate with the DB maintenance window on the change calendar',
          'Inform the call centre with an ETA and ask the DBA about finishing early',
          'Deploy once the DB is back (or with relaxed startup) and smoke-test',
          'Switch to rolling updates and add a change-calendar check to the release runbook',
        ],
        explain: 'Diagnose, confirm the cause, communicate, restore and verify, then fix the process.',
      },
    ],
  },
  description: `
## Symptoms
- A routine redeploy of \`customer-sapi\` (only an HTTP endpoint fix) started at 22:05.
- Runtime Manager shows the new version stuck in **Deploying**, then **Failed** after a while. The old version was already stopped.
- The API has been down for 25 minutes; the API is used by the call centre 24/7.

## Change / Context
- The app has three configs: HTTP listener, Database (customer DB) and an SMTP config for alert emails. The Database config's reconnection element sets \`failsDeployment="true"\` (the default is false).
- The DBA team scheduled **maintenance on the customer DB from 22:00 to 23:00**.
- The deployment strategy used is not rolling — the old version was replaced.

## Logs
\`\`\`
22:05:41.902 INFO  [customer-sapi] Initialising config 'Database_Config'
22:05:41.990 INFO  [customer-sapi] Testing connectivity for config 'Database_Config'
22:06:12.004 ERROR [customer-sapi] Connectivity test failed for config 'Database_Config' DB:CONNECTIVITY
  Cannot get connection for URL jdbc:sqlserver://cust-db.corp:1433 ... Connection refused
22:06:12.010 ERROR [customer-sapi] Could not initialise application 'customer-sapi' ... failed to start
\`\`\`

## Your tasks
1. Why does the deployment fail?
2. How do you restore service now?
3. What should change in the app and the release process?
4. How do you prevent this?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Mule tests connectivity of configs at startup; with a failing connection (and failsDeployment/ reconnection behaviour) the app does not start.',
    'The DB is down for planned maintenance, so a release in that window cannot start — the app code is not the problem.',
    'Immediate: avoid restarting into the DB outage — redeploy the previous version only if it would start, or wait for the DB / restore and communicate; next time keep the old version running.',
    'Fix: decide per connector whether a dependency should block startup; use reconnection strategies and lazy connection so the app can start and return 503 for DB-dependent endpoints.',
    'Process: zero-downtime/rolling deployments, a change calendar check and readiness checks before cutting traffic.',
  ],
  solution: `
## Diagnosis
On startup Mule initialises configurations and **tests connectivity**. The DB is in planned maintenance, the connectivity test fails, and the app is configured so that this failure prevents deployment. The old version was already stopped, so the service is fully down — the HTTP fix itself is irrelevant.

## Immediate mitigation
- Any version (old or new) will fail to start the same way while the DB is down, so redeploying the old one doesn't help by itself.
- Fastest options: ask the DBA whether maintenance can finish early, or deploy with the startup connectivity behaviour relaxed (see below) so the app starts and serves what it can. Inform the call centre with an ETA.
- Once the DB is back, the deployment will succeed; verify with smoke tests.

## Root cause
A release scheduled inside a known DB maintenance window, a non-rolling deployment that stopped the old version first, and a startup that hard-depends on the DB being reachable.

## Permanent fix
- Configure **reconnection strategies** (e.g. reconnect forever with a sensible frequency) and decide whether a failed connectivity test should fail deployment (\`failsDeployment\` on the reconnection configuration). For non-critical dependencies (SMTP) it should not.
- When the app starts without the DB, endpoints that need it should return a fast **503** with a clear message instead of hanging.
- Use CloudHub 2.0 **rolling updates** so the old replicas keep serving until new ones are ready.

## Prevention
- Check the change calendar (DB, network, SaaS maintenance) before releases.
- Readiness/health endpoint that reflects dependency status for monitoring, separate from liveness.
- Release runbook with explicit rollback criteria and time limit.
`,
  followUps: [
    { q: 'Is it always good to let an app start when its database is down?', a: 'Not always. For a pure DB system API, failing fast can be clearer; but you should still keep the previous version running (rolling deploy) so a failed start does not mean an outage.' },
    { q: 'How do you stop a failed connectivity test from failing the deployment?', a: 'Leave failsDeployment false (its default) on the reconnection element of that config. It is set per config; the Mule reconnection docs list no global system property for skipping connectivity tests, so do not rely on one.' },
  ],
}
