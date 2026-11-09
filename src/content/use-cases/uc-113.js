import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-113',
  category: 'use-cases',
  title: 'Circuit Breaker around a Flaky SOAP Delivery Estimate Service',
  level: 'INTERMEDIATE',
  tags: ['circuit-breaker', 'soap', 'fallback', 'resilience', 'timeouts', 'object-store'],
  estMinutes: 30,
  diagram: {
    task: 'draw the delivery estimate call at checkout: the web checkout, the Experience and Process APIs, the System API that wraps the SOAP service and keeps shared circuit state, the fallback lead time table used by the Process API, and the alert when the circuit opens.',
    checks: [
      { label: 'Checkout reaches the SOAP service through the API layers', rule: { type: 'path', from: 'web-app', via: 'experience-api', to: 'external-api' } },
      { label: 'The SOAP service is called only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'The System API keeps shared circuit state', rule: { type: 'edge', from: 'system-api', to: { type: ['cache', 'database'], label: ['circuit', 'breaker'] } } },
      { label: 'Only the System API reads and writes the circuit state', rule: { type: 'only-via', target: { type: ['cache', 'database'], label: ['circuit', 'breaker'] }, from: 'system-api' } },
      { label: 'The Process API has a fallback source of lead times', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache', 'file-store'], label: ['fallback', 'lead time', 'static'] } } },
      { label: 'The fallback is a business choice in the Process API, not in the SOAP wrapper', rule: { type: 'no-edge', from: 'system-api', to: { type: ['database', 'cache', 'file-store'], label: ['fallback', 'lead time', 'static'] } } },
      { label: 'An open circuit raises an alert', rule: { type: 'path', from: 'system-api', to: 'monitoring' } },
      { label: 'The SOAP call is a sync request with a timeout', rule: { type: 'lines', touching: 'external-api', kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Checkout (web)'],
        exp: ['experience-api', 'exp-checkout-api'],
        prc: ['process-api', 'prc-delivery-estimate'],
        fb: ['database', 'Fallback lead times per region'],
        sys: ['system-api', 'sys-carrier-estimate-soap'],
        cb: ['cache', 'Circuit state (Object Store v2, shared)'],
        soap: ['external-api', 'Carrier estimate SOAP service'],
        mon: ['monitoring', 'Alert: circuit open'],
      },
      ['web -> exp', 'exp -> prc', 'prc -> sys', 'prc -> fb', 'sys -> cb', 'sys -> soap', 'sys ~> mon'],
    ),
  },
  description: `
An electronics retailer shows a **delivery date** on the checkout page. The date comes from a carrier's **SOAP service** (\`EstimateDelivery\`, WSDL from 2011).

Facts:
- Checkout calls the estimate about **15 times per second** at peak.
- Normally the service answers in 300 ms. Several times a week it has **outages of 5 to 30 minutes**: calls hang until a 30 second timeout or return SOAP faults.
- During the last outage, Mule threads waited on the hanging calls, the checkout API slowed for **everything**, and conversion dropped 12 %.
- The checkout API target is **p95 under 800 ms**.
- A table of typical lead times per region (for example "3 to 5 working days") is acceptable when the carrier is down.
- Mule runs on CloudHub 2.0 with **3 replicas** of each API.

**Describe your solution:**
- Where does the breaker live, and where does the fallback live?
- What are the states and thresholds, and where is the state kept?
- How do timeouts change?
- How do you know the circuit is open, and how does it close again?
`,
  answerTemplate: `## Timeouts

## Circuit breaker states

## Where the state lives

## Fallback

## Monitoring
`,
  keyPoints: [
    'Cut the SOAP timeout to about 1.5 seconds; a hanging dependency must never take 30 seconds of a checkout thread.',
    'Closed: calls pass and failures are counted. Open: calls fail fast for 60 seconds. Half-open: one probe decides whether to close.',
    'Mule 4 has no built-in circuit breaker scope, so the System API keeps the state in a shared store (Object Store v2) with failure counts and open-until time.',
    'The System API fails fast with a clear 503; the Process API decides on the fallback (regional lead times), because that is a business rule.',
    'An alert fires when the circuit opens, and the share of fallback answers is tracked as a business metric.',
  ],
  solution: `
\`\`\`
 Checkout -> exp-checkout-api -> prc-delivery-estimate -> sys-carrier-estimate-soap -> SOAP service
                                                                     -> circuit state (Object Store v2)
                                                                     ~> alert
                                                    -> fallback lead times (on 503)
\`\`\`

**Timeouts.** First fix the timeout. Set the Web Service Consumer response timeout to **1.5 seconds** (p99 of a healthy service is under 1 second). A timeout alone already stops the 30 second waits, but during an outage every call still waits 1.5 seconds and still hits the struggling service.

**Circuit breaker states.**
- **Closed**: calls go through. Count failures (timeouts, connection errors, SOAP server faults) in a rolling 30 second window.
- **Open**: after 5 failures in 30 seconds, stop calling for **60 seconds**. Each call returns 503 at once.
- **Half-open**: after 60 seconds, let one probe call through. Success → closed. Failure → open for another 60 seconds.
Client faults (bad postcode) do not count as failures.

**Where the state lives.** Mule 4 has no circuit breaker component, so build it in the System API around the SOAP call: a check before the call and an update in the error handler. Keep \`failures\`, \`windowStart\` and \`openUntil\` in **Object Store v2** so all 3 replicas see the same state. With a per-replica in-memory state, each replica would need its own 5 failures and the outage would be felt three times longer. Exact counts are not needed: a few extra calls during a race are fine.

**Fallback.** The System API reports the truth ("carrier unavailable", 503 with a reason). The Process API turns that into a business answer: it looks up the region lead time and returns \`{ estimate: "3 to 5 working days", source: "fallback" }\`. The page still shows a date range, and the checkout is not blocked. Other consumers of the System API may choose differently.

**Monitoring.** On every change to open, publish an event that becomes an alert. Track the share of fallback answers per hour and the time spent open per week, and share them with the carrier as SLA evidence.
`,
  followUps: [
    { q: 'Why does the timeout matter even with a circuit breaker?', a: 'The breaker needs failures to count before it opens. Until then every call waits the full timeout, so it must be short.' },
    { q: 'Why keep the circuit state in Object Store v2 instead of in memory?', a: 'All replicas share one view of the service. The circuit opens after 5 failures in total, not 5 on each replica.' },
    { q: 'Why is the fallback in the Process API?', a: 'Showing a regional range is a business decision for checkout. Other users of the System API may want the error instead.' },
    { q: 'Which errors should not count towards opening the circuit?', a: 'Client errors such as an invalid postcode. They mean the request was wrong, not that the service is unhealthy.' },
  ],
}
