// The guided lab logs-forwarding. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { defaultObservability, fill, log4jTemplate, loggingOf, newAlert, runSearch, testAlert, viewHec } from '../platform-observability.js'
import { NAME } from './logs-forwarding.pkg.js'

const TOKEN = 'hbr-hec-41d7-orders'
const ALERT = 'Order errors'
// the file that worked: the right token, written into the file, and the CloudHub appender
const OLD = log4jTemplate({ token: TOKEN })
// the release of Tuesday: copied from the test project, with the token of the test Splunk and no CloudHub appender
const NEW = log4jTemplate({ token: 'hbr-hec-0c93-ordtest', cloudhub: false })
const FIXED = log4jTemplate()

const a = (s) => app(s, NAME)
const tokenOk = (s) => {
  const x = a(s)
  return x?.status === 'Running' && x.secrets?.['splunk.hec.token'] === TOKEN && !(x.props ?? {})['splunk.hec.token'] && /\$\{sys:splunk\.hec\.token\}/.test(x.log4j ?? '') && !/hbr-hec-/.test(x.log4j ?? '') && loggingOf(x).appenders.some((y) => y.type === 'Http')
}
const cloudhubOk = (s) => Boolean(a(s)?.disableChLogs) && loggingOf(a(s)).cloudhub
const alertOf = (s) => s.observability?.splunk?.alerts?.find((x) => x.name === ALERT)

function observability(now) {
  const o = fill(defaultObservability(now))
  o.splunk.tokens = [
    { name: 'mule-orders', value: TOKEN, enabled: true, indexes: ['mule'], index: 'mule', sourcetype: 'mule:app' },
    { name: 'mule-apps', value: 'hbr-hec-5d20-apps', enabled: true, indexes: ['mule'], index: 'mule', sourcetype: 'mule:app' },
  ]
  o.splunk.alerts = [newAlert({ name: ALERT, search: `index=mule app=${NAME} level=ERROR`, every: 5, window: 5, threshold: 0, to: OPS })]
  return o
}

