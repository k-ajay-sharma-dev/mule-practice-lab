export default {
  id: 'ms-158',
  category: 'mulesoft',
  title: 'Operating CloudHub 1.0: Schedulers, Worker Restarts, Insight and Dedicated Load Balancer Updates and Logs',
  level: 'INTERMEDIATE',
  tags: ['cloudhub', 'deployment', 'scheduler', 'workers', 'monitoring', 'dlb', 'operations'],
  estMinutes: 35,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each case to the behaviour documented for **CloudHub 1.0** and **CloudHub 2.0** schedules.',
      pairs: [
        ['CloudHub 1.0: a job was not triggered because the app was not running', 'Triggered as soon as the app restarts'],
        ['CloudHub 2.0: a job was not triggered because the app was not running', 'Runs at its next scheduled time'],
        ['CloudHub 1.0: multi-worker app', 'Each trigger executes on a single worker'],
        ['CloudHub 2.0: multi-replica app without clustering', 'Schedules run on all replicas'],
      ],
      explain: 'These differences matter in migration. The same app can catch up after an outage on CloudHub 1.0, and skip the run on CloudHub 2.0.',
    },
    {
      type: 'single',
      prompt: 'A job must run on CloudHub 1.0 at 06:00 in Sydney. The Manage Schedules page says schedules are based in which time zone?',
      options: [
        'UTC, regardless of the region where the app is deployed, so the expression must be converted',
        'The time zone of the deployment region',
        'The time zone of the browser of the user who set the schedule',
        'The time zone of the Anypoint control plane',
      ],
      answer: 0,
      explain: 'The page says that because all schedules are based on UTC, the time zone configuration is ignored. Remember to review the conversion if the local zone changes its clocks.',
    },
    {
      type: 'single',
      prompt: 'During a platform update, a long-running CloudHub 1.0 schedule ran twice. What does the page describe?',
      options: [
        'CloudHub waits two minutes for existing schedules to complete and then retriggers incomplete schedules, and zero-downtime deployments can also trigger a schedule more than once, so flows must be idempotent',
        'CloudHub waits up to 12 hours for schedules to finish',
        'Schedules are never affected by updates',
        'A schedule can run twice only if the app has more than one worker',
      ],
      answer: 0,
      explain: 'The 12-hour figure is the infrastructure grace period on CloudHub 2.0. The defence on CloudHub 1.0 is idempotent flows.',
    },
    {
      type: 'single',
      prompt: 'A fixed 15-second polling schedule drifts and occasionally seems to merge runs under load. What is the documented position?',
      options: [
        'Schedules are best effort. For time-sensitive work use an interval of 60 seconds or more, and for precise execution trigger the flow externally, for example over HTTP',
        'Drift means the worker is impaired, so it should be restarted',
        'Setting a cron expression guarantees exact timing',
        'Adding workers removes the drift',
      ],
      answer: 0,
      explain: 'The platform evaluates due schedules on a recurring cycle, and drift is most significant at short intervals.',
    },
    {
      type: 'order',
      prompt: 'With **Automatically restart application when not responding** selected, order what CloudHub does when the worker JVM stops responding and recovery keeps failing.',
      items: [
        'Health checks every 30 seconds fail three times in a row, and the logs print a warning',
        'CloudHub restarts the application on the same worker, up to five attempts',
        'CloudHub terminates the failed worker and provisions a new one, up to three relaunches',
        'CloudHub stops automatic recovery and sends a notification',
        'You redeploy the application manually',
      ],
      explain: 'An application restart keeps the worker, and a relaunch replaces it. A notification appears in the console, and if you configured email alerts, the Worker not responding alert fires.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about worker monitoring are correct?',
      options: [
        'CloudHub attempts to restart impaired workers regardless of the application restart setting',
        'If the app fails to start after five attempts on an impaired worker, its status is Failed or Unrecoverable Runtime Error and you must restart it manually',
        'For scheduled maintenance, a notification appears one month before the restart, with a reminder one week before',
        'Without the automatic restart option, CloudHub shows a notification and a log message but does not attempt recovery of an unresponsive app',
        'Changing `monitoringEnabled` through the API restarts the application automatically',
      ],
      answer: [0, 1, 2, 3],
      explain: 'If you change `monitoringEnabled` through the API, the app does not restart automatically, and you must restart it yourself.',
    },
    {
      type: 'single',
      prompt: 'A support lead wants **Insight** switched on permanently for the production order app, so transactions can always be traced. What do the docs say?',
      options: [
        'Insight is marked to be deprecated, can significantly affect processing performance and memory, and should not be enabled for long periods in production. Use it for specific transactions only',
        'It is the recommended production monitoring tool, with no impact',
        'It can stay on as long as the app has two workers',
        'It is available only on CloudHub 2.0',
      ],
      answer: 0,
      explain: 'Insight limits include 50,000 events per minute per app and 100,000 per business group, and it may not give visibility into batch processing. The page points to traces as the new approach.',
    },
    {
      type: 'multi',
      prompt: 'The **Update** button appears on a dedicated load balancer. Which statements are correct?',
      options: [
        'Updates are provided quarterly, with OS and security patches, and more often if necessary',
        'An applied update cannot be rolled back, so update the Sandbox DLB first and test',
        'The update is a rolling restart with no downtime, and no transactions are dropped provided they are shorter than 600 seconds or the Mule Application Response Timeout, whichever is smaller',
        'If you are prompted to add new static IPs to your allowlist, do so before clicking Update',
        'Updates include new features that change mapping rules',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The updates do not include feature changes. Some in-flight requests might see a brief interruption during the restart.',
    },
    {
      type: 'multi',
      prompt: 'You need DLB logs for an investigation, using the CloudHub API. Which statements are correct?',
      options: [
        'Download is asynchronous: initiate a request, check its status, then use the download URL',
        'A second request for the same DLB while one is in progress fails with HTTP 429',
        'By default a request returns up to 10,000 of the most recent rows, and `maxRows` can raise that to 500,000',
        'For older logs, use the `ABSOLUTE` query type with a specific time range',
        'The `.zip` file opens without any token',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The file needs the `token` value from the status response to extract it. The token cannot be recovered after it expires, so download the file and keep the token within the validity window, which is 60 minutes by default.',
    },
  ],
  description: `
A travel company still runs 40 apps on **CloudHub 1.0**, and a new support engineer is taking over the operations runbook. Recent events:

- A Sydney team set a job for 06:00 and it runs at the wrong local time.
- A long reconciliation schedule ran twice during a platform update, posting duplicate entries.
- A 15-second poller drifts, and a downstream team complains about gaps.
- One app became unresponsive at night. Nobody knows whether CloudHub tried to fix it, or why it finally needed a manual redeploy.
- The support lead wants Insight switched on for good.
- The **Update** button has appeared on the production DLB, and a partner issue requires DLB logs from nine days ago.

**Questions**
1. How do CloudHub 1.0 schedules behave, and how is that different from CloudHub 2.0?
2. How do you make scheduled work safe?
3. Explain worker monitoring, restarts, relaunches and impaired workers.
4. Should Insight be enabled in production?
5. How do you plan a DLB update?
6. How do you get the DLB logs?
`,
  answerTemplate: `## Schedule behaviour

## Safe scheduled work

## Monitoring and restarts

## Insight

## DLB update

## DLB logs
`,
  keyPoints: [
    'CloudHub 1.0 schedules are in UTC, run on a single worker per trigger, and run on a best-effort basis.',
    'A job missed while the app was down is triggered as soon as it restarts on CloudHub 1.0, and at the next scheduled time on CloudHub 2.0.',
    'During updates, CloudHub waits two minutes and then retriggers incomplete schedules; zero-downtime deployments can also trigger twice. Flows must be idempotent.',
    'Health checks run every 30 seconds, and three failures in a row print a warning. With the option selected, there are up to five restarts on the worker, then up to three relaunches on a new worker.',
    'Impaired worker replacement happens regardless of the application restart option.',
    'Insight is to be deprecated, has a significant performance and memory impact, and is for short, specific troubleshooting.',
    'DLB updates are quarterly, cannot be rolled back and are rolling restarts. Update Sandbox first, and add any new static IPs to allowlists before clicking Update.',
    'DLB logs come from an asynchronous API: one request per DLB at a time, 10,000 rows by default, up to 500,000 with maxRows, and a token is needed to extract the zip file.',
  ],
  solution: `
**1. Schedules.** All schedules are based in UTC, so 06:00 in Sydney must be converted. Each trigger runs on a single worker, and later triggers may run on another. The frequency set in the Schedules tab wins over the value in the JAR, even after a redeploy of the same schedule. Cron expressions cannot give both a day of week and a day of month, so use \`?\` in one of them.

**2. Safe work.** Make flows idempotent, because long-running schedules can be retriggered after two minutes during updates and overlapping triggers can occur during zero-downtime deployments. Use an interval of 60 seconds or more for time-sensitive work, and trigger externally for precise timing.

**3. Restarts.** CloudHub checks the Mule Agent health endpoint every 30 seconds. After three consecutive failures the logs print a warning, a console notification appears, and the Worker not responding alert fires if configured. With the automatic restart option, CloudHub restarts the app on the same worker up to five times, then relaunches on a new worker up to three times. It then stops and notifies you, and you must redeploy manually. Without the option, it only notifies you. Impaired workers are a separate mechanism: CloudHub attempts to restart the app on a new worker, regardless of the option.

**4. Insight.** No. Use it briefly to troubleshoot a specific transaction. It keeps events for two days and displays transactions for 30 days, and it can drop events over its limits. For production monitoring, use the tools on the Monitor Applications page.

**5. DLB update.** Read the release notes, add new static IPs to allowlists when prompted, update the Sandbox DLB and test, then update production at a suitable time. It is a rolling restart and cannot be rolled back. If a sustained outage follows, contact MuleSoft Support.

**6. DLB logs.** Nine days ago is outside the \`RELATIVE\` presets, whose longest range is the last 24 hours. So call Initiate Download with \`queryType\` set to \`ABSOLUTE\`, and with \`startTime\` and \`endTime\` in ISO 8601 UTC with microsecond precision. Set \`maxRows\` if needed, poll the status API, then download the file and keep the token.
`,
  followUps: [
    { q: 'Can I manage CloudHub 1.0 schedules with scripts?', a: 'Not with scripts. Use the Schedules tab or the CloudHub API.' },
    { q: 'What permissions do I need to view schedules?', a: 'Exchange Viewer and Read Applications.' },
    { q: 'Does the automatic restart option cover every failure?', a: 'It covers an unresponsive app through restarts and relaunches. If those attempts all fail, CloudHub stops recovery and you must redeploy manually.' },
    { q: 'What is the shortest supported schedule on CloudHub 1.0?', a: 'The Manage Schedules page describes every 10 seconds as the minimum supported frequency, though short intervals drift the most.' },
  ],
}
