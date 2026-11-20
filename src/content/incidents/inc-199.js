export default {
  id: 'inc-199',
  category: 'incidents',
  title: 'Every Client Gets 429 at Lunchtime: a Rate Limit Keyed on the Caller IP Sees Only the Load Balancer',
  level: 'ADVANCED',
  tags: ['rate-limiting', 'api-manager', 'load-balancer', 'policies'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-18 12:00:01 INFO  [quotes-api] Policy rate-limit key=#[attributes.remoteAddress] limit=100/min', relevant: true, why: 'The limit is counted per remote address.' },
      { text: '2026-11-18 12:04:12 WARN  [quotes-api] 429 Too Many Requests key=10.20.0.15 count=101', relevant: true, why: 'Every request counts against one address.' },
      { text: '2026-11-18 12:04:12 DEBUG [quotes-api] remoteAddress=10.20.0.15 X-Forwarded-For=203.0.113.44', relevant: true, why: 'The remote address is the load balancer. The real client is in the forwarded header.' },
      { text: '2026-11-18 12:04:13 DEBUG [quotes-api] remoteAddress=10.20.0.15 X-Forwarded-For=198.51.100.7', relevant: true, why: 'A different client, the same remote address.' },
      { text: '2026-11-18 12:10:00 INFO  [quotes-api] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does every client hit the limit together?',
        options: [
          'Every request has the load balancer as its remote address, so all share one count',
          'The limit of 100 a minute is too low for the busiest single partner at noon',
          'The policy keys on `X-Forwarded-For`, which the load balancer sets the same for all',
          'The policy counts per second, so a burst of two requests trips the limit',
        ],
        answer: 0,
        explain: 'Behind a proxy, the remote address is the proxy. Counting by it puts all clients in one bucket.',
      },
      {
        type: 'single',
        prompt: 'Which key is best for a per-client limit on a partner API?',
        options: [
          'The client ID the caller presents, with an SLA based limit per client',
          'The first address in `X-Forwarded-For`, as sent by the caller',
          'The request path, so each resource gets its own limit',
          'The `User-Agent` header, which names each partner’s software',
        ],
        answer: 0,
        explain: 'A client ID names the caller, whatever network they use. SLA tiers then give each client its own limit. Headers the caller sets, such as `User-Agent` or a raw forwarded header, can be faked or shared.',
      },
      {
        type: 'multi',
        prompt: 'If you must limit by IP, what must be true?',
        options: [
          'Read the client IP from the forwarded header the load balancer sets',
          'Trust that header only from your own load balancer, not from the internet',
          'Remember that many users can share one office IP',
          'Take the client IP from the first `X-Forwarded-For` value, whoever sent it',
        ],
        answer: [0, 1, 2],
        explain: 'A forwarded header can be faked if any caller can set it. And an IP is a weak name for a client.',
      },
      {
        type: 'single',
        prompt: 'Why was it only at lunchtime?',
        options: [
          'Traffic from all partners together passes 100 a minute only at the peak',
          'One partner passes 100 a minute at noon and blocks the others',
          'The load balancer switches to a single node at noon for maintenance',
          'The rate limit window resets at noon, so the count starts again',
        ],
        answer: 0,
        explain: 'The shared count crossed the limit only when everyone was busy at once.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Raise the limit or remove the policy for now, to stop the 429s',
          'Confirm the remote address is the load balancer',
          'Move to client ID enforcement with SLA based limits',
          'Agree limits per client tier with the product owner',
          'Test the policy behind the real load balancer before release',
        ],
        explain: 'Stop the harm, prove the cause, change the key, agree tiers, then test in a realistic path.',
      },
    ],
  },
  description: `
## Symptoms
- Every day around noon, all partners of the quotes API get 429 for a few minutes.
- No single partner sends more than 30 requests a minute.

## Change / Context
- A rate limit of 100 requests a minute was added last week, keyed on \`attributes.remoteAddress\`, to stop one partner flooding the API.
- The API sits behind a load balancer that adds an \`X-Forwarded-For\` header.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 12:04:12 WARN  [quotes-api] 429 Too Many Requests key=10.20.0.15 count=101
2026-11-18 12:04:12 DEBUG [quotes-api] remoteAddress=10.20.0.15 X-Forwarded-For=203.0.113.44
2026-11-18 12:04:13 DEBUG [quotes-api] remoteAddress=10.20.0.15 X-Forwarded-For=198.51.100.7
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
    'Behind a proxy, the remote address is the proxy.',
    'A limit keyed on it shares one count across every client.',
    'Limit per client by client ID with SLA tiers.',
    'Trust forwarded headers only from your own load balancer.',
    'An IP is a weak name for a client.',
    'Test policies behind the real network path.',
  ],
  solution: `
**Diagnosis.** The load balancer is the remote address for every request. The policy counts all partners together, and at the noon peak the total passes 100 a minute.

**Immediate mitigation.** Raise the limit or turn the policy off until the key is fixed.

**Root cause.** The policy was designed and tested without the load balancer in front, where remote address was the real client.

**Permanent fix.** Enforce client IDs and use SLA based rate limits per client tier. If an IP limit is also needed, read the forwarded header set by your own load balancer and ignore it from other sources.

**Prevention.** Test policies through the same network path as production. Agree limits per tier with the product owner.
`,
  followUps: [
    { q: 'Why not trust X-Forwarded-For from anyone?', a: 'Any caller can set it, so a caller could pretend to be many clients and avoid the limit.' },
    { q: 'What if partners share one client ID?', a: 'Give each partner its own client ID. Shared IDs make per partner limits and tracing impossible.' },
    { q: 'Is a global limit ever useful?', a: 'Yes, to protect a backend with a hard capacity. Use it alongside per client limits, set to what the backend can take.' },
    { q: 'How do clients know when to try again?', a: 'Return Retry-After or the rate limit headers so they can back off.' },
  ],
}
