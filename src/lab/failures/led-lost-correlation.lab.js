// The guided lab led-lost-correlation. See platform-labs.js for the shape of a lab.
import { at, callApi, mark, queryLogs } from '../platform.js'
import { app, ask, change, CLIENTS, until } from '../platform-kit.js'
import { jarOf, LED, ledProject } from '../platform-project.js'
import { BAD_ORDER, BROKEN_PAPI, FIXED_PAPI, ORDERS_ROW } from './led-lost-correlation.pkg.js'

const PARTNER_PORTAL = CLIENTS[1]
const { partner, process: proc, orders } = LED
const PARTNER_CID = 'pp-1077-0852'
const CHECK = 'hf-check-1077'
const JAR_110 = `${proc.app}-1.1.0-mule-application.jar`
const JAR_111 = `${proc.app}-1.1.1-mule-application.jar`

const ask_ = (n, cid) => callApi(n, { env: 'Sandbox', app: partner.app, method: 'GET', path: `/partner-orders/${BAD_ORDER}`, cid, client: PARTNER_PORTAL.name, clientId: PARTNER_PORTAL.clientId, clientSecret: PARTNER_PORTAL.clientSecret }).state
const searched = (s, test) => Object.keys(s.seen).some((k) => k.startsWith('logsearch:') && test(k.slice(10)))
// the Process API runs a release that sends the correlation ID again: 1.1.1, or a rollback to 1.0.0
const fixed = (s) => [FIXED_PAPI, proc.app].includes(app(s, proc.app)?.pkg) && app(s, proc.app).status === 'Running'
const checkCall = (s) => (s.lastCalls ?? []).some((c) => c.app === partner.app && c.cid === CHECK && c.t >= app(s, proc.app).updated)
const appsWith = (s, cid) => new Set(queryLogs(s, cid, 'Sandbox').map((l) => l.app))

const XML = `<!-- order-fulfilment-papi 1.1.0, the change of last week -->
<http:request-config name="System_APIs_Config" sendCorrelationId="NEVER">
  <http:request-connection host="..." port="443" protocol="HTTPS" />
</http:request-config>

<!-- 1.1.1: the attribute is gone, so the default AUTO applies again -->
<http:request-config name="System_APIs_Config">
  <http:request-connection host="..." port="443" protocol="HTTPS" />
</http:request-config>`

