export default {
  id: 'ms-143',
  category: 'mulesoft',
  title: 'Log Files and log4j2 on a Standalone Runtime: Which File Controls What, Audit Logs and Changing Levels Without a Restart',
  level: 'INTERMEDIATE',
  tags: ['deployment', 'observability', 'logging', 'log4j', 'on-prem', 'hybrid'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each log on a standalone runtime to what it holds.',
      pairs: [
        ['`$MULE_HOME/logs/<app-name>.log`', 'Unhandled errors raised in that app and anything it logs explicitly'],
        ['`mule_ee.log`', 'App and service lifecycle events, such as starts, deployments and undeployments'],
        ['`mule_agent.log`', 'Runtime Manager agent state'],
      ],
      explain: 'When Mule runs as a service or daemon, startup and deployment status does not appear in a console, so `mule_ee.log` is the place to look.',
    },
    {
      type: 'single',
      prompt: 'An operator edits `$MULE_HOME/conf/log4j2.xml` to set DEBUG for one app. The app log does not change. Why is this the first thing to check?',
      options: [
        'Each app has its own `log4j2.xml`, and the file in `conf` is the runtime configuration; the default can be overridden at domain or app level',
        'DEBUG is not an accepted level',
        'Only Runtime Manager can change a level',
        'Files in `conf` are read only by the agent',
      ],
      answer: 0,
      explain: 'Every app built in Studio comes with its own `log4j2.xml` in `src/main/resources`, and that file defines how the app log is written.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An app must use a config file named `custom-log4j2.xml`. Where do you declare that?',
      options: [
        'A `logConfigFile` entry in `mule-artifact.json`, with a path relative to the root of the app',
        'In `wrapper.conf`',
        'In `mule-agent.yml`',
        'As a Runtime Manager property named `log4j2`',
      ],
      answer: 0,
      explain: 'This is the documented way of pointing an app at a custom file name.',
    },
    {
      type: 'single',
      prompt: 'A payments app uses its log as an audit trail. The default configuration uses `AsyncLogger` and `AsyncRoot`. What should change?',
      options: [
        'Use synchronous logging with `Logger` and `Root`, because asynchronous logging might lose entries in a system crash',
        'Keep asynchronous logging and raise the level to TRACE',
        'Set `AsyncLoggerConfig.RingBufferSize` to 20000, which guarantees delivery',
        'Add a second console appender',
      ],
      answer: 0,
      explain: 'Asynchronous logging gives substantially better throughput and latency, so MuleSoft recommends it in most cases, but not for audit trails. The two can be mixed, so only the audit category needs to be synchronous.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Operations want log level changes in `conf/log4j2.xml` to apply without a restart every time. What is the documented setup?',
      options: [
        'Add `monitorInterval` to `<Configuration>` and restart Mule once to load it; later changes apply within the interval',
        'Touch the anchor file of each app after each change',
        'No setup is possible: every change needs a restart',
        'Add `monitorInterval` and no restart is ever needed, even the first time',
      ],
      answer: 0,
      explain: 'For example, `<Configuration monitorInterval="15">` makes Log4j 2 check for changes every 15 seconds.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'After a change to Log4j 2, "nothing happened". What is the documented diagnostic?',
      options: [
        'Start Mule with `-M-Dlog4j.debug=true`, which writes the location of the configuration file in use to `stdout`',
        'Delete the `logs` folder',
        'Run `amc_debug -heap`',
        'Set the root logger to TRACE',
      ],
      answer: 0,
      explain: 'The usual cause is another `log4j2.xml` on the classpath that is picked up first, and that file has to be removed for your change to work.',
    },
  ],
  description: `
A bank's support team takes over eleven Mule apps on a Hybrid Standalone server. They find the following:

- A support engineer changed a log level in \`$MULE_HOME/conf/log4j2.xml\` and restarted the runtime, but one app did not change.
- The auditors require that every payment approval is written to a log, with no gaps, even after a crash.
- The agent logs fill the same disk as the apps, and the storage team wants agent logs in a separate, size-limited file.
- Night-shift staff are not allowed to restart production, but they sometimes need more detail for a single package.
- Nobody is sure where to look when a deployment fails on a server running as a daemon.

**Questions**
1. Which logs exist on the server, and which file controls each?
2. Why did the level change fail to reach the app?
3. How do you satisfy the auditors without slowing all the apps?
4. How do you redirect agent logs?
5. How can the night shift change levels without a restart?
`,
  answerTemplate: `## Logs and their configuration

## The failed level change

## Audit logging

## Agent logs

## Changing levels safely
`,
  keyPoints: [
    'App logs go to MULE_HOME/logs/<app-name>.log by default; the path can be customised in the app log4j2.xml.',
    'mule_ee.log is the runtime log, configured by $MULE_HOME/conf/log4j2.xml. It records lifecycle events.',
    'Configuration can be overridden at domain or app level, and logConfigFile in mule-artifact.json names a custom app file.',
    'Mule logs asynchronously at INFO and above by default.',
    'Asynchronous logging might lose entries in a system crash, so audit trails should use synchronous loggers.',
    'A mix of synchronous and asynchronous loggers is possible.',
    'A mule-agent-appender in conf/log4j2.xml redirects Runtime Manager agent logs from mule_agent.log.',
    'monitorInterval reloads the file at an interval, after one restart. -M-Dlog4j.debug=true shows which file is in use.',
  ],
  solution: `
**Logs and their configuration.**
| Log | Holds | Configured by |
|---|---|---|
| \`MULE_HOME/logs/<app-name>.log\` | Unhandled app errors and what the app logs | The app's \`log4j2.xml\` |
| \`mule_ee.log\` | Lifecycle events for apps and services | \`$MULE_HOME/conf/log4j2.xml\` |
| \`mule_agent.log\` | Agent state | Default, or \`mule-agent-appender\` in \`conf/log4j2.xml\` |

For a failed deployment on a daemon, look in \`$MULE_HOME/logs/mule_ee.log\`, since status does not appear in a console.

**The failed level change.** The file in \`conf\` is the runtime's default, and it can be overridden at domain or app level. Each app built in Studio has its own \`log4j2.xml\`, so the engineer changed the wrong file for that app. Check the app's \`src/main/resources/log4j2.xml\` and any \`logConfigFile\` entry in \`mule-artifact.json\`. If a change still has no effect, use \`-M-Dlog4j.debug=true\` to see which file was loaded, since another \`log4j2.xml\` on the classpath may have been picked up first. For a registered server, the application's **Logging** tab in Runtime Manager also configures levels.

**Audit logging.** By default all loggers are asynchronous, which substantially improves throughput and latency, but some actions might not be logged if the system crashes. The docs say to use synchronous logging for app logs used as audit trails. You can mix the two, so only the audit category needs a synchronous logger:

\`\`\`xml
<Loggers>
  <Logger name="com.bank.audit" level="INFO" additivity="false">
    <AppenderRef ref="auditFile"/>
  </Logger>
  <AsyncRoot level="INFO">
    <AppenderRef ref="file"/>
  </AsyncRoot>
</Loggers>
\`\`\`
The other categories keep their performance. The category name and appender above are examples. Test the throughput of the approval flow, because the logging thread now waits for each write.

**Agent logs.** Add a \`RollingFile\` appender called \`mule-agent-appender\` to \`$MULE_HOME/conf/log4j2.xml\`, and an \`AsyncLogger\` for \`com.mulesoft.agent\` that references it. The docs' example rolls daily, or sooner at 250 MB. This needs agent 1.5.2 or later.

**Changing levels safely.** Add \`monitorInterval\` to \`<Configuration>\` in \`conf/log4j2.xml\`, during a planned restart, because Mule must restart once to load the setting. After that, Log4j 2 applies changes within the interval. Give the night shift a short runbook: change one package, not the root logger, and put it back afterwards, because verbose logging costs disk and latency.
`,
  followUps: [
    { q: 'How do you log full SOAP requests and responses?', a: 'Enable DEBUG for org.mule.service.http.impl.service.HttpMessageLogger, since Mule sends SOAP over HTTP. Treat that output as sensitive.' },
    { q: 'What helps when an asynchronous logger fails during a crash?', a: 'Mule registers an LMAX ExceptionHandler by default, which logs failures. You can supply your own class through the AsyncLoggerConfig.ExceptionHandler system property.' },
    { q: 'Which system property tunes asynchronous logging memory?', a: 'AsyncLoggerConfig.RingBufferSize. The docs suggest 20000, and say to tune it to your needs.' },
  ],
}
