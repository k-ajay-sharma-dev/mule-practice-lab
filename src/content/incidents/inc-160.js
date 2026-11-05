export default {
  id: 'inc-160',
  category: 'incidents',
  title: 'Application Logs Vanish From Anypoint Monitoring After the Runtime Fabric Agent 3.0 Upgrade, While Metrics Keep Flowing',
  level: 'ADVANCED',
  tags: ['deployment', 'runtime-fabric', 'observability', 'logging', 'upgrade', 'anypoint-monitoring', 'kubernetes'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-07 22:04:12 INFO  [runtime-manager] Runtime Fabric prod-aks: upgrade to agent 3.0.38401 requested', relevant: true, why: 'This is the change. Agent 3.0.0 and later forward logs only through a sidecar in each replica.' },
      { text: '2026-11-07 22:11:40 INFO  [runtime-manager] Runtime Fabric prod-aks: status Active, version 3.0.38401', relevant: false },
      { text: '2026-11-07 22:12:03 INFO  [kubectl] daemonset.apps "am-log-forwarder" not found in namespace rtf', relevant: true, why: 'The DaemonSet forwarding mechanism no longer exists on this fabric.' },
      { text: '2026-11-08 08:31:55 INFO  [monitoring] Log search: app=sys-claims-api, last 12h: 0 results; latest entry 2026-11-07 22:06:18', relevant: true, why: 'Logs stop around the upgrade, not at a random moment.' },
      { text: '2026-11-08 08:32:40 INFO  [monitoring] Anypoint Insights: sys-claims-api requests 412/min, failures 0.1%, JVM data current', relevant: true, why: 'Metrics travel by the sidecar and are still arriving, so the app and its network path to the ingest endpoint work.' },
      { text: '2026-11-08 08:34:10 INFO  [runtime-manager] sys-claims-api: last deployment 2026-10-02, 3/3 replicas Running', relevant: true, why: 'The app was last deployed before the upgrade and never redeployed, so it has not been switched to sidecar log forwarding.' },
      { text: '2026-11-08 08:36:22 INFO  [api] GET /fabrics/{fabricId}/logforwarding: appScoped=false', relevant: true, why: 'Application-scoped log forwarding was turned off on this fabric, the first step the migration page covers.' },
      { text: '2026-11-08 08:37:01 INFO  [kubectl] sys-claims-api-7f9c6b-x2lpq  2/2  Running  0  36d', relevant: false },
      { text: '2026-11-08 08:40:15 INFO  [sys-claims-api] GET /api/health 200 (3 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the missing logs?',
        options: [
          'Agent 3.0.0 removed the DaemonSet log forwarder, and the required migration was not completed: app-scoped forwarding was off and apps were not redeployed onto sidecar forwarding',
          'The Anypoint Monitoring ingest endpoint is unreachable from the cluster',
          'The apps stopped writing logs because their log level changed',
          'The subscription was downgraded during the upgrade',
        ],
        answer: 0,
        explain: 'Metrics still flow, so the network path works. The docs say that failing to complete the migration may disrupt log forwarding, and that apps forwarding through the DaemonSet must be redeployed.',
      },
      {
        type: 'single',
        prompt: 'What is the correct recovery on this fabric?',
        options: [
          'Enable application-scoped log forwarding through the Runtime Fabric API, redeploy the apps a few at a time, then verify in Anypoint Monitoring',
          'Reinstall the `am-log-forwarder` DaemonSet by hand with kubectl',
          'Restart every worker node',
          'Reinstall Runtime Fabric with `rtfctl`',
        ],
        answer: 0,
        explain: 'The fix follows the documented migration steps, which are written for before the upgrade, so they are the closest documented route rather than a stated recovery procedure. A redeployment, triggered by any update to the app, switches it to sidecar forwarding. Agent 3.0.0 has no DaemonSet mechanism to restore.',
      },
      {
        type: 'multi',
        prompt: 'Which checks belong in the redeployment plan?',
        options: [
          'Plan sidecar capacity per replica: up to 30% of the replica CPU limit and up to 150 MiB with logs enabled',
          'Allow for one additional replica\'s worth of resources during rolling updates',
          'Use `kubectl logs` for urgent diagnosis until forwarding is back',
          'Confirm in Log Search that entries arrive for each app after its redeployment',
          'Turn off metrics to free capacity for logs',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Redeploying many apps at once on a tight cluster can fail for lack of capacity. Metrics are not the problem here, and they are collected automatically.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm that metrics flow while logs stopped at the upgrade time',
          'Confirm the agent version and that the DaemonSet is gone',
          'Check capacity for the new sidecar on the worker nodes',
          'Enable application-scoped log forwarding',
          'Redeploy apps in batches, most critical first',
          'Verify logs for every app and record the gap in the incident report',
        ],
        explain: 'Diagnose, check capacity, then fix in a controlled order. Do not promise that the gap can be refilled until you have verified it.',
      },
      {
        type: 'multi',
        prompt: 'Which actions prevent a repeat?',
        options: [
          'Read the agent release notes and migration pages before any major agent upgrade',
          'Upgrade a non-production fabric first, and check logs, not only status Active',
          'Add a check to the runbook for logs per app after each fabric upgrade',
          'Alert when an important app has no log entries for a set period',
          'Skip agent upgrades until end of support',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The docs ask you to verify upgrades on a non-production instance. A fabric status of Active says nothing about log forwarding, so the check must look at logs.',
      },
    ],
  },
  description: `
## Symptoms
- Sunday 8 November 08:30: the support team searches Anypoint Monitoring for a claims failure. **Log Search shows nothing since about 22:06 on Saturday**, for all apps on fabric \`prod-aks\`.
- Anypoint Insights still shows current traffic, failures and JVM data.
- Runtime Manager shows the fabric as **Active** and all apps as **Running**.

## Change / Context
- On Saturday night the platform team upgraded the Runtime Fabric agent from 2.11 to 3.0 on this Helm-installed fabric. The change record said "agent upgrade, no app impact".
- 85 apps are on the fabric, most last deployed weeks ago. The non-production fabric had been upgraded earlier, but apps there are redeployed daily.
- The organisation has Anypoint Platform Integration Advanced.
- Worker nodes run at about 80% of reserved capacity.

## Logs
\`\`\`
22:04:12 INFO [runtime-manager] prod-aks: upgrade to agent 3.0.38401 requested
22:12:03 INFO [kubectl] daemonset.apps "am-log-forwarder" not found in namespace rtf
08:31:55 INFO [monitoring] Log search: sys-claims-api: latest entry 2026-11-07 22:06:18
08:32:40 INFO [monitoring] Insights: sys-claims-api requests 412/min, JVM data current
08:36:22 INFO [api] GET /fabrics/{fabricId}/logforwarding: appScoped=false
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
    'Starting with agent 3.0.0, the DaemonSet log forwarding is removed and logs go only through a sidecar per replica.',
    'If the DaemonSet is in use, migration must be completed before upgrading, or log forwarding may be disrupted.',
    'The steps are: enable application-scoped log forwarding, redeploy apps, remove the DaemonSet, verify.',
    'Metrics continuing is the clue that the app, the sidecar and the network are fine.',
    'Application-scoped forwarding is on for most fabrics, but it can have been disabled, and then it needs an API call.',
    'From 3.0.0 the sidecar needs up to 30% of the replica CPU limit and up to 150 MiB with logs. Rolling updates need one extra replica of resources.',
    'A fabric status of Active does not prove log forwarding works.',
    'The non-production test passed only because those apps were redeployed daily, so it did not represent production.',
  ],
  solution: `
**Diagnosis.** Logs stop minutes after the upgrade, across all apps, while metrics stay current. That rules out the network path, the apps and the subscription. The DaemonSet \`am-log-forwarder\` is gone, apps were last deployed before the upgrade, and \`appScoped=false\`. In agent 3.0.0 and later the DaemonSet mechanism no longer exists.

**Immediate mitigation.**
- Use \`kubectl logs\` for urgent support questions: apps on Runtime Fabric commonly log to stdout, and the app container is running.
- Check capacity. At 80% of reserved capacity, 85 redeployments with a larger sidecar can fail, so work out headroom first and add nodes if required.
- Enable application-scoped forwarding:

\`\`\`bash
curl -X PATCH -H 'Authorization: Bearer {authToken}' \\
  https://anypoint.mulesoft.com/runtimefabric/api/organizations/{orgId}/fabrics/{fabricId}/logforwarding/appScoped?enabled=true
\`\`\`

- Redeploy apps in batches, the most critical first. Any update to the app in Runtime Manager, or the Runtime Manager API, triggers a redeployment.
- Verify each app in Log Search.

**Root cause.** The change was treated as an internal agent upgrade, but the 3.0.0 release changes the log architecture and requires action before the upgrade. The migration page was not in the plan, this fabric had application-scoped forwarding turned off, and its apps still relied on the DaemonSet. Non-production hid the problem because daily redeployments had already moved those apps to sidecars.

**Permanent fix.** Finish the migration on every fabric, confirm the \`am-log-forwarder\` DaemonSet is absent, and update capacity models with the sidecar requirements. Treat the logs of the gap as lost for Anypoint Monitoring until proven otherwise, and record it for audit.

**Prevention.** Review release notes and migration pages for each agent major version. Make non-production representative by including apps that have not been redeployed recently. Add per-app log presence to the upgrade verification, and alert on silent apps.
`,
  followUps: [
    {
      q: 'Why not just downgrade the agent?',
      a: 'A downgrade path exists (PATCH or `helm upgrade` plus turning daemon-set forwarding back on), but the page is written for version 2.x and it adds another change during an incident. Moving forward with the documented migration is cleaner, so confirm with Support before going back.',
    },
    {
      q: 'Can the missing hours be backfilled?',
      a: 'Do not assume so. Each replica stores up to 450 MB of log data on disk and the sidecar forwards from there. But the docs do not state what happens to entries written before the sidecar existed. Treat them as unavailable in Anypoint Monitoring and use container logs if retained.',
    },
    {
      q: 'Why does the 450 MB limit matter here?',
      a: 'It is a rotation limit. Busy apps rotate older log data out, so any long delay in forwarding risks losing entries, and the sidecar transmits at most 300 KB per second per replica.',
    },
  ],
}
