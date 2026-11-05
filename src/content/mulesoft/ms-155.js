export default {
  id: 'ms-155',
  category: 'mulesoft',
  title: 'Seeing Inside CloudHub Apps: Log Retention, Log4j Forwarding and the Two Alert Systems',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'cloudhub', 'deployment', 'logging', 'log4j2', 'alerts', 'monitoring'],
  estMinutes: 35,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each store to its documented retention or size limit.',
      pairs: [
        ['Runtime Manager logs on CloudHub 2.0', 'Up to 100 MB per config or 30 days, whichever comes first'],
        ['Runtime Manager logs on CloudHub 1.0', 'Up to 100 MB per application per worker or 30 days, whichever comes first'],
        ['Mule diagnostics on CloudHub 2.0', '30 days or up to 150 MB'],
        ['A single log line in Anypoint Monitoring', '8 KB, and longer lines are truncated'],
      ],
      explain: 'A chatty app can use up 100 MB long before 30 days pass, so for audit or long-term analysis the logs must leave the platform. The docs say to use a custom appender for archiving.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'On **CloudHub 1.0**, you want logs in your own system and in Runtime Manager. What must the custom `log4j2.xml` include?',
      options: [
        'The `Log4J2CloudhubLogAppender` alongside your own appender, in a configuration enabled through the Disable CloudHub logs option',
        'Only your own appender, because CloudHub 1.0 always adds its appender back',
        'A `Console` appender, because CloudHub collects standard output',
        'No change is needed, because logs are forwarded automatically to any destination',
      ],
      answer: 0,
      explain: 'The Disable CloudHub logs option is available only on request. The docs warn that you must include the appenders in your custom configuration for MuleSoft Support to have visibility into the logs.',
    },
    {
      type: 'single',
      prompt: 'On CloudHub 1.0, a team sends logs to its own system with a custom `log4j2.xml` and selects **Disable CloudHub logs**. The configuration leaves out `Log4J2CloudhubLogAppender`, which keeps logs in CloudHub. What can the team still see in Runtime Manager?',
      options: [
        'Only system logs',
        'Only application logs',
        'Application logs and system logs, as before',
        'No logs at all',
      ],
      answer: 0,
      explain: 'Without the CloudHub appender, only system logs are available in Runtime Manager, and you cannot download application worker logs from the Logs page. System logs (`mule_ee.log`) cannot be forwarded to external logging solutions in the same way as application logs. Only asynchronous appenders can be used, and MuleSoft Support does not help with custom logging configurations or their side effects, such as lost logs or running out of disk space.',
    },
    {
      type: 'single',
      prompt: 'An app on CloudHub 2.0 gets a custom Log4j configuration that sends its logs to an external system. What happens to its logs in Runtime Manager?',
      options: [
        'Runtime and application logs stay available there',
        'Only system logs stay available there',
        'They stay only if you add `Log4J2CloudhubLogAppender`',
        'They stop until support enables a logging option',
      ],
      answer: 0,
      explain: 'Runtime and application logs remain available in Runtime Manager with a custom Log4j configuration. You do not need to configure `AnypointMonitoringFileAppender`, because deployment configures it automatically. Tracing module logs can be forwarded only with third-party appenders, and external collectors such as Azure Monitor are reached through a generic custom appender, not a built-in connector. The on-request Disable CloudHub logs option belongs to CloudHub 1.0. In the feature comparison, log forwarding on CloudHub 2.0 is Manual, while on CloudHub 1.0 it is Supported per app.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A CloudHub 2.0 app sat in a deployment loop overnight, and the Runtime Manager alert with the **Deployment failure** condition stayed silent. Why?',
      options: [
        'That condition is triggered only for failures, and not when the app is stuck in a deployment loop',
        'Alerts are disabled outside business hours',
        'Alerts work only for shared spaces',
        'The rate limit of one email every 2.5 seconds suppressed it',
      ],
      answer: 0,
      explain: 'The alert page says this directly. Use additional monitoring for an app that never reaches a healthy state, such as an external synthetic check against its health endpoint.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each requirement to the alert that provides it.',
      pairs: [
        ['CloudHub 2.0: email when a deployment succeeds or fails', 'Runtime Manager alert with a Deployment condition'],
        ['CloudHub 2.0: alert on error count for a Mule app', 'Anypoint Monitoring alert on Message Error Count'],
        ['CloudHub 1.0: email when a worker stops responding', 'Runtime Manager alert with the Worker not responding condition'],
        ['CloudHub 1.0: email for a business event raised in a flow', 'Custom alert on a notification from CloudHub Connector'],
      ],
      explain: 'The two systems have separate definitions, histories and APIs. Runtime Manager alerts are not listed on the Anypoint Monitoring Alerts page, and Runtime Manager alert endpoints do not return Anypoint Monitoring alerts.',
    },
    {
      type: 'single',
      prompt: 'An Anypoint Monitoring alert is set to Above 4 for each of the last 10 consecutive minutes. The metric exceeds 4 for nine minutes, drops in minute 10, and exceeds 4 again in minute 11. Does it fire?',
      options: [
        'No: the metric must breach the threshold in each of the 10 minutes, so the run starts again',
        'Yes: 9 of 10 minutes is enough',
        'Yes: the minute-11 breach completes the count',
        'It fires only if severity is Critical',
      ],
      answer: 0,
      explain: 'After a trigger, further notifications follow the repeat interval during a sustained breach. If the condition clears and recurs, a new notification fires immediately.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'A team moving from CloudHub 1.0 to 2.0 reviews its monitoring. Which statements are correct?',
      options: [
        'Built-in notifications are not supported on CloudHub 2.0',
        'Custom notifications through CloudHub Connector are not supported on CloudHub 2.0',
        'On CloudHub 2.0, Runtime Manager alerts apply to applications only, not servers',
        'Private space network traffic metrics are not available in Anypoint Monitoring',
        'Anypoint MQ queue depth can be charted in Anypoint Monitoring',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The Anypoint MQ overview says you cannot use Anypoint MQ with CloudHub Insight or Anypoint Monitoring. Monitoring dashboards do show connector metrics such as Anypoint MQ operations from the app side, but for queue statistics use the Anypoint MQ Stats API or usage reports.',
    },
  ],
  description: `
A retailer runs 25 apps on **CloudHub 1.0** and 40 on **CloudHub 2.0**, and it wants one operating standard for logs and alerts. The current state:

| Need | Today |
|---|---|
| Compliance | Application logs must be kept for one year |
| Support | Logs in Runtime Manager must stay usable during an incident |
| Volume | Several apps log full payloads at INFO, some lines over 20 KB |
| Alerts | CloudHub 1.0 apps use Worker not responding and custom notifications from CloudHub Connector |
| New problem | A CloudHub 2.0 app looped through failed starts all night and nobody was told |
| Reporting | Operations wants a dashboard of Anypoint MQ queue depth beside app metrics |

**Questions**
1. How long do logs stay on the platform, and how do you meet the one-year requirement?
2. What is different about custom Log4j on CloudHub 1.0 and 2.0?
3. Which alert system do you use for what, on each platform?
4. Why was nobody told about the failing app, and how do you close the gap?
5. What does the CloudHub 1.0 estate lose in the move to CloudHub 2.0?
`,
  answerTemplate: `## Retention and the one-year requirement

## Custom Log4j on each platform

## Choosing alerts

## The silent deployment loop

## What changes in a migration
`,
  keyPoints: [
    'CloudHub 2.0 stores up to 100 MB of logs per config or 30 days; CloudHub 1.0 stores up to 100 MB per application per worker or 30 days.',
    'Anypoint Monitoring truncates log lines at 8 KB. When storage is full, the oldest logs are deleted first.',
    'Appenders must be asynchronous on both platforms, and MuleSoft Support does not help with custom logging.',
    'CloudHub 1.0: the Disable CloudHub logs option is available on request, and Log4J2CloudhubLogAppender keeps logs in CloudHub.',
    'CloudHub 2.0: file appenders are removed automatically, AnypointMonitoringFileAppender is configured for you, and logs stay in Runtime Manager with a custom configuration.',
    'For CloudHub 2.0, the Runtime Manager alert conditions on the Configuring Application Alerts page are Deployment success and Deployment failure. Deployment failure does not fire for a deployment loop.',
    'Anypoint Monitoring alerts use metrics such as Message Error Count, Average Response Time, CPU, memory and thread count, with thresholds over consecutive minutes.',
    'Built-in notifications and CloudHub Connector notifications are not supported on CloudHub 2.0.',
  ],
  solution: `
**1. Retention.** Neither platform keeps logs for a year, so use a custom asynchronous appender to send them to the compliance store. Fix payload logging too: lines over 8 KB are truncated in Anypoint Monitoring, and 100 MB fills quickly.

**2. Custom Log4j.**
- **CloudHub 1.0**: request the feature, add your appender and \`Log4J2CloudhubLogAppender\`, deploy, then select **Disable CloudHub logs**. Without the CloudHub appender, only system logs remain in Runtime Manager.
- **CloudHub 2.0**: add an asynchronous streaming appender such as \`SplunkHttp\`, and do not use file appenders, since the platform removes them. Logs stay available in Runtime Manager. Changing a log level restarts the app, so plan level changes.

**3. Alerts.**
| Platform | Runtime Manager | Anypoint Monitoring |
|---|---|---|
| CloudHub 1.0 | CPU, memory, worker not responding, deployment, event traffic, custom notification | Confirm first: the alerts page lists CloudHub 2.0 and Runtime Fabric as supported hosts |
| CloudHub 2.0 | Deployment success and failure | Message count, errors, response time, CPU, memory, threads, API alerts |

Alert allowances vary by tier. For example, basic alerts for servers and Mule apps are 50 on Gold or Platinum and 10 per server or app on Advanced. Check the FAQ for your subscription.

**4. The silent loop.** **Deployment failure** does not fire when an app is stuck in a deployment loop. Close the gap by adding an external synthetic check against the app, and read replica state during deployments: \`CrashLoopBackoff\` tells you the replica cannot restart.

**5. Migration losses.** Worker-related alerts and CloudHub Connector notifications have no direct equivalent. Replace custom notifications with logged business events shipped to your logging system, or with Anypoint Monitoring alerts on metrics. Queue depth must come from the Anypoint MQ Stats API.
`,
  followUps: [
    { q: 'What does the memory alert in Anypoint Monitoring measure?', a: 'heap_used divided by heap_total. The docs note that heap_total is not the same as the maximum heap of the replica or worker, because the JVM changes it dynamically.' },
    { q: 'Does deleting an app delete its logs in Anypoint Monitoring?', a: 'Not immediately. Runtime Manager and Anypoint Monitoring keep logs separately. Logs in Anypoint Monitoring stay accessible through the Archive API until the oldest logs are deleted to reclaim storage.' },
    { q: 'Can I delete a log line that contains sensitive data?', a: 'You cannot delete logs directly. Raise a support case, and note that searchable logs are removed by dropping whole indices, so the deleted range can be larger than the range you asked for.' },
    { q: 'How often can alert emails be sent?', a: 'For CloudHub 2.0 custom alerts, the rate limit is one alert notification email every 2.5 seconds per organization, enforced by a combination of organization, environment, alert and application.' },
  ],
}
