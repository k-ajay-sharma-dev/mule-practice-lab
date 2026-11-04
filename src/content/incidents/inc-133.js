export default {
  id: 'inc-133',
  category: 'incidents',
  title: 'Every Hybrid Server Shows Disconnected and Apps Show Unknown, Yet Traffic Is Fine: the Agent Certificate Has Expired',
  level: 'INTERMEDIATE',
  tags: ['deployment', 'hybrid', 'runtime-manager', 'agent', 'certificates', 'observability'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '07:30:14 WARN  [runtime-manager] Server mule-prd-03 status: Disconnected', relevant: true, why: 'Runtime Manager shows this when a server certificate has expired, among other reasons.' },
      { text: '07:30:15 WARN  [runtime-manager] App prc-stock-sync status: Unknown', relevant: true, why: 'The app status is unknown because the agent cannot report. It does not mean that the app is down.' },
      { text: '07:31:02 INFO  [f5] pool mule-prd health 4/4 up, 212 req/s', relevant: true, why: 'Traffic is flowing, so the runtime is healthy. Only management is affected.' },
      { text: '07:33:47 ERROR [mule_agent] com.mulesoft.agent.transport.WSConnection: Failed attempt to connect nro. 1 to the web socket client at runtime-manager.anypoint.mulesoft.com: Connection refused.', relevant: true, why: 'The docs show this message for an expired certificate.' },
      { text: '07:34:00 INFO  [firewall] no rule changes in the last 30 days, outbound 443 permitted', relevant: true, why: 'This argues against a network cause, which is the other documented thing to check.' },
      { text: '07:35:20 INFO  [servers] all four servers were registered on the same day, two years ago', relevant: true, why: 'The key pair is valid for two years, which explains why they all failed at once.' },
      { text: '07:36:11 INFO  [prc-stock-sync] Processed 480 stock updates in 1.2 s', relevant: false },
      { text: '07:37:30 INFO  [health] GET /api/health 200 (4 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The agent key pair, valid for two years, has expired, so the mutual TLS connection to Runtime Manager has ended',
          'All Mule runtimes crashed at 07:30',
          'The Mule enterprise licence has expired, which stops all apps',
          'The apps were undeployed by Runtime Manager',
        ],
        answer: 0,
        explain: 'The combination of `Disconnected` servers, `Unknown` apps and healthy traffic fits the certificate page. The same-day registration explains why all four failed together.',
      },
      {
        type: 'single',
        prompt: 'What should the incident manager tell the business?',
        options: [
          'APIs keep serving, because the control plane is not in the request path; but deployments through Runtime Manager are blocked, and new or updated policies are not pulled until the connection returns',
          'All APIs are down until the certificate is renewed',
          'Nothing is affected at all, including deployments',
          'Apps will stop in 24 hours',
        ],
        answer: 0,
        explain: 'This is a management outage, not a traffic outage, which decides the priority and the way the fix is done.',
      },
      {
        type: 'single',
        prompt: 'Why can the team not use **Renew Certificate** in Runtime Manager now?',
        options: [
          'That action needs the server status to be `Running`. For an expired certificate, use the command-line renewer',
          'The option only exists for clusters',
          'It can be used only by MuleSoft Support',
          'It needs Mule to be stopped first',
        ],
        answer: 0,
        explain: 'The command-line method works even after expiry.',
      },
      {
        type: 'order',
        prompt: 'Order the steps for one server, using the command-line renewer.',
        items: [
          'Take the node out of the load balancer pool',
          'Download the matching `agent-certificate-renewer` JAR into `$MULE_HOME/bin` and make it executable',
          'Stop Mule',
          'Back up the `$MULE_HOME/conf` directory',
          'Run the JAR with your credentials or a registration token',
          'Start Mule, confirm the server is connected, and return the node to the pool',
        ],
        explain: 'The renewer needs Mule stopped, so go server by server to keep traffic flowing. The backup comes before anything changes `conf`.',
      },
      {
        type: 'multi',
        prompt: 'What prevents a repeat?',
        options: [
          'Track the certificate expiration date on each server dashboard, with a reminder well ahead of it',
          'Renew from Runtime Manager before expiry, then restart Mule manually',
          'Check that agents are version 1.10.0 or later, which the renewal feature needs',
          'Alert on Server disconnected events',
          'Delete and re-register servers every year',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Renewal is a routine task. Re-registering is unnecessary, and it would disturb the servers and their apps.',
      },
    ],
  },
  description: `
## Symptoms
- Thursday 07:30: Runtime Manager shows **all four production servers** as \`Disconnected\`, and all apps on them as \`Unknown\`.
- The on-call engineer raises a P1, expecting a full outage.
- The F5 load balancer shows all members healthy, and customers report no issues.
- A release planned for 10:00 cannot start, because Runtime Manager cannot reach the servers.

## Change / Context
- A distributor runs four Hybrid Standalone servers in its data centre. All four were registered during one project, two years ago.
- No firewall, proxy or Mule change has taken place this month.
- The company signs in to Anypoint Platform with an external identity provider.

## Logs
\`\`\`
07:30:14 WARN  [runtime-manager] Server mule-prd-03 status: Disconnected
07:30:15 WARN  [runtime-manager] App prc-stock-sync status: Unknown
07:31:02 INFO  [f5] pool mule-prd health 4/4 up, 212 req/s
07:33:47 ERROR [mule_agent] com.mulesoft.agent.transport.WSConnection: Failed attempt
          to connect nro. 1 to the web socket client at
          runtime-manager.anypoint.mulesoft.com: Connection refused.
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
    'Disconnected servers with Unknown apps, plus healthy traffic, means that management has failed, not the runtime.',
    'The agent connects with mutual SSL and stores its key pair in $MULE_HOME/conf/mule-agent.jks.',
    'The key pair is valid for two years. After that, the connection with Runtime Manager terminates.',
    'The expiry date is on the server dashboard. Check it, along with the licence and connectivity.',
    'Renewing in Runtime Manager needs status Running and agent 1.10.0 or later, followed by a manual runtime restart.',
    'The command-line agent-certificate-renewer works even after expiry, with Mule stopped and conf backed up.',
    'With an external identity, the renewer uses a registration token from the Add Server screen.',
    'Servers registered together expire together, so stagger the work and track the dates.',
  ],
  solution: `
