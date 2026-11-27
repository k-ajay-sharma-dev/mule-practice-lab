// The guided lab splunk-setup. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, call, change } from '../platform-kit.js'
import { addAlert, addIndex, addToken, batchedHttp, defaultObservability, fill, hecAnswer, log4jTemplate, loggingOf, resolve, runSearch, setHecGlobal, testAlert } from '../platform-observability.js'
import { NAME } from './splunk-setup.pkg.js'

const INDEX = 'mule'
const a = (s) => app(s, NAME)
const sp = (s) => s.observability?.splunk
const tokenFor = (s) => (sp(s)?.tokens ?? []).find((t) => t.enabled && t.indexes.includes(INDEX) && t.index === INDEX)
const secretOk = (s) => {
  const t = tokenFor(s)
  return Boolean(t && a(s)?.secrets?.['splunk.hec.token'] === t.value && !(a(s)?.props ?? {})['splunk.hec.token'])
}
const http = (s) => loggingOf(a(s)).appenders.find((x) => x.type === 'Http')
const fileOk = (s) => {
  const x = a(s)
  const use = loggingOf(x)
  const h = http(s)
  if (!x || x.status !== 'Running' || !use.custom || !use.cloudhub || !h || !batchedHttp(use.cfg)) return false
  if (!/\$\{sys:splunk\.hec\.token\}/.test(h.auth ?? '')) return false
  return hecAnswer(sp(s), { url: h.url, auth: resolve(h.auth, { ...x.props, ...x.secrets }) }).index === INDEX
}
const since = (s) => a(s)?.updated ?? Infinity
const calls = (s, status) => (s.lastCalls ?? []).some((c) => c.app === NAME && c.status === status && c.t > since(s))
const alertOf = (s) => (sp(s)?.alerts ?? []).find((x) => x.enabled && /level\s*=\s*ERROR/i.test(x.search) && (x.search.includes(`app=${NAME}`) || x.search.includes(`index=${INDEX}`)))

