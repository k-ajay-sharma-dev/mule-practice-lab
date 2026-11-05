export default {
  id: 'inc-162',
  category: 'incidents',
  title: 'Hybrid Dashboards Go Blank After the Monitoring Agent Is Reinstalled: the 3.x Installer Needs a Port the Firewall Never Allowed',
  level: 'INTERMEDIATE',
  tags: ['deployment', 'observability', 'anypoint-monitoring', 'hybrid', 'firewall', 'upgrade', 'on-prem'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-14 23:10:02 INFO  [change] node1: upgrade-tool completed, Mule 4.9 patched, Runtime Manager agent 2.8.x', relevant: false },
      { text: '2026-11-14 23:25:47 INFO  [change] node1: Anypoint Monitoring reinstalled from latest am.zip (installer 3.2.x), previously 2.x', relevant: true, why: 'The monitoring agent moved from a 2.x to a 3.x installer, which changes the outbound endpoint and adds port 8443.' },
      { text: '2026-11-14 23:40:15 INFO  [runtime-manager] Server node1: Running, connected', relevant: true, why: 'The Runtime Manager agent uses a different path, so its healthy status says nothing about monitoring export.' },
      { text: '2026-11-15 00:02:19 WARN  [mule_ee.log] [OkHttp https://us1.ingest.mulesoft.com:8443/...] Failed to export metrics... timeout', relevant: true, why: 'This is a documented symptom of port 8443 being blocked outbound or a proxy performing SSL inspection.' },
      { text: '2026-11-15 00:02:49 WARN  [mule_ee.log] java.net.ConnectException: Connection refused', relevant: true, why: 'Another documented symptom of the export path being blocked.' },
      { text: '2026-11-15 00:05:00 INFO  [orders-api] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-15 00:06:12 INFO  [firewall] DENY tcp 10.20.4.11 -> us1.ingest.mulesoft.com:8443', relevant: true, why: 'The firewall confirms the block. Its rules were written for the 2.x endpoint on port 443.' },
      { text: '2026-11-15 08:12:33 INFO  [orders-api] POST /orders 201 (84 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the empty dashboards?',
        options: [
          'The reinstall moved the agent to a 3.x installer, which sends data to `us1.ingest.mulesoft.com:8443`, and the outbound firewall does not allow that port',
          'The Runtime Manager agent certificate expired',
          'The apps stopped handling traffic',
          'The subscription tier changed and the agent must be reinstalled',
        ],
        answer: 0,
        explain: 'The 2.x installers used the `dias-ingestor-router` endpoint on 443. A 3.x agent needs 8443 outbound. Traffic is healthy, and the export errors match the Troubleshooting section.',
      },
      {
        type: 'single',
        prompt: 'What is the right fix?',
        options: [
          'Allow outbound traffic to the ingest endpoint on 8443, with SSL passthrough on any proxy or firewall that inspects it, and keep 443 for the other endpoints',
          'Open inbound 8443 from the internet to the servers',
          'Restart the Runtime Manager agent',
          'Change the agent port with `-t 443`',
        ],
        answer: 0,
        explain: 'All connections are outbound. The `-t` option sets the local telemetry listening port (default 8888), not the export destination.',
      },
      {
        type: 'multi',
        prompt: 'Which items should the network request include for the US control plane with a 3.x installer?',
        options: [
          '`us1.ingest.mulesoft.com:8443`',
          '`data-authenticator.anypoint.mulesoft.com:443`',
          '`s3.amazonaws.com:443`',
          'Inbound 5701 from the internet',
        ],
        answer: [0, 1, 2],
        explain: 'These are the listed 3.x outbound endpoints. Port 5701 is for cluster communication between nodes and has nothing to do with monitoring.',
      },
      {
        type: 'order',
        prompt: 'Order the steps after the firewall change.',
        items: [
          'Confirm the firewall rule on every node\'s source address',
          'Wait 10 minutes for the configuration to propagate',
          'Open an app in Anypoint Insights and check the JVM tab',
          'Check the data-transfer agent log for connection failures or retries',
          'Close the change, and update the network baseline',
        ],
        explain: 'The docs give the same verification route: wait 10 minutes, check CPU Utilization and Memory Utilization, then read logs if charts are empty.',
      },
      {
        type: 'multi',
        prompt: 'If the site routes monitoring through an outbound proxy, what else changes between 2.x and 3.x?',
        options: [
          '2.x supports SOCKS5 and not HTTP or HTTPS',
          '3.x supports HTTP and HTTPS and not SOCKS5',
          'The proxy is passed with `-p` during installation',
          'Special characters in the proxy user or password must be percent-encoded',
          'The Monitoring agent ignores proxies and always connects directly',
        ],
        answer: [0, 1, 2, 3],
        explain: 'A move to 3.x with a SOCKS5-only proxy would fail in a similar way. Runtime Manager must also be set up with the proxy first.',
      },
    ],
  },
  description: `
## Symptoms
- Sunday morning: all Anypoint Monitoring charts for the hybrid cluster are **empty since Saturday night**. The on-call engineer cannot see response times during a customer complaint.
- Runtime Manager shows both servers as **Running** and all apps as **Started**.
- Traffic is normal according to the load balancer. No customer errors are related to this.

## Change / Context
- On Saturday night the team applied a Mule patch with the upgrade tool. As required, they uninstalled the Anypoint Monitoring agent first and reinstalled it afterwards.
- Before the change the servers ran an agent from a **2.x installer**. The engineer downloaded the latest \`am.zip\` from Anypoint Monitoring.
- The data centre firewall only allows outbound traffic to named hosts on **443**. Those rules were written three years ago.
- There is no proxy between these servers and the internet.

## Logs
\`\`\`
23:25:47 INFO [change] node1: Anypoint Monitoring reinstalled from latest am.zip (installer 3.2.x)
00:02:19 WARN [mule_ee.log] [OkHttp https://us1.ingest.mulesoft.com:8443/...] Failed to export metrics... timeout
00:02:49 WARN [mule_ee.log] java.net.ConnectException: Connection refused
00:06:12 INFO [firewall] DENY tcp 10.20.4.11 -> us1.ingest.mulesoft.com:8443
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
    'Runtime Manager status comes from a different agent and path, so a Running server does not prove monitoring works.',
    'The upgrade tool flow needs the monitoring agent uninstalled and reinstalled, and that can change the installer version.',
    'Installer 2.x uses port 443 to the `dias-ingestor-router` host; installer 3.x uses 8443 to the regional ingest host, plus 443 for others.',
    'Documented failures: `Failed to export metrics... timeout`, `SSLHandshakeException: Remote host terminated the handshake`, `ConnectException: Connection refused`.',
    'Blocked 8443 or SSL inspection both stop metric export.',
    'A 3.x agent requires Runtime Manager agent 2.7.1 or higher.',
    'Verify after 10 minutes on the JVM tab; 3.x logs are in `./am/logs` or `/var/log/otel-collector`.',
    'Monitoring is outside the request path: the outage affects visibility, not traffic.',
  ],
  solution: `