**Diagnosis.** First separate traffic from management. The F5 shows healthy members and the apps are still processing, so this is not a P1 outage. Downgrade it, and keep the 10:00 release on hold.

Then follow the agent troubleshooting page, which says to verify that the licence and certificate have not expired, and then check connectivity. The docs for an expired certificate describe this exact picture: \`Disconnected\` in the server status, \`Unknown\` for apps, and the \`WSConnection\` message in \`mule_agent.log\`. The expiry date on each server's dashboard confirms it. Nothing changed on the network, and all four servers share a registration date.

**Immediate mitigation.**
- Tell stakeholders that APIs are serving and that deployments are blocked. New or updated policies are not pulled until the connection returns, so hold any policy changes too.
- Renew with the command-line method, because Runtime Manager can only renew while the server is \`Running\`.
- Work server by server, taking each out of the F5 pool, since Mule must be stopped.

For each server:
1. Download the \`agent-certificate-renewer-{version}.jar\` for your Mule version, and move it to \`$MULE_HOME/bin\` with execute permission.
2. Stop Mule, and back up \`$MULE_HOME/conf\`.
3. As this company uses an external identity, copy the registration token from **Runtime Manager > Servers > Add Server**, and run \`java -jar ./agent-certificate-renewer-{version}.jar -H <token>\`.
4. Start Mule, confirm that the server shows as connected, and return it to the pool.

The docs also note that MFA must be disabled before these steps, so check how this applies to your account and do not improvise.

**Root cause.** The agent authenticates to Runtime Manager with a key pair in \`mule-agent.jks\`, valid for two years. Nobody tracked the expiry date. All servers were registered in one project, so they all expired together.

**Permanent fix.** New certificates restore the connection and restart the two-year clock. Update old agents if the **Renew Certificate** action is missing: it requires agent 1.10.0 or later.

**Prevention.**
- Record certificate expiry dates in the operations calendar, with reminders ahead of them.
- Renew in Runtime Manager before expiry, then restart Mule at a planned time, because the new certificates only take effect after a manual restart.
- Stagger the renewals so that the servers are not all on the same date.
- Alert on **Server disconnected** events, and keep this scenario in the runbook, so the first response checks traffic before declaring an outage.
`,
  followUps: [
    { q: 'What if the dashboard showed a valid certificate?', a: 'Continue down the troubleshooting page: the required hosts and ports, a firewall or proxy intercepting the Runtime Manager certificate, the agent version, and whether mule-agent.yml is corrupted or empty.' },
    { q: 'Does an expired Mule licence look the same?', a: 'The troubleshooting page treats it as a separate check, with its dates on the same dashboard and a separate procedure. Check both dates.' },
    { q: 'How do you renew servers in a cluster before expiry?', a: 'Select the group or cluster, choose the servers, then Actions > Renew Certificate. Plan restarts one node at a time, because concurrent restarts can take apps offline.' },
  ],
}