const lab = {
  id: 'p-splunk-setup',
  group: 'Observability',
  title: 'Set up log forwarding to Splunk',
  minutes: 30,
  scenario: `Brightmart has a new Splunk server, ${'splunk.brightmart.lab'}, with nothing on it but the main index. HTTP Event Collector is off. ${NAME} registers the returns of the shops and logs only to CloudHub. Set up the whole path: an index and an HEC token for the Mule apps, the token as a protected property, a log4j2.xml that sends to HEC without slowing the flows and keeps the CloudHub logs, then prove it with a search by correlation ID and an alert on errors.`,
  start() {
    const o = fill(defaultObservability(at(1, 9)))
    o.splunk.indexes = [{ name: 'main', enabled: true }]
    o.splunk.tokens = []
    o.splunk.allTokens = false
    return newPlatform({ clock: at(1, 9), apps: [newApp(NAME)], observability: o })
  },
  steps: [
    {
      title: `Create the index ${INDEX}`,
      how: `Splunk from the console menu, Settings: Indexes. Type ${INDEX} in Index Name and click New Index.`,
      done: (s) => Boolean(sp(s)?.indexes.some((x) => x.name === INDEX && x.enabled)),
    },
    {
      title: 'Turn on HTTP Event Collector',
      how: 'Settings: HTTP Event Collector (Settings, Data inputs, HTTP Event Collector in Splunk), Global Settings: set All Tokens to Enabled. HEC listens on port 8088.',
      done: (s) => Boolean(sp(s)?.allTokens),
    },
    {
      title: `Create a token bound to ${INDEX}`,
      how: `On the HTTP Event Collector page, New Token: name mule-returns, allowed index ${INDEX}, default index ${INDEX}, source type mule:app. Create. Copy the Token Value.`,
      done: (s) => Boolean(tokenFor(s)),
    },
    {
      title: 'Store the token as a protected property',
      how: `Runtime Manager, ${NAME}, Settings, Properties: add splunk.hec.token with the token value and press Protect on it. Apply Changes.`,
      done: secretOk,
    },
    {
      title: 'Add the Splunk appender and keep CloudHub',
      how: `Splunk, In the Mule app, ${NAME}. Insert template gives an Http appender to https://splunk.brightmart.lab:8088/services/collector/raw?index=${INDEX}, an Authorization of Splunk \${sys:splunk.hec.token}, an Async wrapper with bufferSize, and the CLOUDHUB appender, both in the root logger. Tick Disable CloudHub logs, so CloudHub uses this file. Redeploy.`,
      done: (s) => secretOk(s) && fileOk(s),
    },
    {
      title: 'Send traffic, one return that fails',
      how: `API client: POST ${'/returns'} to ${NAME} with {"order":"O-7001","reason":"too small"}, then one with the reason DAMAGED-LABEL, which fails with 500. Note the X-Correlation-ID of a response. Move the clock 1 minute so the appender sends.`,
      done: (s) => fileOk(s) && calls(s, 201) && calls(s, 500),
    },
    {
      title: 'Find one request by its correlation ID',
      how: `Splunk, Search: index=${INDEX} correlationId=<the ID you noted> over Last 15 minutes. The events of that request show with level, message and app.`,
      done: (s) => {
        const l = sp(s)?.lastSearch
        return fileOk(s) && Boolean(l && /correlationId\s*=\s*\S+/.test(l.q) && l.n > 0 && l.t > since(s) && l.apps.includes(NAME))
      },
    },
    {
      title: 'Save an alert on errors',
      how: `Splunk, Alerts, New Alert: title Returns errors, search index=${INDEX} app=${NAME} level=ERROR, run every 5 minutes over the last 5 minutes, trigger when the number of results is greater than 0, send to ops@brightmart.example. Save.`,
      done: (s) => Boolean(alertOf(s)),
    },
    {
      title: 'Test the alert',
      how: 'Alerts, Run on your new alert. It finds the failed return of the last minutes.',
      done: (s) => {
        const t = alertOf(s)?.tested
        return Boolean(t && t.n > 0 && t.t > since(s))
      },
    },
    ask(
      'Why async and a buffer',
      'Why does the Splunk appender sit behind an Async wrapper with a buffer, and not straight in the root logger?',
      [
        'Splunk only accepts events from an async appender',
        'The Http appender makes one HTTPS call to HEC for each event. Called from the flow, every log line waits on that call, and an HEC that cannot be reached holds the flow until the connect times out. Behind Async the flow puts the event in a queue and goes on; the cost is that events can be dropped when the queue is full or HEC refuses them',
        'Async makes the events arrive in order',
        'The buffer compresses the events',
      ],
      1,
      'Logging must not decide how fast or how reliably a flow runs. A synchronous network appender adds a round trip to each log line and can hang a flow when the log server is away. An Async wrapper, or an AsyncRoot, moves the send to another thread with a bounded queue. Keep the CloudHub appender too, so there is a second place to look when the forwarder fails quietly.',
    ),
  ],
  why: 'Log forwarding is a chain: an index, an HEC token allowed to write only to it, the token kept out of the code as a protected property, and an appender that never blocks the flow. Keep the CloudHub appender beside it, then prove the chain end to end with a search on a correlation ID and an alert on errors. In the lab, the Disable CloudHub logs rule of CloudHub 1.0 is applied, HEC reads index and sourcetype from the query string, an Async wrapper with bufferSize counts as batching, and a minute of events goes in one request.',
  docs: 'https://docs.mulesoft.com/cloudhub/custom-log-appender',
  solve(start) {
    let s = addIndex(start, INDEX).state
    s = setHecGlobal(s, { allTokens: true })
    s = addToken(s, { name: 'mule-returns', index: INDEX, indexes: [INDEX], sourcetype: 'mule:app' }).state
    const token = tokenFor(s).value
    s = change(s, NAME, { log4j: log4jTemplate({ index: INDEX }), disableChLogs: true, secrets: { ...a(s).secrets, 'splunk.hec.token': token } })
    const ok = call(s, NAME, null, '/returns', 'POST', '{"order":"O-7001","reason":"too small"}')
    s = call(ok.state, NAME, null, '/returns', 'POST', '{"order":"O-7002","reason":"DAMAGED-LABEL"}').state
    s = advance(s, MINUTE)
    s = runSearch(s, `index=${INDEX} correlationId=${ok.response.cid}`, '15m')
    s = addAlert(s, { name: 'Returns errors', search: `index=${INDEX} app=${NAME} level=ERROR`, every: 5, window: 5, threshold: 0, to: 'ops@brightmart.example' }).state
    return testAlert(s, 'Returns errors')
  },
  answers: { 9: 1 },
}

export const LABS = [lab]
