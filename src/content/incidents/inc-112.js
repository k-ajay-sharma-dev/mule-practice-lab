export default {
  id: 'inc-112',
  category: 'incidents',
  title: 'No Application Logs Anywhere After Moving to CloudHub 2.0: A Custom log4j2.xml With File and Console Appenders',
  level: 'INTERMEDIATE',
  tags: ['cloudhub-2', 'cloudhub', 'deployment', 'logging', 'log4j2', 'splunk', 'migration'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-03 09:00:12 INFO  [deploy] billing-api 3.2.0 deployed to CloudHub 2.0, config 7f3a, 2 replicas RUNNING', relevant: false },
      { text: '2026-11-03 09:00:13 INFO  [review] src/main/resources/log4j2.xml appenders: RollingFile (file), Console. Root logger: FILE, CONSOLE', relevant: true, why: 'These are the only two appenders. The platform removes file appenders, and Console output alone does not appear in Runtime Manager.' },
      { text: '2026-11-03 09:01:02 INFO  [ingress] POST /api/invoices 201 (112 ms)', relevant: false },
      { text: '2026-11-03 10:15:40 WARN  [support] Runtime Manager Logs page for billing-api shows no application log entries since 09:00', relevant: true, why: 'Traffic is flowing, as the ingress line shows, but no application log entries are being collected.' },
      { text: '2026-11-03 10:16:05 INFO  [settings] Monitoring tab: Forward application logs to Anypoint Platform = selected', relevant: true, why: 'Forwarding is on, which rules out the simplest cause and points to the custom Log4j configuration.' },
      { text: '2026-11-03 10:22:30 INFO  [support] Log level for com.billing changed to DEBUG, Apply Changes clicked', relevant: true, why: 'A change of log level restarts the application, so this attempt to troubleshoot adds a restart in business hours.' },
      { text: '2026-11-03 10:22:58 INFO  [deploy] billing-api restarting, new config 8c1d', relevant: false },
      { text: '2026-11-03 10:25:44 INFO  [splunk] search index=mule source=billing-api earliest=-24h returned 0 events', relevant: true, why: 'The app has no appender that sends to Splunk, so the external system is empty as well.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The custom log4j2.xml has only a file appender, which the platform removes, and a Console appender, whose output alone does not appear in Runtime Manager',
          'Application logs are not available on CloudHub 2.0 when a custom log4j2.xml is packaged',
          'Forward application logs to Anypoint Platform was switched off',
          'The 100 MB log storage limit was reached within one hour',
        ],
        answer: 0,
        explain: '`RollingFileAppender` is on the list of file appenders removed automatically, and console logging is disabled by default on CloudHub 2.0. With no appender that the platform collects, nothing appears.',
      },
      {
        type: 'single',
        prompt: 'An engineer sets the log level to DEBUG during the incident. What is the documented side effect?',
        options: [
          'Clicking Apply Changes after changing the log level restarts the application',
          'The level changes with no effect on the running application',
          'All older log entries are deleted',
          'The replica count drops to one for 30 days',
        ],
        answer: 0,
        explain: 'Treat this as a change to a production app. An update also creates a new config, so the Logs page can look empty until you pick a config.',
      },
      {
        type: 'single',
        prompt: 'What is the fix in the application?',
        options: [
          'Add an asynchronous appender that streams to the logging system, such as the SplunkHttp appender, and redeploy',
          'Replace RollingFile with RandomAccessFile',
          'Add a synchronous socket appender so that no log entry is lost',
          'Keep the Console appender only, and raise the level to DEBUG',
        ],
        answer: 0,
        explain: 'Log appenders must be asynchronous, since synchronous ones are not supported, and every file appender type is removed. The docs use SplunkHttp as the example for logs that flow to Splunk and stay viewable in CloudHub 2.0.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the log standards for CloudHub 2.0 apps?',
        options: [
          'No file appenders in log4j2.xml for CloudHub 2.0, since they are removed by the platform',
          'Only asynchronous appenders',
          'Ship logs to an external system when you need them beyond the storage limit of 100 MB per config or 30 days',
          'Check in the first deployment of each migrated app that application logs appear where expected',
          'Rely on MuleSoft Support to tune custom Log4j configurations',
        ],
        answer: [0, 1, 2, 3],
        explain: 'MuleSoft Support does not assist with custom logging configurations and is not responsible for lost logs caused by them, so ownership stays with the team.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Confirm that traffic is flowing and that application logs are not being collected',
          'Check that Forward application logs to Anypoint Platform is selected',
          'Review the appenders in the packaged log4j2.xml',
          'Add an asynchronous streaming appender and redeploy in a controlled way',
          'Verify entries in Runtime Manager and in Splunk, then audit other migrated apps',
        ],
        explain: 'Check the simple setting first, then find the cause in the configuration, make one planned deployment instead of repeated changes, and look for the same mistake elsewhere.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 10:15: an invoice dispute needs the logs of \`billing-api\`. The **Logs** page in Runtime Manager has no application entries since the 09:00 deployment.
- Splunk has no entries either, although the app is processing invoices.

## Change / Context
- \`billing-api\` moved from **CloudHub 1.0** to **CloudHub 2.0** this morning, with the same \`log4j2.xml\` it has had for years.
- That file has a **RollingFile** appender and a **Console** appender, and no appender for Splunk. The Splunk feed came from an old forwarder that was not part of the migration.
- The compliance team needs invoice logs in Splunk for one year.
- During the incident an engineer switched \`com.billing\` to DEBUG in the Monitoring tab at 10:22 and clicked **Apply Changes**.

## Logs
\`\`\`
09:00:12 INFO  [deploy] billing-api 3.2.0 deployed, config 7f3a, 2 replicas RUNNING
09:00:13 INFO  [review] log4j2.xml appenders: RollingFile, Console
10:15:40 WARN  [support] Logs page: no application entries since 09:00
10:16:05 INFO  [settings] Forward application logs to Anypoint Platform = selected
10:22:58 INFO  [deploy] billing-api restarting, new config 8c1d
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
    'File appenders (FileAppender, RollingFileAppender, RandomAccessFileAppender and AnypointMonitoringFileAppender) are removed automatically on CloudHub 2.0.',
    'Console logging is disabled by default, and output from a Console appender alone does not appear in Runtime Manager.',
    'Appenders must be asynchronous; synchronous appenders are not supported.',
    'The SplunkHttp appender is the documented example for logs that flow to Splunk and stay viewable in CloudHub 2.0.',
    'Changing the log level and clicking Apply Changes restarts the app.',
    'Storage is up to 100 MB per config or 30 days, whichever comes first; an update creates a new config.',
    'Custom logging is not supported by MuleSoft Support, so the team owns it.',
  ],
  solution: `
**Diagnosis.** Traffic flows and forwarding is selected, so the settings are not the cause. The packaged file has two appenders, and neither produces logs on CloudHub 2.0.

**Immediate mitigation.**
- Avoid further log level changes, each of which restarts the app.
- Prepare \`log4j2.xml\` with an asynchronous streaming appender such as \`SplunkHttp\`, and redeploy in a controlled way.
- For the dispute, use other records in the meantime, such as the invoice data in the billing system.
- Tell compliance about the gap in the logs from 09:00 to the fix.

**Root cause.** The file was carried over from CloudHub 1.0 without review. On CloudHub 2.0 the platform removes file appenders automatically, and Console output alone does not appear in Runtime Manager.

**Permanent fix.** Use an asynchronous appender for the external system, with its token held as a secure property. Keep logger levels in the configuration file or in the Monitoring tab, and treat level changes as a restart.

**Prevention.**
- Add a log4j2.xml review to the migration checklist.
- Use a shared template for appenders.
- Add a smoke test after deployment that checks for a known log line in both Runtime Manager and Splunk.
- Alert when an app that has traffic stops sending logs to Splunk.
`,
  followUps: [
    { q: 'Do I lose the Runtime Manager logs if I use a custom log4j2.xml on CloudHub 2.0?', a: 'The docs state that Mule runtime engine and application logs remain available in Runtime Manager with custom Log4j configurations. They also say to use an appender that CloudHub 2.0 collects, such as a third-party appender that streams to your logging system, or to enable log integration for the deployment to collect console output.' },
    { q: 'How does this differ from CloudHub 1.0?', a: 'On CloudHub 1.0, custom logging is enabled on request with the Disable CloudHub logs option, and the Log4J2CloudhubLogAppender sends logs to CloudHub alongside your own appender. With CloudHub logs disabled, only system logs stay in Runtime Manager.' },
    { q: 'Why does the Logs page look empty right after an update?', a: 'An update creates a new config. Logs from before the last update are in a drop-down of previous deployments, so select the older config to read them.' },
  ],
}
