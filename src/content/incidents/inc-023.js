export default {
  id: 'inc-023',
  category: 'incidents',
  title: 'On-Prem Database Unreachable From Some Workers After a Firewall Migration',
  level: 'ADVANCED',
  tags: ['networking', 'firewall', 'vpc', 'cloudhub', 'connectivity'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '08:14:02.110 INFO  [finance-sapi] worker-1 ip=10.20.0.37  SELECT ... -> 120 rows', relevant: false },
      { text: '08:14:03.500 INFO  [finance-sapi] worker-3 ip=10.20.0.201 GET https://hr-api.dc.example/employees -> 200', relevant: true, why: 'The failing worker reaches another on-prem system, so the VPN and routing work; only the Oracle path is blocked.' },
      { text: '08:14:05.881 ERROR [finance-sapi] worker-3 ip=10.20.0.201 DB:CONNECTIVITY ... SocketTimeoutException: connect timed out', relevant: true, why: 'Connect timed out means packets are silently dropped, typical of a firewall deny, not a refused port or DNS issue.' },
      { text: '08:15:36.004 ERROR [finance-sapi] worker-3 ip=10.20.0.201 Reconnection attempts exhausted', relevant: false },
      { text: 'FW: DENY tcp 10.20.0.201:50412 -> 172.16.8.15:1521 rule=implicit-deny', relevant: true, why: 'The new firewall drops traffic from the worker in the .128-.255 half of the VPC.' },
      { text: 'FW: ALLOW tcp 10.20.0.37:41877 -> 172.16.8.15:1521 rule=MULE-VPC-ORACLE (10.20.0.0/25)', relevant: true, why: 'The migrated rule is a /25 (0-127), not the original /24, so only workers with low IPs are allowed.' },
      { text: '08:16:00.002 INFO  [health] worker-2 GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The migrated firewall rule allows 10.20.0.0/25 instead of /24, so workers with IPs .128-.255 are dropped',
          'The Oracle listener is overloaded',
          'The IPsec VPN tunnel is flapping',
          'DNS resolves the Oracle host differently per worker',
        ],
        answer: 0,
        explain: 'The firewall log shows .37 allowed by a /25 rule and .201 denied. Workers get new VPC IPs on each deployment, which is why the failing set changes after a redeploy.',
      },
      {
        type: 'match',
        prompt: 'Match each error to its most likely network cause.',
        pairs: [
          ['connect timed out', 'A firewall silently drops the packets'],
          ['Connection refused', 'The host answers but nothing listens on the port, or the firewall rejects'],
          ['UnknownHostException', 'DNS cannot resolve the name'],
        ],
        explain: 'Knowing these three patterns lets you tell firewall, port and DNS problems apart from the logs alone.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Correct the rule to the full VPC CIDR 10.20.0.0/24',
          'Manage firewall rules as code and diff old vs new rule sets during migrations',
          'Synthetic per-worker connectivity checks to each backend host and port',
          'Log the worker IP on connectivity errors',
          'Pin the workers to fixed IPs in the low range',
        ],
        answer: [0, 1, 2, 3],
        explain: 'CloudHub assigns worker IPs from the VPC range; you cannot rely on them staying in a sub-range. Fix the rule and verify after every network change.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Correlate failing workers with their IPs and the firewall log',
          'Escalate to the network team with the DENY and ALLOW lines',
          'Have the rule source changed to 10.20.0.0/24',
          'Verify DB connectivity from every worker',
          'Add rule diffs and post-change connectivity tests to the process',
        ],
        explain: 'Gather evidence, escalate with proof, fix, verify on all workers, then improve the change process.',
      },
    ],
  },
  description: `
## Symptoms
- \`finance-sapi\` runs on CloudHub 1.0 with 4 workers, in an Anypoint VPC connected to the data centre over IPsec VPN.
- Since Sunday's infrastructure window, it has **intermittent failures** reaching the on-prem Oracle DB.
- Some workers fail **every** call; others never fail. After a redeploy, the **set of failing workers changes**.
- Calls to other on-prem systems (an HTTP API on a different subnet) work from all workers.

## Change / Context
- Network team migrated the data-centre firewall to a new cluster on Sunday. Their change record says *"all rules migrated 1:1"*.
- Anypoint VPC CIDR is **10.20.0.0/24**. The old firewall rule allowed \`10.20.0.0/24 → 172.16.8.15:1521\`.
- The DB connector uses \`connectionTimeout=30s\`; reconnection is configured (3 attempts).

## Logs
\`\`\`
08:14:02.110 INFO  [finance-sapi] worker-1 ip=10.20.0.37  SELECT ... -> 120 rows
08:14:05.881 ERROR [finance-sapi] worker-3 ip=10.20.0.201
  DB:CONNECTIVITY Could not obtain connection ... IO Error: The Network Adapter could not
  establish the connection ... Caused by: java.net.SocketTimeoutException: connect timed out
08:15:36.004 ERROR [finance-sapi] worker-3 ip=10.20.0.201 Reconnection attempts exhausted
\`\`\`
Firewall log (new cluster):
\`\`\`
DENY tcp 10.20.0.201:50412 -> 172.16.8.15:1521 rule=implicit-deny
ALLOW tcp 10.20.0.37:41877 -> 172.16.8.15:1521 rule=MULE-VPC-ORACLE (10.20.0.0/25)
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
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
    'Identifies the migrated rule allows 10.20.0.0/25 (10.20.0.0–10.20.0.127) instead of /24, so workers with IPs in the upper half (e.g. 10.20.0.201) are dropped.',
    'Explains the moving failures: worker private IPs are assigned from the VPC CIDR on each deployment, so a redeploy changes which workers fall outside the rule.',
    'Reads the error correctly: "connect timed out" (silent drop by firewall) rather than "connection refused" (port closed) or an unknown host (DNS).',
    'Immediate: ask the network team to correct the rule to the full VPC CIDR; any workaround that relies on worker IPs (scaling down to "good" workers) is fragile because IPs change on restart.',
    'Permanent fix: rules defined for the whole VPC CIDR, managed as code with automated comparison of old vs new rule sets during migrations.',
    'Prevention: synthetic connectivity checks from the VPC to every critical backend after network changes, with alerts.',
  ],
  solution: `
