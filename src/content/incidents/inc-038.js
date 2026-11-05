export default {
  id: 'inc-038',
  category: 'incidents',
  title: 'Random "Connection Reset by Peer" on Quiet Nights',
  level: 'ADVANCED',
  tags: ['keep-alive', 'load-balancer', 'idle-timeout', 'http', 'connection-pool'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '01:52:40.300 INFO  [pricing-papi] Calling erp-sapi /prices/SKU-1179 corrId=73a9', relevant: false },
      { text: '01:52:40.420 INFO  [pricing-papi] 200 OK corrId=73a9', relevant: false },
      { text: '02:14:09.881 INFO  [pricing-papi] Calling erp-sapi /prices/SKU-1180 corrId=73ab', relevant: true, why: 'The first call after a ~21 minute idle gap, far longer than the 350 s LB idle timeout.' },
      { text: '02:14:09.883 ERROR [pricing-papi] HTTP:CONNECTIVITY HTTP GET on resource \'https://erp-lb.corp/prices/SKU-1180\' failed: Remotely closed. corrId=73ab', relevant: true, why: 'Fails in 2 ms: the pooled connection was already dropped by the LB, so the request hit a dead socket.' },
      { text: '02:14:12.004 INFO  [pricing-papi] Calling erp-sapi /prices/SKU-1181 corrId=73ac', relevant: false },
      { text: '02:14:12.140 INFO  [pricing-papi] 200 OK corrId=73ac', relevant: true, why: 'The next request opens a fresh connection and works: the signature of an idle-timeout mismatch.' },
      { text: '02:15:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '[lb] erp-lb idle_timeout=350s; idle connections reset: 41 between 00:00 and 06:00', relevant: true, why: 'The LB confirms it drops idle connections, mostly at night when traffic is low.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the mechanism behind the failures?',
        options: [
          'Pooled keep-alive connections stay idle longer than the LB idle timeout; the LB drops them and Mule reuses a dead socket',
          'erp-sapi crashes at night and restarts',
          'The ERP is overloaded by the nightly batch',
          'DNS for erp-lb.corp expires at night',
        ],
        answer: 0,
        explain: 'Only after quiet periods, failing in milliseconds, with an immediate retry succeeding: classic idle-timeout mismatch between client pool and LB.',
      },
      {
        type: 'single',
        prompt: 'Which setting fixes it?',
        options: [
          'Set the HTTP Request `connectionIdleTimeout` below the LB value (e.g. 300 s < 350 s)',
          'Raise the response timeout to 120 s',
          'Increase maxConnections in the pool',
          'Raise the client idle timeout to 600 s',
        ],
        answer: 0,
        explain: 'The side that reuses connections must close idle ones first: **client idle < LB idle < server keep-alive**.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'A limited retry (2–3 attempts, short backoff) for idempotent GETs on HTTP:CONNECTIVITY',
          'Document idle/keep-alive timeouts for every hop in the network change checklist',
          'Track error rate by hour of day to spot quiet-hour spikes',
          'Blindly retry every POST on connection reset',
        ],
        answer: [0, 1, 2],
        explain: 'Retry only idempotent calls: a POST may have reached the server before the reset, so a blind retry can create duplicates.',
      },
      {
        type: 'single',
        prompt: 'Why not simply disable persistent connections?',
        options: [
          'It fixes the symptom but adds a TCP + TLS handshake to every call, increasing latency and CPU',
          'Mule does not allow it',
          'The LB requires keep-alive',
          'It would break OAuth',
        ],
        answer: 0,
        explain: 'Tuning the idle timeout keeps the benefit of connection reuse without the dead-socket problem.',
      },
    ],
  },
  description: `
## Symptoms
- \`pricing-papi\` calls \`erp-sapi\` through an internal load balancer.
- During busy hours everything works. At night and early morning, **the first request after a quiet period** often fails with "Remotely closed" / "Connection reset by peer". A retry immediately afterwards succeeds.
- Error rate is low overall (~0.3%) but nightly batch reconciliations keep flagging missing prices.

## Change / Context
- A month ago the network team replaced the old load balancer with a cloud LB that has a fixed **idle timeout of 350 s**.
- The Mule HTTP Request config comes from an old template:
  - Persistent connections are enabled (the default).
  - **\`connectionIdleTimeout="600000"\`** (10 minutes, set years ago for the old LB; the connector default is 30 s). This is larger than the new LB value.
- No retries are configured on the request.

## Logs
\`\`\`
02:14:09.881 INFO  [pricing-papi] Calling erp-sapi /prices/SKU-1180 corrId=73ab
02:14:09.883 ERROR [pricing-papi] HTTP:CONNECTIVITY HTTP GET on resource 'https://erp-lb.corp/prices/SKU-1180' failed:
  Remotely closed. corrId=73ab
02:14:12.004 INFO  [pricing-papi] Calling erp-sapi /prices/SKU-1181 corrId=73ac
02:14:12.140 INFO  [pricing-papi] 200 OK corrId=73ac
\`\`\`

## Your tasks
1. Explain the mechanism behind the failures.
2. What can you do quickly?
3. What is the proper fix?
4. How do you prevent this class of problem?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Pooled keep-alive connections sit idle longer than the LB idle timeout; the LB silently drops them, and the client reuses a dead socket.',
    'Pattern: failures only after idle periods, fast failure (milliseconds), immediate retry succeeds on a new connection.',
    'Fix: set the client connection idle timeout below the LB idle timeout (e.g. 300 s < 350 s) — the client should always close first.',
    'Add a limited retry (until-successful/reconnection) for idempotent GETs on connectivity errors.',
    'Prevention: document timeouts for every hop (client idle < LB idle < server keep-alive) as part of network changes.',
  ],
  solution: `
