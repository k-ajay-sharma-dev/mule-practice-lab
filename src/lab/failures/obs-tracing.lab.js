// The guided lab obs-tracing. See platform-labs.js for the shape of a lab.
import { advance, at, eventsOf, internalOf, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until, withProp } from '../platform-kit.js'
import { addDashboard, addWidget, defaultObservability, fill, openTrace, percentile, viewDashboard } from '../platform-observability.js'
import { EAPI, modeOf, PAPI } from './obs-tracing.pkg.js'

const P95 = 'Response time p95'
const p95Of = (s, minutes) => percentile(eventsOf(s, { app: EAPI, env: 'Sandbox' }, s.clock - minutes * MINUTE, s.clock).filter((e) => e.k === 'in').map((e) => e.ms), 95)
const fixed = (s) => app(s, PAPI)?.status === 'Running' && ['batch', 'parallel'].includes(modeOf({ ...app(s, PAPI)?.props, ...app(s, PAPI)?.secrets }))
const dashOf = (s) => (s.observability?.dashboards ?? []).find((d) => d.widgets.some((w) => w.metric === P95 && w.app === EAPI))
const basket = (n) => JSON.stringify({ items: Array.from({ length: n }, (_, i) => `H-${100 + i}`) })

const lab = {
  id: 'p-obs-tracing',
  group: 'Observability',
  title: 'Slow checkout, healthy dashboards',
  minutes: 25,
  scenario: `The Brightmart web shop calls ${EAPI}, which calls ${PAPI} for stock, a shipping quote from the carrier Seaway Freight, and a payment reservation. It is Tuesday 09:00. Since about 08:00 the shop team says the p95 of checkout rose from about 450 ms to almost 3 seconds, and big baskets time out in the browser. The built-in dashboard of each app shows an average response time that looks fine. Find the slow part, fix it and prove the fix with a dashboard.`,
  start() {
    const traffic = [
      { app: EAPI, env: 'Sandbox', perMinute: 3, method: 'POST', path: '/checkout', body: basket(1) },
      { app: EAPI, env: 'Sandbox', perMinute: 2, method: 'POST', path: '/checkout', body: basket(2) },
      { app: EAPI, env: 'Sandbox', perMinute: 1, every: 2, method: 'POST', path: '/checkout', body: basket(10) },
    ]
    const o = fill(defaultObservability(at(1, 7)))
    // lab made sampling: 1 trace in 4 of the steady traffic, and every slow or failed one
    o.tracing.sample = 4
    const papi = newApp(PAPI, { props: { 'shipping.quote.mode': 'batch' } })
    let s = newPlatform({ clock: at(1, 7), apps: [papi, newApp(EAPI, { props: { 'papi.url': internalOf(papi) } })], traffic, observability: o })
    s = until(s, at(1, 8, 2))
    // the release of 08:02: the carrier's per item endpoint, because the batch endpoint is going away next year
    s = withProp(s, PAPI, 'shipping.quote.mode', 'per-item')
    s = until(s, at(1, 8, 55))
    s.mail.push({ t: at(1, 8, 55), to: OPS, subject: 'Checkout p95 is up', body: `Our real user monitoring shows checkout p95 at about 2.9 s since 08:00, it was 450 ms. Big baskets time out in the browser. ${EAPI} and ${PAPI} look normal on their dashboards. Brightmart web shop team`, source: 'Brightmart web shop' })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: `Open the built-in dashboard of ${EAPI}`,
      how: `Monitoring, Built-in dashboards, ${EAPI}, View. The Average Response Time is well under a second. Most baskets are small and fast, so the average hides the slow ones.`,
      done: (s) => Boolean(s.seen[`dash:${EAPI}`]),
    },
    {
      title: 'Open a slow trace',
      how: 'Monitoring, Traces. Set Min duration to 2000 and Search, then open a trace. The waterfall shows the spans of both apps: inside the POST /orders span of the Process API, the span foreach item: shipping-quote takes about 2.5 s, with one carrier call after the other.',
      done: (s) => Boolean(s.seen['mon:trace-slow']),
    },
    {
      title: 'Find a trace by its correlation ID',
      how: `Monitoring, Log Search: search Shipping quote. Each WARN line of ${PAPI} starts with event: and the correlation ID. Copy a recent one, paste it in Correlation ID on the Traces page, Search and open the trace.`,
      done: (s) => Boolean(s.seen['mon:trace-cid']),
    },
    ask(
      'Average or p95',
      'Why did the average response time look fine while the p95 was near 3 seconds?',
      [
        'The dashboards round the numbers',
        'One checkout in eleven has a big basket. The average mixes those few slow requests with many fast ones, so it moves a little. The p95 is the time that 95 percent of requests stay under, so the slowest five percent decide it',
        'The p95 counts errors and the average does not',
        'The average is measured on another app',
      ],
      1,
      'An average answers what a typical sum looks like, not what a customer waits. A few slow requests among many fast ones barely move it. Percentiles describe the tail: p95 and p99 are what the slowest customers see, and they are what service levels and alerts should use.',
    ),
    ask(
      'Correlation ID or trace',
      'How does the correlation ID in the logs differ from the trace you opened?',
      [
        'They are the same thing with two names',
        'The correlation ID is a label that every app copies into its log lines, so a search finds all lines of one request. A trace is a tree of timed spans, each with a span ID and a parent span ID, so it also shows where the time went and what ran inside what',
        'A trace only exists for failed requests',
        'The correlation ID is made by Splunk',
      ],
      1,
      'Mule passes the correlation ID from app to app in the X-Correlation-ID header and writes it in each log line. It ties the lines together but says nothing about timing. OpenTelemetry tracing adds a trace ID for the whole request and a span for each operation, with start, duration, status and parent, which is what a waterfall needs. Mule 4.6 and later can export those spans.',
    ),
    {
      title: 'Quote the whole basket at once',
      how: `Runtime Manager, ${PAPI}, Settings, Properties: set shipping.quote.mode to batch (one carrier call for the basket) or parallel (a Scatter-Gather, one route per item). Apply Changes.`,
      done: fixed,
    },
    {
      title: 'Build a checkout p95 dashboard',
      how: `Monitoring, Custom dashboards. Create Dashboard named Checkout, then Add chart: Application ${EAPI}, Metric ${P95}.`,
      done: (s) => Boolean(dashOf(s)),
    },
    {
      title: 'Watch the p95 fall',
      how: 'Move the clock 15 minutes after the fix and open the dashboard again with the time range on 30 minutes. The p95 line drops under 800 ms.',
      done: (s) => {
        const d = dashOf(s)
        const fixT = app(s, PAPI)?.updated ?? Infinity
        return fixed(s) && Boolean(d?.viewed >= fixT + 15 * MINUTE) && s.clock >= fixT + 15 * MINUTE && (p95Of(s, 15) ?? Infinity) < 800
      },
    },
  ],
  why: 'Per app averages hide a slow tail, and a slow hop deep in a chain looks normal on the dashboard of each app. A trace shows the whole request as spans with their timing, so the slow operation stands out: here a loop that called the carrier once per item, one after the other. Batch the calls or run them in parallel, then watch a percentile, not the average, on a custom dashboard. In the lab the Traces page is lab made: Mule 4.6 and later export OpenTelemetry spans to a tracing backend, which draws the waterfall.',
  docs: 'https://docs.mulesoft.com/monitoring/',
  solve(start) {
    let s = mark(start, `dash:${EAPI}`)
    const slow = s.observability.traces.findLast((t) => t.ms >= 2000)
    s = openTrace(s, slow.id)
    s = openTrace(s, slow.id, slow.cid)
    s = change(s, PAPI, { props: { ...app(s, PAPI).props, 'shipping.quote.mode': 'batch' } })
    const made = addDashboard(s, 'Checkout')
    s = addWidget(made.state, made.id, { metric: P95, app: EAPI })
    s = advance(s, 16 * MINUTE)
    return viewDashboard(s, made.id)
  },
  answers: { 3: 1, 4: 1 },
}

export const LABS = [lab]