const lab = {
  id: 'p-logs-forwarding',
  group: 'Observability',
  title: 'The Splunk alert that went quiet',
  minutes: 25,
  scenario: `${NAME} books the orders of the web shop and forwards its logs to Splunk over the HTTP Event Collector. The ops team has a Splunk alert, ${ALERT}, that mails them when an order fails. It is Thursday 09:00. The alert has been silent since Tuesday afternoon, yet customers write that their orders fail. On Tuesday at 15:00 the team released a new log4j2.xml for the app. Find out where the logs went and bring them back, in Splunk and in Runtime Manager.`,
  start() {
    let s = newPlatform({
      clock: at(0, 9),
      apps: [newApp(NAME, { log4j: OLD, disableChLogs: true })],
      traffic: [
        { app: NAME, env: 'Sandbox', perMinute: 3, method: 'POST', path: '/orders', body: '{"basket":"B-1001","payment":"card"}' },
        { app: NAME, env: 'Sandbox', perMinute: 1, every: 4, method: 'POST', path: '/orders', body: '{"basket":"B-2002","payment":"PAY-TIMEOUT"}' },
      ],
      observability: observability(at(0, 9)),
    })
    s = until(s, at(1, 15))
    s = change(s, NAME, { log4j: NEW, disableChLogs: true })
    s = until(s, at(3, 8, 50))
    s.mail = [
      ...s.mail.slice(-10),
      { t: at(3, 8, 50), to: OPS, subject: 'Customers say their orders fail', body: `Support has 23 tickets since Tuesday evening: the shop says "Payment check failed". Our Splunk alert ${ALERT} has not mailed us once since Tuesday 15:00, and Runtime Manager shows no logs for ${NAME} either. Please find out why. Brightmart support`, source: 'Brightmart support' },
    ]
    return until(s, at(3, 9))
  },
  steps: [
    {
      title: 'Search Splunk for the order errors',
      how: `Splunk from the console menu, Search. Search index=mule app=${NAME} level=ERROR with the time picker on Last 7 days. The newest event is from Tuesday 15:00. Since then nothing came in.`,
      done: (s) => Boolean(s.seen['splunk:search']),
    },
    {
      title: 'Ask Splunk what it refused',
      how: 'Settings: HTTP Event Collector (Settings, Data inputs, HTTP Event Collector in Splunk): note the token of mule-orders. Then search index=_internal sourcetype=splunkd HttpInputDataHandler over Last 60 minutes. splunkd refuses a request each minute with parsing_err="Invalid token", reply=4: HEC answered 403 {"text":"Invalid token","code":4}.',
      done: (s) => Boolean(s.seen['splunk:hec'] && s.seen['splunk:internal']),
    },
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. The log is empty after the release. Then open Splunk, In the Mule app, and read the log4j2.xml of ${NAME}: the token in the Authorization header is not the one HEC knows, and the CLOUDHUB appender is gone.` },
    ask(
      'Why the team saw nothing at all',
      'The HEC refused every event for two days. Why did the app show no error, and why did Runtime Manager show no logs either?',
      [
        'Splunk deleted the events after the 403',
        'The Splunk appender sits behind an Async appender, so a failed send is dropped without a trace in the flow. With Disable CloudHub logs ticked, Runtime Manager only gets what the CLOUDHUB appender sends, and the new file has none',
        'Runtime Manager keeps logs for one day only',
        'The app stopped logging when Splunk refused the first event',
      ],
      1,
      'Log4j appenders ignore their exceptions by default, and an async appender runs on its own thread, so a refused send never reaches the flow. That is right for the flow, which must not fail because of logging, but it means a broken forwarder is silent. With Disable CloudHub logs ticked, Runtime Manager only sees the logs the Log4J2CloudhubLogAppender sends. Keeping both appenders gives a second place to look when one breaks, and a Splunk search on index=_internal shows what HEC refused.',
    ),
    {
      title: 'Move the token into a protected property',
      how: `Runtime Manager, ${NAME}, Settings, Properties: add splunk.hec.token with the value of the mule-orders token, as a protected property. In Splunk, In the Mule app, write Splunk \${sys:splunk.hec.token} in the Authorization property of the Http appender, so no token is left in the file. Apply Changes in Runtime Manager, or Redeploy in the In the Mule app tab.`,
      done: tokenOk,
    },
    {
      title: 'Keep the CloudHub logs',
      how: 'In the In the Mule app tab, keep Disable CloudHub logs ticked, so the file in the app is used. Add the Log4J2CloudhubLogAppender named CLOUDHUB (Insert template has it) and an AppenderRef to CLOUDHUB in the root logger. Redeploy.',
      done: (s) => tokenOk(s) && cloudhubOk(s),
    },
    {
      title: 'See the events arrive',
      how: `Move the clock 10 minutes. In Splunk, Search, run index=mule app=${NAME} over Last 15 minutes. New events arrive with level, message and correlationId. Runtime Manager shows the logs again.`,
      done: (s) => {
        const l = s.observability?.splunk?.lastSearch
        return tokenOk(s) && cloudhubOk(s) && Boolean(l && l.t > a(s).updated && l.newest > a(s).updated && l.apps.includes(NAME))
      },
    },
    {
      title: 'Test the alert search',
      how: `Splunk, Alerts. Run the alert ${ALERT}. Its search over the last 5 minutes finds the failed orders again, so the next scheduled run mails ops.`,
      done: (s) => {
        const t = alertOf(s)?.tested
        return tokenOk(s) && Boolean(t && t.t > a(s).updated && t.n > 0)
      },
    },
    ask(
      'Why the token is a secret',
      'Why keep the HEC token in a protected property and not in log4j2.xml?',
      [
        'log4j2.xml cannot hold a header',
        'A protected property is faster to read',
        'The file is in the source repository and inside the jar, so anyone who reads them can send fake events into the index. A protected property is hidden in Runtime Manager, can differ per environment, and changes without a new build. Here the test token went to production with the file',
        'Splunk refuses tokens that are written in a file',
      ],
      2,
      'An HEC token lets anyone write into the indexes it allows. In a file it lives in Git and in every copy of the jar, and the same file goes to each environment, which is how the test token reached production. As a protected property the value is hidden, set per environment, and rotated with a redeploy. log4j2.xml reads it as a system property with ${sys:splunk.hec.token}, because CloudHub passes application properties to the JVM.',
    ),
  ],
  why: 'Log forwarding fails quietly by design: appenders ignore their errors and an async appender drops what it cannot send, so the flow never notices. Watch the forwarder itself: HEC refusals land in index=_internal, and an alert that stays silent is a signal too. With Disable CloudHub logs ticked, keep the Log4J2CloudhubLogAppender in the file, so Runtime Manager still has the logs when Splunk does not. Keep the HEC token out of the file, in a protected property read with ${sys:...}. In the lab, the Disable CloudHub logs rule of CloudHub 1.0 is applied to the app, HEC takes the index and sourcetype from the query string, and a minute of events goes in one request.',
  docs: 'https://docs.mulesoft.com/cloudhub/custom-log-appender',
  solve(start) {
    let s = runSearch(start, `index=mule app=${NAME} level=ERROR`, '7d')
    s = viewHec(s)
    s = runSearch(s, 'index=_internal sourcetype=splunkd HttpInputDataHandler', '60m')
    s = mark(s, `logs:${NAME}`)
    s = change(s, NAME, { log4j: FIXED, disableChLogs: true, secrets: { ...a(s).secrets, 'splunk.hec.token': TOKEN } })
    s = advance(s, 10 * MINUTE)
    s = runSearch(s, `index=mule app=${NAME}`, '15m')
    return testAlert(s, ALERT)
  },
  answers: { 3: 1, 8: 2 },
}

export const LABS = [lab]
