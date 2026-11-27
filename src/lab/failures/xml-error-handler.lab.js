// The guided lab xml-error-handler. See platform-labs.js for the shape of a lab.
import { advance, at, callApi, deployXml, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, OPS, until } from '../platform-kit.js'
import { outcomeOf, parseMule } from '../platform-xml.js'
import { DRAFT_XML, FIXED_XML, FLOW, NAME, START_XML, UNKNOWN_BODY } from './xml-error-handler.pkg.js'

const ORDER = '{"customerId":"C-100","lines":[{"sku":"FL-20","qty":4}]}'
const api = (s) => app(s, NAME)
const running = (s) => api(s)?.status === 'Running'
const model = (s) => parseMule(api(s)?.xml ?? '')
const changed = (s) => running(s) && api(s).xml !== START_XML && model(s).ok
// what a caller gets now for each kind of failure, read from the deployed configuration
const backendOk = (s) =>
  changed(s) &&
  ['HTTP:SERVICE_UNAVAILABLE', 'HTTP:CONNECTIVITY'].every((t) => {
    const o = outcomeOf(model(s), FLOW, t, { description: 'x' })
    return o.kind === 'propagate' && o.status === 502 && o.body.trim() !== ''
  })
const customerOk = (s) => {
  if (!changed(s)) return false
  const o = outcomeOf(model(s), FLOW, 'APP:NOT_FOUND', { description: 'Customer not found' })
  return o.kind === 'continue' && o.status === 404 && o.body.trim() !== ''
}
const since = (s) => (api(s).store?.outcomes ?? []).filter((x) => x.t > api(s).updated)

