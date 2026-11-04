export default {
  id: 'inc-031',
  category: 'incidents',
  title: 'UnknownHostException for Internal Hosts After a DNS Change',
  level: 'INTERMEDIATE',
  tags: ['networking', 'dns', 'connectivity', 'cloudhub-2', 'private-space'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '08:00:01.233 INFO  [hr-sapi] Syncing employee changes corrId=e011', relevant: false },
      { text: '08:00:01.540 INFO  [hr-sapi] GET https://api.workday-sandbox.com/v1/workers 200 (310 ms) corrId=e011', relevant: true, why: 'Public names still resolve and connect, so general DNS and outbound networking work.' },
      { text: '08:00:06.240 ERROR [hr-sapi] HTTP:CONNECTIVITY HTTP GET on resource \'https://hr-core.corp.internal:8443/api/employees\' failed: java.net.UnknownHostException: hr-core.corp.internal corrId=e011', relevant: true, why: 'UnknownHostException: the name could not be resolved, so no TCP connection was even attempted. It is DNS, not firewall or the HR server.' },
      { text: '08:00:06.241 ERROR [hr-sapi] Retry 1/3 ...', relevant: false },
      { text: '08:00:30.000 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '08:00:31.002 INFO  [private-space] DNS forwarding rule corp.internal -> 10.10.0.53, 10.10.0.54 (unchanged since 2024-03-11)', relevant: true, why: 'The Private Space still forwards corp.internal to the old DNS servers, which were decommissioned on Sunday.' },
      { text: '08:01:02.119 INFO  [network-ops] corp DNS migrated to 10.20.0.53/10.20.0.54; old servers decommissioned Sun 22:00', relevant: true, why: 'Office laptops use the new DNS servers, which is why the network team can resolve the host.' },
      { text: '08:01:10.444 INFO  [hr-sapi] Scheduler next run at 08:15:00', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The Private Space custom DNS still forwards corp.internal to the decommissioned DNS servers, so the name cannot be resolved',
          'A firewall rule blocks port 8443 from the Private Space to the HR server',
          'The HR server is down',
          'The TLS certificate of hr-core expired',
        ],
        answer: 0,
        explain: '**UnknownHostException** happens before any connection: name resolution failed. Only the forwarded corp.internal zone fails, and its forwarders point to switched-off servers. A firewall issue would show a connect timeout or refused.',
      },
      {
        type: 'single',
        prompt: 'How do you restore the integration quickly and correctly?',
        options: [
          'Put 10.40.12.15 in the app properties instead of the hostname',
          'Update the Private Space DNS forwarding to the new DNS server IPs, check port 53 is allowed over the VPN, restart if needed and replay the missed sync',
          'Add more replicas to hr-sapi',
          'Raise the HTTP connection timeout',
        ],
        answer: 1,
        explain: 'Fix the resolver configuration. Hard-coding the IP breaks TLS hostname verification and fails again when the IP changes.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Forward to more than one DNS server for redundancy',
          'Add Private Spaces / VPCs / on-prem runtimes to the network change checklist',
          'Synthetic checks that resolve and call key internal hosts, plus alerts on UnknownHostException',
          'Keep the HR server IP hard-coded permanently as a fallback',
        ],
        answer: [0, 1, 2],
        explain: 'Redundant DNS, inclusion in change management and synthetic monitoring. Hard-coded IPs are brittle and break TLS verification.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Read the exception: UnknownHostException means DNS resolution',
          'Compare the Private Space DNS forwarders with the new corporate DNS IPs',
          'Update the forwarding rule and confirm port 53 is reachable',
          'Restart if needed and replay the missed sync window',
          'Add the Private Space to the network change inventory and add synthetic checks',
        ],
        explain: 'Classify the error, find the stale config, fix it, recover data and prevent the gap in change management.',
      },
    ],
  },
  description: `
## Symptoms
- Since the old DNS servers were switched off on Sunday night, after the weekend's network maintenance, \`hr-sapi\` (CloudHub 2.0, Private Space connected to the corporate network over VPN) fails **every** call to the on-prem HR system \`hr-core.corp.internal\`.
- Calls to public SaaS endpoints from the same app work.
- The network team says "the HR server is up, we can reach it from the office by IP and by name".

## Change / Context
- During the maintenance the corporate DNS servers were migrated to new IP addresses. Old DNS servers were decommissioned on Sunday.
- The Private Space has **custom DNS** configured to forward \`corp.internal\` to the old DNS server IPs.
- \`nslookup hr-core.corp.internal\` from an office laptop returns \`10.40.12.15\`.

## Logs
\`\`\`
08:00:01.233 INFO  [hr-sapi] Syncing employee changes corrId=e011
08:00:06.240 ERROR [hr-sapi] HTTP:CONNECTIVITY HTTP GET on resource 'https://hr-core.corp.internal:8443/api/employees' failed:
  java.net.UnknownHostException: hr-core.corp.internal corrId=e011
08:00:06.241 ERROR [hr-sapi] Retry 1/3 ...
\`\`\`

## Your tasks
1. What is the root cause?
2. How do you restore the integration quickly?
3. What is the permanent fix?
4. How would you detect this earlier next time?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'UnknownHostException means name resolution failed — no TCP connection was attempted, so it is DNS, not firewall or the target server.',
    'Public names work because they use the default resolver; only the corp.internal zone is forwarded to the decommissioned DNS servers.',
    'Immediate: update the Private Space DNS forwarding to the new DNS server IPs (and confirm they are reachable over the VPN/firewall on port 53).',
    'Avoid hard-coding IPs in the app as a "fix"; if used as an emergency workaround it must be reverted (TLS hostname verification also breaks with raw IPs).',
    'Prevention: include integration platforms in the network change checklist and run synthetic checks that resolve and call key internal hosts.',
  ],
  solution: `
## Diagnosis
\`java.net.UnknownHostException\` means the JVM could not **resolve the name** to an IP — the request never reached the network path to the HR server. Public hosts still resolve, so general DNS works; only the \`corp.internal\` zone fails. That zone is forwarded by the Private Space's custom DNS configuration to the **old DNS servers**, which were switched off on Sunday. The office laptops work because they already use the new DNS servers.

## Immediate mitigation
Update the Private Space DNS settings in Runtime Manager to forward \`corp.internal\` to the **new** DNS server IPs; make sure the firewall/VPN allows UDP/TCP 53 from the Private Space to them. Restart the app if needed (JVM caches failed lookups only briefly, but connection pools may hold state), then replay the missed sync window.

## Root cause
The DNS migration changed the server IPs, but the MuleSoft Private Space was not in the inventory of systems using those DNS servers.

## Permanent fix
- Correct DNS forwarding (ideally to more than one DNS server for redundancy).
- Do not "fix" it by putting \`10.40.12.15\` in the app: IPs change, and TLS hostname verification will fail against an IP.

## Prevention
- Add CloudHub Private Spaces / VPCs / on-prem runtimes to the network change checklist.
- Synthetic monitoring (a small health endpoint that resolves and calls key internal hosts), alerting on \`UnknownHostException\` patterns in logs.
`,
  followUps: [
    { q: 'How do you tell a DNS problem from a firewall problem in Mule logs?', a: 'UnknownHostException is DNS (no IP); a connect timeout or "connection refused" happens after resolution and points to routing, firewall or the service itself.' },
    { q: 'Why might a fixed DNS still fail for a few minutes?', a: 'Resolvers and the JVM cache results (including negative results) for a TTL, so it can take until the cache expires or the app restarts.' },
  ],
}
