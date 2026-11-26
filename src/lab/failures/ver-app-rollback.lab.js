// The guided lab ver-app-rollback. See platform-labs.js for the shape of a lab.
import { addMonAlert, apiById, at, mark } from '../platform.js'
import { app, ask, call, change, CLIENTS, OPS, until } from '../platform-kit.js'
import { jarOf, LED, ledProject, patchApp } from '../platform-project.js'
import { PKG } from './ver-app-rollback.pkg.js'

const [MOBILE_APP, PARTNER_PORTAL] = CLIENTS
const { mobile, partner, process: proc, orders } = LED
const JAR = {
  v140: 'orders-sapi-1.4.0-mule-application.jar',
  v141: 'orders-sapi-1.4.1-mule-application.jar',
  v142: 'orders-sapi-1.4.2-mule-application.jar',
}
const RELEASED = at(1, 8, 30)
// mobile asks for an order with one line, partners for an order with three lines
const TRAFFIC = [
  { app: mobile.app, env: 'Sandbox', client: MOBILE_APP.name, path: '/my-orders/O-1001', perMinute: 1 },
  { app: partner.app, env: 'Sandbox', client: PARTNER_PORTAL.name, path: '/partner-orders/O-1002', perMinute: 1 },
]

const getMobile = (s) => call(s, mobile.app, MOBILE_APP, '/my-orders/O-1001').state
const getPartner = (s) => call(s, partner.app, PARTNER_PORTAL, '/partner-orders/O-1002').state
const ordersApp = (s) => app(s, orders.app)
const running = (s, name) => app(s, name)?.status === 'Running'
const partnerCall = (s, ok, since) => (s.lastCalls ?? []).some((c) => c.app === partner.app && c.env === 'Sandbox' && /O-1002$/.test(c.path) && (ok ? c.status === 200 : c.status >= 500) && c.t > since)
const mobileOk = (s, since) => (s.lastCalls ?? []).some((c) => c.app === mobile.app && c.env === 'Sandbox' && c.status === 200 && c.t > since)
// Config 2 is release 1.4.1. A rollback is a later configuration that ran 1.4.0, read from the deploy history.
const rolledBack = (s) => {
  const a = ordersApp(s)
  return running(s, orders.app) && (a.history ?? []).some((h) => h.config >= 3 && h.jar === JAR.v140)
}
const fixed = (s) => running(s, orders.app) && ordersApp(s).pkg === PKG.orders142 && ordersApp(s).jar === JAR.v142
// the callers of the Orders System API and their callers kept their first configuration, and the instance kept its contract
const untouched = (s) => {
  const api = apiById(s, orders.id)
  return [mobile.app, partner.app, proc.app].every((n) => app(s, n)?.config === 1) && api.version === '1.0.0' && api.apiVersion === 'v1' && api.contracts.some((c) => c.client === proc.client.name && c.status === 'approved')
}