const lab = {
  id: 'p-fail-led-lost-correlation',
  group: 'API-led failures',
  title: 'The trace stops at the Process API',
  minutes: 15,
  scenario: `A partner reports that GET /partner-orders/${BAD_ORDER} failed with 502 at 08:52. The answer carried X-Correlation-ID ${PARTNER_CID}, and the partner put it in the ticket. Last week release 1.1.0 of ${proc.app} went live with new settings on the HTTP request config of the System APIs.`,
  start() {
    const s = ledProject()
    const p = s.apps.find((a) => a.name === proc.app && a.env === 'Sandbox')
    Object.assign(p, { pkg: BROKEN_PAPI, jar: JAR_110 })
    s.apps.find((a) => a.name === orders.app && a.env === 'Sandbox').pkg = ORDERS_ROW
    s.jars = s.jars.map((j) => (j?.pkg === orders.app ? { ...j, pkg: ORDERS_ROW } : j))
    s.jars.push({ pkg: BROKEN_PAPI, autodiscovery: jarOf('process').autodiscovery, jar: JAR_110 }, { pkg: FIXED_PAPI, autodiscovery: jarOf('process').autodiscovery, jar: JAR_111 })
    return until(ask_(until(s, at(1, 8, 52)), PARTNER_CID), at(1, 9))
  },
  steps: [
    { title: "Search the partner's ID", how: `Monitoring, Log Search. Search for ${PARTNER_CID}.`, done: (s) => searched(s, (q) => q.includes(PARTNER_CID)) },
    ask(
      'Where the trail ends',
      'Which applications wrote a line with this ID?',
      ['All three layers', `${partner.app} and ${proc.app}`, `Only ${orders.app}`, `Only ${partner.app}`],
      1,
      `The Process API wrote "Called ... ${orders.app} ... INTERNAL_SERVER_ERROR", so the call went down one more layer. Yet no line of ${orders.app} carries the ID.`,
    ),
    { title: 'Find the System error by time', how: `Log Search for appId: ${orders.app} AND log-level: ERROR. Take the block at 08:52, the minute of the partner call.`, done: (s) => searched(s, (q) => /orders-sapi|ora-01722/i.test(q)) },
    ask(
      'Read the System error',
      `What does the error block of ${orders.app} say?`,
      ['DB:CONNECTIVITY, Oracle is down', 'HTTP:UNAUTHORIZED, the contract is gone', `DB:QUERY_EXECUTION, ORA-01722 invalid number for ${BAD_ORDER}`, 'HTTP:TIMEOUT from Oracle'],
      2,
      `Oracle answered. The row of ${BAD_ORDER} holds a value the query cannot convert. That is a data fix for the Orders team. Other orders work, so nobody noticed.`,
    ),
    ask(
      'Why the ID changed',
      `The line of ${orders.app} starts with event: and another ID than ${PARTNER_CID}. Why?`,
      ['Each Mule application always makes its own ID', `The Process API called ${orders.app} without X-Correlation-ID, so its listener had none and Mule generated a new one`, 'Log Search shortens IDs of System APIs', `${orders.app} runs in another region`],
      1,
      'Mule takes the correlation ID from the source message, for HTTP the X-Correlation-ID header. Only when the source has none does the correlation ID generator make a new one.',
    ),
    ask(
      'Choose the fix',
      `Release 1.1.0 put sendCorrelationId="NEVER" on the request config of the System APIs. What do you change?`,
      ['Remove the attribute or set it to AUTO, the default, so the requester sends the ID again', `Set log-level DEBUG on ${orders.app}`, 'Add a correlationIdGeneratorExpression to each System API', 'Search by time from now on'],
      0,
      'AUTO is the default of the request config and sends the ID of the event. ALWAYS also works. A new generator would only make new IDs in another format, and searching by time does not scale.',
    ),
    {
      title: 'Deploy the fixed release',
      how: `Runtime Manager, ${proc.app}, Settings. Application File ${JAR_111}, Apply Changes. The team rebuilt the release with the change below and kept the new timeouts.`,
      code: XML,
      done: fixed,
    },
    { title: 'Send the call again with your own ID', how: `API client, ${partner.app} as Partner Portal, GET /partner-orders/${BAD_ORDER}. Set X-Correlation-ID to ${CHECK}. It still answers 502, because the row is still wrong.`, done: (s) => fixed(s) && checkCall(s) },
    ask(
      'Why one ID matters',
      'Why should one correlation ID travel through all the layers?',
      ['It makes the logs smaller', 'Client ID Enforcement needs it', 'One search then shows the path of a call from the Experience API to the System API, so the ID in a support ticket leads straight to the failing line', 'The calls get faster'],
      2,
      'In API-led one request crosses three or more applications, often owned by different teams. With one ID the partner, support and each team look at the same story. Without it you match lines by time, which fails as soon as traffic grows.',
    ),
    { title: 'Prove one ID spans all layers', how: `Log Search for ${CHECK}. Lines of ${partner.app}, ${proc.app} and ${orders.app} all carry it, the ORA-01722 block too.`, done: (s) => fixed(s) && checkCall(s) && searched(s, (q) => q.includes(CHECK)) && [partner.app, proc.app, orders.app].every((a) => appsWith(s, CHECK).has(a)) },
  ],
  why: 'The Mule runtime keeps one correlation ID per event and the HTTP requester sends it on as X-Correlation-ID by default (sendCorrelationId AUTO). A request config with NEVER cuts the trail, and the next layer starts a new ID. In this lab the broken release stands in for that config, and one Log Search box covers all applications of the environment.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/correlation-id',
  solve(start) {
    let s = mark(mark(start, 'logsearch'), `logsearch:${PARTNER_CID}`)
    s = mark(s, `logsearch:appId: ${orders.app} AND log-level: ERROR`)
    s = change(s, proc.app, { pkg: FIXED_PAPI, jar: JAR_111 })
    s = ask_(s, CHECK)
    return mark(s, `logsearch:${CHECK}`)
  },
  answers: { 1: 1, 3: 2, 4: 1, 5: 0, 8: 2 },
}

export const LABS = [lab]