const lab = {
  id: 'p-xml-error-handler',
  group: 'Mule XML',
  title: 'An API that says 200 when the order was lost',
  minutes: 25,
  scenario: `${NAME} takes orders from the shop of Brightmart with POST /orders and sends each one to the warehouse system. The warehouse has had a bad week and refuses some calls. The shop shows every order as confirmed, but the warehouse never got some of them, and no error is in the logs. A colleague started a fix of the error handler in the Flow editor and could not deploy it. Find out why the failures are hidden, finish the fix in the Mule XML and prove that callers now see the truth.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      nextId: 10,
      apps: [newApp(NAME, { props: { 'http.port': '8081', 'warehouse.host': 'wms.brightmart.lab' }, xml: START_XML, store: {} })],
      xmlDrafts: { [NAME]: DRAFT_XML },
      traffic: [{ app: NAME, env: 'Sandbox', method: 'POST', path: '/orders', body: ORDER, perMinute: 3 }],
      mail: [
        {
          t: at(1, 8, 40),
          to: OPS,
          subject: 'Confirmed orders that never reached us',
          body: 'Since Monday the shop shows orders as confirmed that the warehouse never received. Today it is about one order in three. The shop got 200 OK for each of them, so it did not retry. Customers call us about missing deliveries. Please find out what the order API does.',
          source: 'Brightmart Warehouse',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of the warehouse', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Open the configuration of ${NAME}`,
      how: `Lab tools, Flow editor, pick ${NAME}. The editor shows the draft of your colleague. The Changes tab compares it with the deployed config. Look at the error handler of ${FLOW} in the deployed version: one on-error-continue with type ANY and logException false.`,
      done: (s) => Boolean(s.seen[`xml:${NAME}`]),
    },
    ask(
      'What the shop sees',
      'The warehouse answers 503 to the request in post-orders-flow. The only handler is on-error-continue type="ANY" with no steps. What does the shop get back?',
      [
        'A 503 with the error of the warehouse',
        'A 500 with the error description, because the flow failed',
        'A 200. on-error-continue ends the flow as a success, so the listener sends its normal response, with whatever payload the flow had at that moment as the body',
        'No answer at all, the request times out',
      ],
      2,
      'on-error-continue handles the error and the flow ends as if it worked. The HTTP listener sends the http:response, here 200 because vars.httpStatus is not set, and the body is whatever the payload was. A failed http:request does not set the payload, so in Mule the shop gets its own order back. The lab answers with an empty body. With logException false nothing is written to the log. The shop has no way to know that the order was lost.',
    ),
    {
      title: 'Deploy the draft as your colleague left it',
      how: 'In the Flow editor, read the Problems view under the source, then press Deploy with the draft unchanged. Read what the deploy log says. The deploy fails and config 1 keeps serving, as a rolling update that fails does.',
      done: (s) => Boolean(api(s)?.xmlFailed),
    },
    ask(
      'Why Mule refuses the order of the handlers',
      'The draft has an on-error-propagate with no type and no when, and after it an on-error-continue for APP:NOT_FOUND. Why does the runtime refuse it?',
      [
        'An error handler can only have one handler',
        'on-error-continue must always come first',
        'A handler without type and when catches every error, so a handler after it could never run. Mule allows such a catch all only as the last handler',
        'APP:NOT_FOUND is not a valid error type',
      ],
      2,
      'Mule tries the handlers from the top and runs the first that matches. A handler with no type and no when matches everything, so the runtime insists it is the last one. A handler with type ANY above another one is accepted, but the one below it can never run, and the Problems view of the lab warns about it. Put the specific cases first and the catch all last.',
    ),
    {
      title: 'Show backend failures to the caller as 502',
      how: `Fix the draft so that a failure of the warehouse (HTTP:SERVICE_UNAVAILABLE, HTTP:CONNECTIVITY) reaches an on-error-propagate that sets vars.httpStatus to 502 and a JSON body. The http:error-response of the listener reads #[vars.httpStatus default 500] and sends #[payload]. Deploy.`,
      done: backendOk,
    },
    {
      title: 'Keep the unknown customer as a 404',
      how: 'An unknown customer is a known business case, not a failure of the API. Keep on-error-continue type="APP:NOT_FOUND" with httpStatus 404 and a body, above the catch all. The http:response of the listener reads #[vars.httpStatus default 200].',
      done: customerOk,
    },
    ask(
      'Propagate or continue with a 502',
      'A colleague says an on-error-continue that sets httpStatus 502 gives the same answer, so why use on-error-propagate for the warehouse errors?',
      [
        'There is no difference at all',
        'on-error-continue cannot set a status code',
        'With propagate the flow ends as failed: a transaction rolls back, a calling flow gets the error, and monitoring counts the failure. With continue the failure is recorded as a success',
        'on-error-propagate retries the request',
      ],
      2,
      'on-error-propagate runs its steps and then raises the error again. The listener sends the http:error-response, a transaction in the flow rolls back, a parent flow that used flow-ref gets the error, and dashboards and alerts count it. on-error-continue commits and reports success. Use continue only for a case the API handles as part of its contract.',
    ),
    {
      title: 'Prove it with real calls',
      how: `API client, POST ${NAME} /orders with the body ${UNKNOWN_BODY}. You get 404 with a message. Then move the clock 5 minutes after your deploy. The shop traffic now gets 502 with a body for each failure of the warehouse, and no failure answers 200.`,
      done: (s) => {
        if (!backendOk(s) || !customerOk(s) || s.clock < api(s).updated + 5 * MINUTE) return false
        const list = since(s)
        const call = (s.lastCalls ?? []).some((c) => c.app === NAME && c.status === 404 && c.method === 'POST' && c.t > api(s).updated)
        return call && list.some((x) => x.result === 'reported' && x.status === 502) && !list.some((x) => x.result === 'hidden' || x.result === 'hiddenNotFound')
      },
    },
  ],
  why: 'on-error-continue handles an error and ends the flow as a success. Behind an HTTP listener that means the normal response, often 200 with whatever payload the flow had when it failed, and with logException false not even a log line. Use on-error-propagate for failures the caller must know about, such as a backend that is down, and map them to a status like 502 with a body that says the order was not saved. Keep on-error-continue for business cases the API answers on purpose, such as a customer that does not exist, mapped to 404. Order matters: Mule runs the first handler that matches, and a handler without type and when must be the last one, so specific types go first and the catch all last. In the lab the Flow editor checks the XML the way the runtime does at deploy time, and a failed deploy keeps the old config running.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/on-error-scope-concept',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `xml:${NAME}`)
    s = deployXml(s, NAME, DRAFT_XML).state
    s = mark(s, `xml-deploy:${NAME}`)
    s = deployXml(s, NAME, FIXED_XML).state
    s = callApi(s, { env: 'Sandbox', app: NAME, method: 'POST', path: '/orders', body: UNKNOWN_BODY }).state
    return advance(s, 6 * MINUTE)
  },
  answers: { 2: 2, 4: 2, 7: 2 },
}

export const LABS = [lab]
