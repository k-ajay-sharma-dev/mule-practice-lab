export default {
  id: 'inc-097',
  category: 'incidents',
  title: 'Three Hours of Failed Orders and the Alert Stayed OK: Consecutive-Minute Thresholds and Flapping Errors',
  level: 'INTERMEDIATE',
  tags: ['observability', 'anypoint-monitoring', 'alerts', 'api-management', 'monitoring', 'retail'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '14:02 metric orders-api Message Error Count = 41 (alert rule: Above 20 for each of the last 10 consecutive minutes)', relevant: true, why: 'The first bad minute is well above the threshold, but the rule needs ten such minutes in a row.' },
      { text: '14:03 metric orders-api Message Error Count = 37', relevant: false },
      { text: '14:05 metric orders-api Message Error Count = 3', relevant: true, why: 'One quiet minute breaks the run of consecutive minutes, so the count starts again.' },
      { text: '14:06 INFO  [health] GET /api/health 200 (4 ms)', relevant: false },
      { text: '14:11 metric orders-api Message Error Count = 44', relevant: false },
      { text: '14:14 metric orders-api Message Error Count = 2', relevant: true, why: 'The pattern repeats: high for a few minutes, then a dip, so no run ever reaches ten minutes.' },
      { text: '15:30 alert "orders-api errors" status OK, Last Alerted: -', relevant: true, why: 'The alert is enabled and evaluating. It has never triggered, so it did what it was configured to do.' },
      { text: '16:47 ERROR [orders-api] HTTP:CONNECTIVITY calling wms-sapi: connection refused (order 88120)', relevant: true, why: 'The errors come from a backend that keeps restarting, which gives short bursts and not one long outage.' },
      { text: '16:48 INFO  [runtime] orders-api: 3 replicas RUNNING, CPU 18%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the alert not trigger?',
        options: [
          'The rule needs the metric above the threshold in each of 10 consecutive minutes, and a low minute in every burst reset the count',
          'Anypoint Monitoring was down during the incident',
          'Alerts are limited to one per app',
          'Message Error Count does not include connectivity errors',
        ],
        answer: 0,
        explain: 'The docs give this exact case: if the count passes the threshold for 9 of 10 minutes but not the tenth, the alert does not trigger. The status OK and an empty Last Alerted confirm that it worked as configured.',
      },
      {
        type: 'single',
        prompt: 'What is the best immediate action on the alerting side?',
        options: [
          'Shorten the consecutive-minute period, for example Above 20 for each of the last 2 minutes, so that a burst triggers it',
          'Raise the threshold to 100',
          'Disable the alert and watch the dashboard',
          'Add more replicas of orders-api',
        ],
        answer: 0,
        explain: 'The bursts last three or four minutes, so the period must be shorter than that. A higher threshold makes it harder to trigger, and replicas do not help a backend that is restarting.',
      },
      {
        type: 'multi',
        prompt: 'Which changes belong in the permanent fix?',
        options: [
          'Choose the period from the real failure patterns, not from a default of 10 minutes',
          'Add an instance alert on the API for response codes 500, 502 and 503, using a sliding window',
          'Test the alert by forcing the failure in a non-production environment',
          'Alert on the backend (wms-sapi) too, so the restart loop is seen at its source',
          'Remove Message Error Count from all alerts',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Instance alerts are evaluated over a sliding window, so a burst can trigger one even before the window closes. Alerts need testing like any other part of the system.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm from the per-minute metric that errors came in bursts',
          'Check the alert rule and status to confirm that it evaluated and did not trigger',
          'Change the rule so that the current bursts trigger it',
          'Work with the WMS team to stop the restart loop',
          'Reprocess the failed orders and reconcile counts',
          'Review other alerts that use long consecutive periods',
        ],
        explain: 'Understand the pattern, restore detection, fix the cause, repair the data, then look for the same flaw elsewhere.',
      },
    ],
  },
  description: `
## Symptoms
- Friday 17:00: the store operations team reports that about 1,900 orders failed between 14:00 and 17:00.
- Nobody was alerted. The Anypoint Monitoring **Alerts** page shows the alert \`orders-api errors\` with status **OK**, and **Last Alerted** is empty.
- The dashboard for \`orders-api\` shows a saw-tooth error chart.

## Change / Context
- \`orders-api\` runs on CloudHub 2.0, in an organization on the Advanced package.
- The alert was created last year: **Message Error Count, Above 20, for each of the last 10 consecutive minutes**, severity Critical.
- \`wms-sapi\` lost its database pool at 14:00 and has been restarting every few minutes. While it is up, orders succeed.

## Logs
\`\`\`
14:02 metric orders-api Message Error Count = 41
14:03 metric orders-api Message Error Count = 37
14:05 metric orders-api Message Error Count = 3
14:11 metric orders-api Message Error Count = 44
14:14 metric orders-api Message Error Count = 2
15:30 alert "orders-api errors" status OK, Last Alerted: -
16:47 ERROR [orders-api] HTTP:CONNECTIVITY calling wms-sapi: connection refused
\`\`\`

## Your tasks
1. Why did the alert stay OK?
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
    'An Anypoint Monitoring alert threshold has the form: metric Above N for each of the last M consecutive minutes.',
    'Every minute in the run must pass the threshold. One minute below it means the alert does not trigger, even if the next minute is high again.',
    'Status OK with an empty Last Alerted shows that the alert evaluated and did not trigger. Status Paused would mean it was disabled, and No data would mean there was no series to evaluate.',
    'Bursts of three or four minutes can never satisfy a 10-minute run.',
    'Instance alerts on an API use a sliding window, and their email can be sent before the window closes.',
    'Infrastructure metrics stay normal, so they do not help here. The root cause of the failures is a restart loop in the backend.',
    'Prevention: test alerts with a realistic failure, and base periods on real failure patterns.',
  ],
  solution: `
