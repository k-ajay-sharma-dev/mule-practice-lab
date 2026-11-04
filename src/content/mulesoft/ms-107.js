export default {
  id: 'ms-107',
  category: 'mulesoft',
  title: 'Rate Limiting, Rate Limiting SLA or Spike Control? Windows, Quotas, Queues and Nodes',
  level: 'ADVANCED',
  tags: ['api-manager', 'api-management', 'policies', 'rate-limiting', 'sla-tiers', 'spike-control', 'mule-gateway'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'The rating engine behind the Freight API fails above about 40 requests per second, and short bursts should wait a moment and not fail at once. No partner accounting is needed for this. Which policy fits?',
      options: [
        'Spike Control, because it protects the backend by queuing requests and retrying them as configured',
        'Rate Limiting, because a hard quota is the only way to protect a backend',
        'Rate Limiting SLA, because every SLA tier queues requests when its limit is reached',
        'Client ID Enforcement, because identified clients send fewer requests',
      ],
      answer: 0,
      explain: 'The docs say to use Rate Limiting and Rate Limiting SLA for accountability and a hard limit, and Spike Control to protect the backend. Rate Limiting rejects as soon as the quota is used; only Spike Control queues.',
    },
    {
      type: 'match',
      prompt: 'Match each policy to what it does.',
      pairs: [
        ['Rate Limiting', 'Fixed window; a quota per group of requests chosen by an optional identifier expression'],
        ['Rate Limiting SLA', 'Fixed window; a separate quota per client application, taken from its contract and SLA tier'],
        ['Spike Control', 'Sliding window; no quota enforcement, requests are queued and retried before rejection'],
      ],
      explain: 'Rate Limiting counts per identifier group. Rate Limiting SLA counts per contract. Spike Control has one sliding window, and the docs state that it does not perform quota enforcement.',
    },
    {
      type: 'single',
      prompt: 'The API has a Rate Limiting SLA policy. A registered client application calls it with a valid client ID, but it has no contract with this API instance. What happens?',
      options: [
        'Every request is rejected, because the policy can only count clients that have a contract',
        'The request passes, because the client ID is valid in the organization',
        'The client gets the quota of the lowest SLA tier',
        'The client shares one quota with all other clients without a contract',
      ],
      answer: 0,
      explain: 'The policy page shows this case directly: a client with no contract defined for the API has every request rejected. The policy creates one algorithm per contract, so without a contract there is no quota to spend.',
    },
    {
      type: 'single',
      prompt: 'A Rate Limiting policy allows 100 requests per minute with no identifier. The first request after the policy was applied arrived at 10:00:20, and a client sent nothing else until 10:01:19. It then sends 100 requests at 10:01:19 and 100 more at 10:01:21. What is the result?',
      options: [
        'Almost all of the 200 are accepted, because the fixed window closes at 10:01:20 and the quota resets for the new window',
        'Only 100 are accepted, because the policy counts the last 60 seconds',
        'Only 100 are accepted, because windows always start on the full minute',
        'All are queued and served at 100 per minute',
      ],
      answer: 0,
      explain: 'The window starts with the first request after the policy is applied, and it is a fixed window. When it closes, the quota resets. A burst around a window boundary can therefore pass nearly twice the quota, and this is a reason to add Spike Control for backend protection.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about queuing in Spike Control are correct?',
      options: [
        'A queued request keeps a thread and an HTTP connection while it waits',
        'Queuing Limit restricts how many requests can wait at one time, which protects the gateway from running out of resources',
        'Callers can see a slower response and not an error during a burst',
        'In a Mule cluster, the policy shares one window across all nodes',
        'Delay Attempts sets how many times a request is retried before rejection',
      ],
      answer: [0, 1, 2, 4],
      explain: 'The docs say queuing retains a thread and an HTTP connection, and that users may see higher latency. Spike Control cannot be clustered: it protects one gateway instance, so each node has its own window.',
    },
    {
      type: 'single',
      prompt: 'A Rate Limiting policy uses the identifier `#[attributes.headers[\'x-depot-id\']]`. Some requests do not send this optional header. What does the policy do with them?',
      options: [
        'The identifier resolves to an empty value, and those requests share that empty value\'s own quota',
        'It rejects them with 400',
        'It skips rate limiting for them',
        'It adds them to the group that has the most quota left',
      ],
      answer: 0,
      explain: 'For a non-obligatory header, the docs say the missing identifier defaults to an empty value, which has its own quota. That lets one policy serve uncontrolled clients and clients with their own buckets.',
    },
    {
      type: 'single',
      prompt: 'The Gold tier has two limits: 100 requests per second and 10,000 requests per day. A partner has used all 10,000 for today but sends only 5 requests in the current second. What happens?',
      options: [
        'The request is rejected, because each limit has its own algorithm and all of them need quota left',
        'The request passes, because the per-second limit has quota left',
        'The policy uses only the first limit in the tier',
        'The daily limit is only a warning shown in API Manager',
      ],
      answer: 0,
      explain: 'The policy creates one algorithm per limit, and every algorithm must have quota in its current window for the request to be accepted.',
    },
  ],
  description: `
A freight company exposes a **Freight API** through Mule Gateway. Three needs arrived in one review:

| Need | Detail |
|---|---|
| Partner plans | 60 partners on Gold (100 requests per second and 10,000 per day) and Silver (10 per second and 1,000 per day) |
| Backend safety | The rating engine fails above about 40 requests per second, and bursts come from month-end batches |
| Depot limits | Internal depot tools send \`x-depot-id\`; each depot may make 300 requests per minute |

A colleague says: "They are all rate limits. Put Rate Limiting on the API with 40 per second and we are done."

The API runs on three nodes. Nobody can say whether the numbers apply per node or in total.

**Questions**
1. What is each of the three policies for, and which one fits each need?
2. How do the windows differ? What can pass at a window boundary?
3. What does each policy need from the caller?
4. What happens when the quota runs out, for each policy?
5. How do the three nodes change the numbers?
`,
  answerTemplate: `## Policy for each need

## Windows

## What the caller must send

## When the quota runs out

## Multiple nodes
`,
  keyPoints: [
    'Use Rate Limiting and Rate Limiting SLA for accountability and a hard limit; use Spike Control to protect the backend. This is the rule in the policy FAQ.',
    'Rate Limiting: fixed window, optional identifier expression, one quota per group, any number of quota and time window pairs.',
    'Rate Limiting SLA: fixed window, quota per contract, needs a client ID and optionally a client secret; a client with no contract has every request rejected.',
    'Spike Control: sliding window, one window only, no quota enforcement, queues and retries, then rejects. Queuing holds a thread and an HTTP connection, so set a Queuing Limit.',
    'A fixed window starts with the first request after the policy is applied and resets when it closes, so a burst around the boundary can pass nearly twice the quota.',
    'With several limits in one tier, every limit must have quota left.',
    'Distributed shares the quota only in a Mule HA cluster. Otherwise each node enforces the quota on its own. Spike Control always works per gateway instance.',
    'X-RateLimit headers are off by default; turn on Expose Headers. Rate Limiting and Rate Limiting SLA reject with 429 for HTTP APIs.',
  ],
  solution: `
**1. Policy for each need.**
- Partner plans → **Rate Limiting SLA**. Define Gold and Silver as SLA tiers. Each tier can hold both limits.
- Backend safety → **Spike Control**. It is the policy the docs name for protecting the backend.
- Depot limits → **Rate Limiting** with the identifier \`#[attributes.headers['x-depot-id']]\`, 300 requests per minute. Each depot gets its own group.

The colleague's single Rate Limiting policy with no identifier gives all callers one shared bucket. One partner could use the whole quota, and nothing would be accountable per partner.

**2. Windows.**
| Policy | Window | Starts |
|---|---|---|
| Rate Limiting | Fixed | First request after the policy is applied |
| Rate Limiting SLA | Fixed | The algorithm is created on the first request of that client |
| Spike Control | Sliding | First request after the policy is applied; a slot returns when an old request ages out |

A fixed window resets all at once, so a client can use a full quota just before the reset and another just after it. Spike Control does not have this edge, because it looks back over the last period.

**3. What the caller must send.**
- Rate Limiting: nothing special. A missing optional identifier resolves to an empty value with its own quota.
- Rate Limiting SLA: a client ID, and a client secret if the policy is configured for one. The client application needs a contract with this instance.
- Spike Control: nothing.

**4. When the quota runs out.**
- Rate Limiting and Rate Limiting SLA reject the request with **429** for HTTP APIs (WSDL APIs get 400 or 500), and it does not reach the backend.
- Spike Control queues the request for the **Delay Time**, retries up to **Delay Attempts**, and then rejects it with 429. Callers can see higher latency before that. Each queued request keeps a thread and an HTTP connection, so set a **Queuing Limit**, and use the lowest values that work.

**5. Three nodes.**
- **Distributed** shares the quota across nodes only if the runtime is in a Mule HA cluster. In any other case the option has no effect, and each node has its own quota. With three separate nodes behind a load balancer, set the limits with that in mind.
- A clustered counter adds latency, so the docs recommend windows longer than one minute in a cluster. A one-second window is a poor fit.
- Spike Control cannot be clustered. Each node protects itself, so the backend sees up to three times the configured rate. For a limit of 40 per second across three nodes, configure about 13 per node.

**Long windows.** On Mule, the policy state is persisted by default every 10 seconds, so a daily or yearly window can survive a restart. The docs say persistence is not available on CloudHub.
`,
  followUps: [
    {
      q: 'Can you use Spike Control and Rate Limiting SLA on the same API?',
      a: 'Yes. They answer different questions. The SLA policy holds each partner to its contract, and Spike Control limits the total load that reaches the backend. A partner within its tier can still be delayed by Spike Control if the backend limit is reached.',
    },
    {
      q: 'Why should Expose Headers be used carefully on Spike Control?',
      a: 'The policy page says to enable it only for internal APIs, because the headers show how the algorithm behaves. For Rate Limiting SLA, the headers tell partners how much quota remains and when the window resets, in milliseconds.',
    },
    {
      q: 'What does a partner see if there are several SLA-based policies?',
      a: 'The SLA tiers page says the headers report spare capacity for only the most restrictive policy.',
    },
    {
      q: 'Does this apply to Omni Gateway (formerly Flex Gateway)?',
      a: 'This problem describes the Mule Gateway policy pages. Omni Gateway has its own policy documentation, and some options such as persistence are marked Mule only, so check the page for your gateway.',
    },
  ],
}