**Diagnosis.** Traffic and server status are healthy, so this is a loss of telemetry, not an app failure. The timing matches the reinstall. \`mule_ee.log\` has the documented export failures, and the firewall log shows denied traffic to the ingest host on 8443.

**Immediate mitigation.**
- Use what still works during the wait: Runtime Manager status, the load balancer's statistics, and local logs in \`$MULE_HOME/logs\`.
- Raise an emergency firewall request for the outbound endpoints.
- Tell the support team that dashboards are unavailable, and from when, so that nobody reads an empty chart as zero traffic.

**Root cause.** The firewall allow list was tied to the 2.x endpoint. Downloading the latest installer moved the agent to the 3.x generation, which requires new outbound destinations and port 8443. The change plan treated the reinstall as a like-for-like step.

**Permanent fix.** Allow \`us1.ingest.mulesoft.com:8443\`, \`data-authenticator.anypoint.mulesoft.com:443\` and \`s3.amazonaws.com:443\` from each node. Use the matching list for your control plane; EU and other regions differ. If a proxy or firewall inspects TLS, enable SSL passthrough for \`*.ingest.mulesoft.com:8443\`. Then wait 10 minutes and check the **JVM** tab for each node. Repeat for every server, since the agent is per server.

**Prevention.**
- Keep network rules for monitoring in the runbook, by installer version.
- Check the Anypoint Monitoring installer release notes before a reinstall, and test in a non-production zone with the same firewall rules.
- Add a post-change step: confirm a fresh data point on the JVM tab before closing the change.
- Alert on missing data, so a blank dashboard is noticed within minutes rather than the next morning.
`,
  followUps: [
    {
      q: 'Could the engineer have kept using a 2.x installer?',
      a: 'The docs still list 2.x endpoints and its supported systems, but the Hybrid procedure says to install from the latest version of the installer. Going back only postpones the network change, and supported operating systems differ between generations, so fix the firewall.',
    },
    {
      q: 'What if the logs showed SSLHandshakeException: Remote host terminated the handshake?',
      a: 'That points towards a device inspecting TLS on the path. The documented remedy is to verify outbound 8443 and enable SSL passthrough.',
    },
    {
      q: 'Are metrics from the gap recovered later?',
      a: 'The hybrid page does not state a caching period for this case, so do not promise it. The 100 MB per replica cache is documented for Runtime Fabric, not hybrid servers.',
    },
    {
      q: 'What else would stop the agent installing?',
      a: 'An existing filebeat instance on the server, a Runtime Manager agent below 2.7.1 for a 3.x agent, or lack of root or administrator rights.',
    },
  ],
}
