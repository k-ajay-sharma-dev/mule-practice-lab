export default {
  id: 'inc-163',
  category: 'incidents',
  title: 'Peak-Day Dashboard Shows Most Orders Under Other and Charts Crawl: order_id Used as a Custom Metric Dimension',
  level: 'INTERMEDIATE',
  tags: ['deployment', 'observability', 'anypoint-monitoring', 'custom-metrics', 'dashboards', 'performance', 'retail'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-27 09:00:02 INFO  [dashboard] "Black Friday orders": refresh every 1m, time range 30d', relevant: true, why: 'A long time range and a high refresh frequency both increase query cost and slow charts.' },
      { text: '2026-11-27 09:04:11 WARN  [dashboard] Chart "Orders by order" query took 47 s', relevant: true, why: 'Charts on custom metrics with high cardinality dimensions adversely affect dashboard response time.' },
      { text: '2026-11-27 09:04:30 INFO  [dashboard] Grouping: Other=96.4%, ORD-88120411=0.0%, ORD-88120412=0.0%', relevant: true, why: 'Beyond 100 unique combinations, lower-volume combinations are grouped under Other. Each order ID is low volume.' },
      { text: '2026-11-27 09:05:02 INFO  [prc-orders] custom-metrics:send metricName=orders dimensions={order_id:ORD-88120413,channel:web} facts={count:1,value:84.20}', relevant: true, why: 'The metric uses `order_id` as a dimension, the example of high cardinality data the docs warn against.' },
      { text: '2026-11-27 09:05:03 INFO  [prc-orders] POST /orders 201 (121 ms)', relevant: false },
      { text: '2026-11-27 09:05:40 INFO  [insights] prc-orders: 2,140 requests/min, failures 0.2%, response 124 ms', relevant: true, why: 'Built-in metrics show the real order flow is healthy, so the problem lies with the custom metric, not the app.' },
      { text: '2026-11-27 09:06:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-27 09:07:12 INFO  [runtime] prc-orders: 3 replicas Running, CPU 44%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does almost everything appear under Other?',
        options: [
          'Anypoint Monitoring supports up to 100 unique combinations of custom dimensions; with `order_id`, every order is a new low-volume combination, so nearly all are grouped under Other',
          'Most orders failed validation',
          'The dashboard only shows the top 20 flows',
          'The app is sending metrics to the wrong environment',
        ],
        answer: 0,
        explain: 'The limit applies to all custom dimensions combined. The 20-item limit in the docs is for built-in endpoints and operations, not custom metric dimensions.',
      },
      {
        type: 'single',
        prompt: 'During the peak, what is the quickest way to make the dashboard usable?',
        options: [
          'Reduce the time range and the refresh frequency, and use the built-in Insights views for live traffic',
          'Raise the replica count of `prc-orders`',
          'Restart the Anypoint Monitoring service',
          'Delete the metric name from the database',
        ],
        answer: 0,
        explain: 'Both parameters directly affect query response time, and neither needs a code change on a peak day. Other mechanisms for purging fact names are not supported.',
      },
      {
        type: 'multi',
        prompt: 'What is the permanent design for this metric?',
        options: [
          'Create a new metric without the high cardinality dimension',
          'Use low cardinality dimensions such as `channel` or `country_code`',
          'Use a count fact such as `order_count` instead of `order_id`',
          'Keep the per-order detail in structured logs and business data',
          'Add `customer_id` as well to spread the data',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The first three come from Custom Metrics Best Practices, and the fourth follows from them. `customer_id` is itself high cardinality.',
      },
      {
        type: 'single',
        prompt: 'After the fix, the old metric name still appears in the Custom Metrics tab. What should the team expect?',
        options: [
          'That is normal: an old metric name continues to appear in the tab, and fact names are removed only when the retention period expires, with no other supported way to purge them',
          'It means the deployment failed',
          'It must be deleted by a support case within a day',
          'It means the app is still sending data',
        ],
        answer: 0,
        explain: 'The docs advise avoiding metric name changes for this reason, so choose names carefully.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm from built-in metrics that order processing is healthy',
          'Tell the business that the dashboard figures are not reliable for per-order views',
          'Reduce time range and refresh frequency to restore the dashboard',
          'Design a low cardinality metric and test it in a lower environment',
          'Deploy it after the freeze, and rebuild the charts',
          'Add a review of metric dimensions to the design checklist',
        ],
        explain: 'First separate monitoring trouble from business trouble, then communicate, then correct the design safely.',
      },
    ],
  },
  description: `
## Symptoms
- Black Friday 09:00: the trading room's custom dashboard takes up to a minute to load, and other charts on it are slow too.
- The chart "Orders by order" shows **96% of volume under a group called Other**. The commercial director asks whether orders are being lost.
- Built-in Anypoint Insights views for \`prc-orders\` load quickly and show normal volumes.

## Change / Context
- Two weeks ago a developer added the Anypoint Custom Metrics connector to \`prc-orders\`, so the business could "drill into any order". It sends one measurement per order with dimensions \`order_id\` and \`channel\`, and facts \`count\` and \`value\`.
- In the test environment, with about 40 orders, the chart looked perfect.
- The dashboard is set to a 30-day range with a one-minute refresh.
- Production has a change freeze until Monday.

## Logs
\`\`\`
09:04:11 WARN [dashboard] Chart "Orders by order" query took 47 s
09:04:30 INFO [dashboard] Grouping: Other=96.4%, ORD-88120411=0.0%, ORD-88120412=0.0%
09:05:02 INFO [prc-orders] custom-metrics:send metricName=orders dimensions={order_id:ORD-88120413,channel:web}
09:05:40 INFO [insights] prc-orders: 2,140 requests/min, failures 0.2%, response 124 ms
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
    'Orders are not lost: built-in metrics show normal traffic, so this is a monitoring design fault.',
    'High cardinality dimensions such as `order_id`, `customer_id` and `transaction_id` must not go into custom metrics.',
    'Anypoint Monitoring supports up to 100 unique combinations of custom dimensions; lower-volume ones go to Other.',
    'High cardinality charts can adversely affect dashboard response time, and a slow chart can affect others.',
    'Larger time ranges and higher refresh frequencies add query cost.',
    'Fact names are removed only when the retention period expires, and an old metric name continues to appear in the Custom Metrics tab.',
    'A test with 40 orders could not reveal a limit of 100 combinations, so tests must use realistic cardinality.',
    'Per-order detail belongs in logs or a data platform; metrics are for aggregates.',
  ],
  solution: `