**Diagnosis.** The new firewall log says it all: \`10.20.0.37\` is allowed by rule *MULE-VPC-ORACLE* (**10.20.0.0/25**), \`10.20.0.201\` is denied by implicit deny. A \`/25\` covers only **10.20.0.0–10.20.0.127**; the VPC is a \`/24\` (0–255). The migration was not "1:1" — the prefix was changed (typo or tool conversion). CloudHub workers get private IPs **from the VPC range on each deployment**, so whichever workers land in .128–.255 can't reach Oracle, and a redeploy reshuffles that. The error is **connect timed out** because a firewall *drop* gives no response (a *reject* or a closed port would be "connection refused"; DNS problems would be "unknown host"). The HTTP API works because it's reached via a different rule/subnet.

**Immediate mitigation.** Escalate to the network team with the firewall log lines: change the rule source to **10.20.0.0/24**. Verify from every worker (logs with worker IP, or a network-diagnostics app deployed in the same VPC). If the fix will take time, a short-term workaround is to stop the failing workers' traffic (scale down to workers in the allowed range). But it's fragile because IPs change on restart.

**Root cause.** A firewall migration that altered a rule's source CIDR, with no verification of effective connectivity from all source addresses afterwards.

**Permanent fix.**
- Correct the rule to the full VPC CIDR (and any other VPC ranges in use, e.g. after VPC expansion).
- Manage firewall rules **as code** (or at least exportable lists) and do an automated **diff of old vs new** rule sets during migrations, flagging any change in prefix length.
- Log the worker IP on connectivity errors (it made this diagnosable).

**Prevention.** After any network change: a scripted connectivity test from the VPC to each backend host:port; continuous synthetic checks (e.g. a health flow that tests DB connectivity on every worker and reports per-worker status); the network team's change template includes "Anypoint VPC CIDR(s)" as a dependency to validate with the integration team.
`,
  followUps: [
    { q: 'How do you tell a DNS issue, a firewall drop and a closed port apart from Mule errors?', a: 'DNS problems give UnknownHostException-type errors immediately; a closed port or firewall reject gives "connection refused" quickly; a firewall drop or routing problem gives a connect timeout after the configured timeout.' },
    { q: 'Why can\'t you just give the workers static IPs?', a: 'Private IPs of CloudHub workers in a VPC are assigned dynamically from the VPC CIDR. Firewall rules must therefore cover the whole CIDR (static IPs exist only for the public egress side and need a separate setup).' },
    { q: 'How would you have detected this before users did?', a: 'A post-change connectivity test from the VPC as part of the network change plan, and a per-worker health check that alerts when any worker cannot reach a critical dependency.' },
  ],
}