const lab = {
  id: 'p-ver-app-rollback',
  group: 'Versioning without breaking consumers',
  title: 'Application version is not API version',
  minutes: 25,
  scenario:
    'This morning at 08:30 the Orders team deployed release 1.4.1 of orders-sapi. It has a faster query for the order lines and no change to the RAML. Since then partners get errors for some orders, and the mobile app is fine. Find the release, roll it back without touching any consumer, and then deploy the fixed release 1.4.2. Watch what stays the same the whole time: the API instance, its contracts, the URL and the client IDs.',
  start() {
    let s = ledProject({ clock: at(1, 8), traffic: TRAFFIC })
    s.jars = s.jars.map((j) => (typeof j !== 'string' && j.pkg === orders.app ? { ...j, jar: JAR.v140 } : j))
    s.jars.push({ pkg: PKG.orders141, autodiscovery: jarOf('orders').autodiscovery, jar: JAR.v141 }, { pkg: PKG.orders142, autodiscovery: jarOf('orders').autodiscovery, jar: JAR.v142 })
    patchApp(s, 'orders', { jar: JAR.v140 })
    s = addMonAlert(s, { title: 'Errors in the partner API', resource: 'Application', name_: partner.app, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, recipients: OPS, minutes: 1 })
    s = until(s, RELEASED)
    s = change(s, orders.app, { pkg: PKG.orders141, jar: JAR.v141 })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'Read the alert',
      how: 'Open the Inbox from the menu. Anypoint Monitoring sent a mail: partner-orders-eapi has errors.',
      done: (s) => Boolean(s.seen.inbox),
    },
    {
      title: 'Reproduce the error',
      how: 'API client, partner-orders-eapi as Partner Portal, GET /partner-orders/O-1002. It answers 502. Then GET /partner-orders/O-1001: 200. Only some orders fail.',
      done: (s) => partnerCall(s, false, 0),
    },
    {
      title: 'Find the release',
      how: `Open Visualizer: the red line ends at ${orders.app}. Then Runtime Manager, ${orders.app}, Logs. Choose Config 2: it was deployed at 08:30, and its Settings show the file ${JAR.v141}. Read the ERROR block of the order O-1002.`,
      done: (s) => Boolean(s.seen[`logs:${orders.app}`]),
    },
    ask(
      'Application version and API version',
      `${orders.app} went from ${JAR.v140} to ${JAR.v141}. The RAML did not change. Does this release need a new API version?`,
      [
        'Yes, every new jar needs API version v2',
        'Yes, a new minor asset version 1.1.0 in Exchange',
        'No. The jar version is the version of the application, set in its pom.xml. The API version belongs to the contract in Exchange. A fix that keeps the contract changes only the application',
        'No, because Sandbox has no versions',
      ],
      2,
      'The asset in Exchange stays 1.0.0 with API version v1, so the API instance, its policies and its contracts stay. Consumers see the same URL and the same answers.',
    ),
    {
      title: 'See what did not change',
      how: 'API Manager, Orders System API. Asset version 1.0.0, API version v1, the same API Instance ID. Open Contracts: Order Fulfilment API is still approved. The new jar registered with the same instance through api.id.',
      done: (s) => Boolean(s.seen[`api:${orders.id}`]),
    },
    {
      title: 'Roll back to 1.4.0',
      how: `Runtime Manager, ${orders.app}, Settings. Application File ${JAR.v140}. Keep every property as it is. Apply Changes. Do not touch any other application.`,
      done: rolledBack,
    },
    {
      title: 'The partners are whole again',
      how: 'Call GET /partner-orders/O-1002 as Partner Portal once more. It answers 200. Nobody outside the Orders team did anything.',
      done: (s) => rolledBack(s) && partnerCall(s, true, RELEASED),
    },
    ask(
      'What the consumers changed',
      'During the rollback, what did the Process API, the Experience APIs and Partner Portal have to change?',
      ['Their URL to the Orders System API', 'Their client ID and client secret', 'Nothing. The address, the API instance, the contract and the answers stayed the same', 'They had to request access again'],
      2,
      'The consumers depend on the contract and the address, not on the jar. Runtime Manager replaced the jar behind the same application name, so the address did not move.',
    ),
    {
      title: 'Deploy the fix 1.4.2',
      how: `Runtime Manager, ${orders.app}, Settings. Application File ${JAR.v142}, Apply Changes. Asset version and API instance stay as they are.`,
      done: fixed,
    },
    ask(
      'When a new API version is due',
      'Which change of orders-sapi would need a new API version?',
      ['A fix of a mapping', 'A faster query', 'A new Mule runtime version', 'Renaming or removing a field that callers read in the answer'],
      3,
      'A change that breaks the contract is a new major version: asset 2.0.0, API version v2, a new instance and a new deployment next to v1. Fixes, speed and runtime upgrades are new application releases only.',
    ),
    {
      title: 'Prove both consumers on 1.4.2',
      how: 'API client: GET /partner-orders/O-1002 as Partner Portal and GET /my-orders/O-1001 as Mobile App. Both answer 200. The Process API and the Experience APIs are still on their first configuration.',
      done: (s) => fixed(s) && rolledBack(s) && untouched(s) && partnerCall(s, true, ordersApp(s).updated) && mobileOk(s, ordersApp(s).updated),
    },
  ],
  why: 'An application release and an API version are two different numbers. The jar version, from the pom.xml, changes with every build. The API version and the asset version in Exchange describe the contract, and they change only when the RAML changes. A fix that keeps the contract needs no new instance, no new contract and no new URL, so a rollback is a deployment matter: on CloudHub 2.0 you change the application file in Settings and Apply Changes, or you choose an earlier configuration in the Config changes history and deploy it. With the Rolling update model the old replicas serve traffic until the new ones are ready. In the lab the rollback picks the earlier file, the rollback is detected by the count of configurations, and the jars are already built.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/ch2-update-apps',
  solve(start) {
    let s = getPartner(start)
    s = mark(mark(mark(s, 'inbox'), `logs:${orders.app}`), `api:${orders.id}`)
    s = change(s, orders.app, { pkg: 'orders-sapi', jar: JAR.v140 })
    s = getPartner(s)
    s = change(s, orders.app, { pkg: PKG.orders142, jar: JAR.v142 })
    return getMobile(getPartner(s))
  },
  answers: { 3: 2, 7: 2, 9: 3 },
}

export const LABS = [lab]