**Diagnosis.** Check business health first. Insights shows 2,140 requests per minute, 0.2% failures and normal latency. So the order flow is fine and the dashboard is misleading. The Grouping line shows why: each order is a distinct combination, and Anypoint Monitoring groups lower-volume combinations under **Other** after 100.

**Immediate mitigation.**
- Tell the commercial director that orders are healthy and that the "Other" group is a dashboard limit.
- Shorten the time range, for example to a day, and refresh less often. The docs recommend both.
- Remove or hide the "Orders by order" chart, and use a chart grouped by \`channel\` if possible, because \`channel\` is low cardinality. Use the built-in views for live figures.
- Do not change the app during the freeze: the send call is not harming processing.

**Root cause.** A metric was designed as a per-record log. Dimensions should have few possible values, but \`order_id\` has an unbounded number, which breaks both the grouping and chart performance. Testing with 40 orders stayed under the limit.

**Permanent fix.** After the freeze, create a new metric without \`order_id\`: dimensions such as \`channel\` and \`country_code\`, numeric facts such as \`order_count\` and \`order_value\`. Rebuild charts on it. A custom metric only appears in the \`metric_name\` list after the app starts emitting measurements, so add it to charts while it is producing data. Answer "where is this order?" with Log Search or a business data store, using the order ID in structured logs.

**Prevention.** Add a design rule: no IDs, UUIDs or timestamps as dimensions, and an estimate of the unique combinations for each new metric. Test with production-like cardinality. Set standard time ranges and refresh rates for shared dashboards.
`,
  followUps: [
    {
      q: 'Could a metric break the order flow?',
      a: 'Yes, if you allow it to. Non-numeric fact values are not validated at design time and cause a runtime exception after deployment, and with Throw runtime exception on validation failure selected, invalid values break the flow. If it is left unchecked, an error is logged and the flow continues.',
    },
    {
      q: 'Why did the old chart still work in test?',
      a: 'With about 40 orders there were fewer than 100 combinations, so no grouping occurred. It is a limit you only hit at volume.',
    },
    {
      q: 'Is Other the same thing that appears for built-in endpoints?',
      a: 'It works in a similar way, with a different limit. Every minute, Anypoint Monitoring collects metrics for up to 20 of the most frequently called endpoints or operations, and the rest go to Other, so those figures are estimates.',
    },
  ],
}