## Diagnosis
Mule keeps HTTP connections **alive** in a pool to reuse them. The new LB drops TCP connections idle for more than **350 s**, often without the client noticing. During busy hours connections never stay idle that long. At night they do: Mule picks a pooled connection the LB already forgot, sends the request, and gets a reset/"Remotely closed" within milliseconds. The next request opens a fresh connection and works. The timing (after quiet periods, instant failure, retry works) is the signature of an **idle-timeout mismatch**.

## Immediate mitigation
Set the HTTP Request connection's \`connectionIdleTimeout\` below the LB value (e.g. 300 s) and redeploy; re-run the failed reconciliation items. As a stopgap, add a retry for idempotent GETs.

## Root cause
The LB replacement shortened the idle timeout below the client's keep-alive idle time; nobody aligned the client settings. Without retries, the transient failure becomes a lost request.

## Permanent fix
- Rule: **client idle timeout < LB idle timeout < server keep-alive timeout**, so the side that initiates reuse always closes first.
- Retry policy (e.g. Until Successful with 2–3 attempts, short backoff) only for idempotent operations and HTTP:CONNECTIVITY errors.
- Consider TCP keep-alive on the connection if supported and allowed.

## Prevention
- Network change checklist includes idle/keep-alive timeouts for every hop.
- Track error rate by hour of day; a spike in quiet hours is a classic idle-timeout smell.
`,
  followUps: [
    { q: 'Why not just disable persistent connections?', a: 'It would fix the symptom but add a TCP + TLS handshake to every call, increasing latency and CPU; tuning the idle timeout keeps the benefit of reuse.' },
    { q: 'Is it safe to retry a POST on "connection reset"?', a: 'Only if it is idempotent (e.g. with an idempotency key) — the request may have reached the server before the reset, so a blind retry can create duplicates.' },
    { q: 'How would you prove this theory?', a: 'Correlate failures with idle gaps before the call, check LB logs/metrics for idle resets, and reproduce by idling a connection for longer than 350 s in a test environment.' },
  ],
}
