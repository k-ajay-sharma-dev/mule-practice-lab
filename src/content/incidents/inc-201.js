export default {
  id: 'inc-201',
  category: 'incidents',
  title: 'Regional Failover Works, but Partners Keep Calling the Dead Region for an Hour: a One Hour DNS TTL and Cached Lookups',
  level: 'EXPERT',
  tags: ['disaster-recovery', 'dns', 'failover', 'partners', 'networking'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-18 03:05:00 ERROR [region-eu1] Region health check failed, failover started', relevant: false },
      { text: '2026-11-18 03:07:40 INFO  [dns] api.lumenpay.example now points to eu2 ttl=3600', relevant: true, why: 'The record changed, but resolvers may keep the old answer for up to an hour.' },
      { text: '2026-11-18 03:08:10 INFO  [eu2-gateway] Requests per minute=310 normal=4200', relevant: true, why: 'Only a few clients reach the new region.' },
      { text: '2026-11-18 03:40:22 WARN  [partner-monitor] partner=fleetco still failing, resolves api.lumenpay.example to eu1', relevant: true, why: 'A partner still gets the old address from its cache.' },
      { text: '2026-11-18 04:09:55 INFO  [eu2-gateway] Requests per minute=4100', relevant: true, why: 'Traffic returns about an hour later, when the cached answers expire.' },
      { text: '2026-11-18 04:10:00 INFO  [eu2-gateway] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did traffic take an hour to move?',
        options: [
          'The one hour TTL let resolvers keep the eu1 address until it expired',
          'The eu2 runtimes took an hour to warm up and accept the full load',
          'The eu2 gateway throttled traffic until its rate limits were raised',
          'The DNS change took an hour to reach the authoritative name servers',
        ],
        answer: 0,
        explain: 'Changing a record does not reach clients until their cached answer expires. With a TTL of 3600 seconds, that can be an hour.',
      },
      {
        type: 'single',
        prompt: 'What TTL fits a name you plan to fail over by DNS?',
        options: [
          'About 60 seconds, tested with the partners’ real clients',
          'One day, so the name keeps resolving if DNS itself fails',
          'One hour as now, and flush the resolvers during a failover',
          'Zero, so that every single request does a fresh lookup',
        ],
        answer: 0,
        explain: 'A short TTL lets clients follow the change quickly. Some clients still cache longer, so test with real ones.',
      },
      {
        type: 'multi',
        prompt: 'Which other parts can hold an old address?',
        options: [
          'A Java client that caches DNS answers for longer than the TTL',
          'Long-lived connection pools that stay open to the old region',
          'A partner firewall rule written for the old IP addresses',
          'The TLS certificate the partner trusts for api.lumenpay.example',
        ],
        answer: [0, 1, 2],
        explain: 'DNS is only one cache. Runtimes, connection pools and firewalls can all keep the old target.',
      },
      {
        type: 'single',
        prompt: 'What design avoids depending on DNS changes at all?',
        options: [
          'A global load balancer with a fixed address that routes to the healthy region',
          'A second name for eu2 that partners switch to in their config during an outage',
          'Two A records for the name, one per region, returned in a random order',
          'A runbook that asks each partner to flush its DNS cache during failover',
        ],
        answer: 0,
        explain: 'If the address clients use never changes, failover happens behind it, with no cache to wait for.',
      },
      {
        type: 'order',
        prompt: 'Order the improvements.',
        items: [
          'Lower the TTL on the failover name ahead of time',
          'Check client DNS caching and connection pool lifetimes with key partners',
          'Give partners the address ranges of both regions for their firewalls',
          'Consider a global entry point with a fixed address',
          'Run a failover test with partners and measure the time to full traffic',
        ],
        explain: 'Fix what you control, work with partners on their side, consider a better entry point, then prove it.',
      },
    ],
  },
  description: `
## Symptoms
- At 03:05 the eu1 region failed. Failover to eu2 finished in under three minutes.
- Most partner traffic did not reach eu2 for about an hour. Two partners failed for longer.

## Change / Context
- Partners call \`api.lumenpay.example\`. Failover changes this DNS record from eu1 to eu2.
- The record has a TTL of 3600 seconds, set years ago.
- Some partners use Java clients with long-lived connection pools. One partner allows outbound calls only to listed IP addresses.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:07:40 INFO  [dns] api.lumenpay.example now points to eu2 ttl=3600
2026-11-18 03:08:10 INFO  [eu2-gateway] Requests per minute=310 normal=4200
2026-11-18 04:09:55 INFO  [eu2-gateway] Requests per minute=4100
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
    'A DNS change reaches clients only when their cached answer expires.',
    'A one hour TTL means up to an hour of traffic to the dead region.',
    'Runtimes and connection pools can cache longer than the TTL.',
    'Partner firewalls must allow both regions.',
    'A global entry point with a fixed address avoids the wait.',
    'Measure failover by time to full traffic, not time to switch.',
  ],
  solution: `
**Diagnosis.** Failover changed the DNS record, but its TTL was an hour. Resolvers and clients kept the eu1 address until it expired. Some clients cached even longer or kept old connections, and one partner's firewall did not allow eu2.

**Immediate mitigation.** Contact the partners still failing, ask them to flush DNS or restart clients, and add eu2 to the firewall list.

**Root cause.** The failover plan measured the switch on our side, not the time for clients to follow it.

**Permanent fix.**
- Lower the TTL of the failover name to about a minute.
- Agree with partners on DNS cache and connection lifetimes, and give them the address ranges of both regions.
- Consider a global entry point with a fixed address that routes to the healthy region.

**Prevention.** Regular failover tests with partners, measured as time until traffic is back to normal.
`,
  followUps: [
    { q: 'Does a short TTL cost much?', a: 'More DNS lookups, which is usually small. Measure it against the outage time it saves.' },
    { q: 'Why can Java clients cache longer?', a: 'The JVM has its own DNS cache settings, which some setups make long or permanent.' },
    { q: 'Why do pools matter?', a: 'An open connection keeps going to the old address until it is closed, whatever DNS says now.' },
    { q: 'Is a fixed address enough by itself?', a: 'It removes DNS from failover, but you still need health checks and tests behind it.' },
  ],
}