**Diagnosis.** The alert rule asks for a metric above 20 in **each** of the last 10 consecutive minutes. The errors came in bursts of three or four minutes with a low minute between them, so the run was always broken. The docs describe this case: if a count passes the threshold for 9 of 10 minutes but not the tenth, the alert does not trigger, even if it passes again at minute 11.

The alert's status helps. **OK** means that the metric had not passed the rule. It was not disabled (that is **Paused**), and data was present (otherwise it would be **No data**).

**Immediate mitigation.**
- Change the rule to a period shorter than the bursts, for example 2 minutes.
- Tell the WMS team and stop the restart loop.
- Reprocess the 1,900 failed orders, and reconcile counts with store operations.

**Root cause.** The failures came from \`wms-sapi\`. They went unnoticed because the rule was written for a long, steady outage. The alert worked as configured, and it was the wrong rule for the failure pattern.

**Permanent fix.**
- Set the period from observed patterns, and consider two alerts: a short one for bursts and a longer one for steady degradation.
- Add an instance alert on the API for response codes. Instance alerts are evaluated over a sliding window, and the notification can be sent before the window has fully closed.
- Add an alert on \`wms-sapi\` itself, so that restarts are seen at the source.

**Prevention.** Test each critical alert by causing a realistic failure in a non-production environment, and check that a person receives it. Review alerts after every incident: "should this have fired?" Remember that an alert notification is sent at once when it triggers, and is repeated at the configured repeat interval while the breach continues.
`,
  followUps: [
    { q: 'What does a repeat interval change?', a: 'Only re-notifications during a sustained breach. If the condition clears and comes back, a new notification fires immediately, regardless of the repeat interval.' },
    { q: 'Would a Runtime Manager alert have caught this?', a: 'Those are focused on infrastructure and lifecycle events such as CPU, memory and deployments. Here the replicas were running and CPU was normal, so those conditions would not show the problem in orders-api.' },
    { q: 'Why does an instance alert only email on a change of state?', a: 'Instance alerts trigger only when states change. API Manager sends the notification, then stops listening until the next alert period, to avoid repeated emails. The first state change might go undetected, because a new alert has no defined state yet.' },
  ],
}
