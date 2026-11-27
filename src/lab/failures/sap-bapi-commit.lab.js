// The guided lab sap-bapi-commit. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { FUNCTION_MODULES, lockMaterial, newSapSystem, RFC_USER, SAP_HOST, testFunction } from '../platform-sap.js'
import { BAPI_APP, checksReturn, CREATE, txModeOf } from './sap-bapi-commit.pkg.js'

const props = (s) => ({ ...app(s, BAPI_APP)?.props, ...app(s, BAPI_APP)?.secrets })
const running = (s) => app(s, BAPI_APP)?.status === 'Running'
const scoped = (s) => running(s) && txModeOf(props(s)) === 'scope'
const checked = (s) => running(s) && checksReturn(props(s))
const defaults = () => {
  const fm = FUNCTION_MODULES[CREATE]
  const { RETURN, ...tables } = fm.tables // eslint-disable-line no-unused-vars
  return { ...structuredClone(fm.imports), ...structuredClone(tables) }
}

function sapSystem(now) {
  const y = newSapSystem(now)
  y.idocs = []
  y.trfc = []
  // the material team holds H-2000 open in MM02 for a price change
  lockMaterial(y, 'H-2000', 'MDM_PRICING')
  return y
}

const lab = {
  id: 'p-sap-bapi-commit',
  group: 'Salesforce and SAP',
  title: 'The order number that does not exist',
  minutes: 20,
  scenario: `B2B partners of Brightmart send orders to ${BAPI_APP}. The app calls ${CREATE} and answers 201 with the sales order number from SAP. Partners now call with those numbers and the order desk finds nothing in VA03. On Monday a developer saw that the app never committed, and added a second Execute BAPI with BAPI_TRANSACTION_COMMIT after the create. The RETURN tables still say the order has been saved, and VA03 is still empty.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8, 30),
      apps: [
        newApp(BAPI_APP, {
          props: { 'sap.applicationServerHost': SAP_HOST, 'sap.systemNumber': '00', 'sap.client': '100', 'sap.username': RFC_USER, 'sap.transaction': 'separate', 'bapi.checkReturn': 'false' },
          secrets: { 'sap.password': 'Rfc-Brightmart-2611' },
          store: {},
        }),
      ],
      traffic: [
        { app: BAPI_APP, env: 'Sandbox', method: 'POST', path: '/sales-orders', body: '{"customer":"4712","items":[{"material":"H-1300","qty":2}]}', perMinute: 1, every: 3 },
        { app: BAPI_APP, env: 'Sandbox', method: 'POST', path: '/sales-orders', body: '{"customer":"4713","items":[{"material":"H-2000","qty":1}]}', perMinute: 1, every: 5 },
      ],
      mail: [
        {
          t: at(1, 9, 5),
          to: OPS,
          subject: 'Order numbers from the B2B API not in SAP',
          body: 'Quay Deli sent us order confirmation 12003 from your API and asks for the delivery date. VA03 says the document is not in the database. Pier Cafe has the same problem. We see no B2B order in SAP since Friday. Brightmart order desk',
          source: 'Brightmart order desk',
        },
      ],
      sap: sapSystem(at(1, 8, 30)),
    })
    return until(s, at(1, 9, 30))
  },
  steps: [
    { ...sawLogs(BAPI_APP), how: `Runtime Manager, Applications, ${BAPI_APP}, Logs. Each order logs the RETURN of ${CREATE}: S V1 311 Standard Order has been saved, then an empty RETURN of BAPI_TRANSACTION_COMMIT. Note an order number.` },
    {
      title: 'Look for the order in VA03',
      how: 'SAP from the console menu. Type VA03 in the command field, enter the order number from the log and press Display. The status bar says the SD document is not in the database. SE37 shows the RFC calls of the app under Last RFC calls, each in its own session.',
      done: (s) => Boolean(s.seen['sap:VA03']),
    },
    ask(
      'Saved but not there',
      `RETURN says Standard Order has been saved and gives a number. Why is the order not in SAP?`,
      [
        'The order desk looks in the wrong client',
        `A BAPI never commits by itself. ${CREATE} drew the number and put the order in the update task of its session. Without COMMIT WORK in that session the work is thrown away when the session ends, and the number is lost`,
        'The order was archived at once',
        'VA03 needs a few hours to see new orders',
      ],
      1,
      'BAPIs leave the commit to the caller, so one caller can group several BAPIs into one logical unit of work. The message V1 311 is written before the commit. The number comes from the number range at once, which is why the lost orders leave gaps in the numbers.',
    ),
    ask(
      'The separate commit',
      'Since Monday the app calls BAPI_TRANSACTION_COMMIT right after the create, and it answers with an empty RETURN. Why does it not help?',
      [
        'BAPI_TRANSACTION_COMMIT needs WAIT set to X',
        'The commit runs too fast after the create',
        'Each Execute BAPI outside a transaction takes a connection from the pool and its own SAP session. The commit ran in a new session with no work, so it committed nothing. The create session had already ended without a commit',
        'The RFC user has no authority to commit',
      ],
      2,
      'COMMIT WORK acts on the logical unit of work of its own session. With the connector the BAPI and BAPI_TRANSACTION_COMMIT must run on the same connection: put both in a Transactional scope, or use the transaction operations of the SAP connector, so they share one session. An empty RETURN from the commit only says that the commit itself raised no error.',
    ),
    {
      title: 'Prove it in SE37',
      how: `Command field SE37, pick the function module ${CREATE}. Keep the sample import values (customer 4712, material H-1300) and tick Test sequence: run BAPI_TRANSACTION_COMMIT after it in the same session. Press Execute. Then open the new number in VA03. Without the tick the test session ends without a commit and the order is lost, as in the app.`,
      done: (s) => Boolean(s.seen['sap:SE37']) && Object.values(s.sap?.orders ?? {}).some((o) => o.source === 'SE37'),
    },
    {
      title: 'Put the BAPI and the commit in one session',
      how: `Runtime Manager, ${BAPI_APP}, Settings, Properties. Set sap.transaction to scope: the flow then runs Execute BAPI and BAPI_TRANSACTION_COMMIT inside one Transactional scope on one SAP session. Apply Changes.`,
      done: scoped,
    },
    {
      title: 'Read the RETURN table before the commit',
      how: 'Same app. Set bapi.checkReturn to true and Apply Changes. The flow then looks for a row of TYPE E or A, rolls back with BAPI_TRANSACTION_ROLLBACK and answers 422 with the message, instead of 201 with an empty number.',
      done: checked,
    },
    ask(
      'RETURN types',
      'Which RETURN rows mean the order was not created?',
      [
        'Any row that is not S',
        'Only an exception from the connector means failure; RETURN is for information',
        'TYPE E (error) and A (abort). W (warning) and I (information) leave the order valid, S is success. A BAPI reports business errors in RETURN, not as an exception',
        'TYPE W, because SAP warns before it fails',
      ],
      2,
      'The connector raises SAP:EXECUTION only for technical problems, such as a function that does not exist. Business errors such as a locked material come back in RETURN with TYPE E, and the call itself succeeds. So the flow must read RETURN and decide: E or A rolls back, W can be logged and the order kept.',
    ),
    {
      title: 'Watch the next orders',
      how: 'Move the clock 10 minutes after your last change. New orders of 4712 open in VA03, and the order of 4713 for the locked material H-2000 gets 422 with the message from RETURN.',
      done: (s) => {
        const a = app(s, BAPI_APP)
        if (!a || !scoped(s) || !checked(s) || s.clock < a.updated + 10 * MINUTE) return false
        const made = Object.values(s.sap?.orders ?? {}).some((o) => o.source === BAPI_APP && o.t > a.updated)
        return made && (a.store?.rejected ?? []).some((x) => x.t > a.updated)
      },
    },
  ],
  why: `A BAPI does its work in the update task and leaves COMMIT WORK to the caller, so RETURN can say Standard Order has been saved while nothing is in the database yet. The commit belongs to the session: BAPI_TRANSACTION_COMMIT in another session commits that session, which has no work. With the Mule SAP connector, run ${CREATE} and BAPI_TRANSACTION_COMMIT on one connection inside a Transactional scope, or with the transaction operations of the connector. Read RETURN before you commit: TYPE E or A means the order failed, so roll back and tell the caller. In SE37 a single test ends its session without a commit too; use a test sequence. In the lab the transaction mode and the RETURN check are properties, a session ends with each call that runs outside a transaction, and a material lock is a flag on the material.`,
  docs: 'https://docs.mulesoft.com/sap-connector/latest/',
  solve(start) {
    let s = mark(mark(start, `logs:${BAPI_APP}`), 'sap:VA03')
    s = mark(s, 'sap:SE37')
    s = testFunction(s, CREATE, defaults(), { sequence: true }).state
    s = change(s, BAPI_APP, { props: { ...app(s, BAPI_APP).props, 'sap.transaction': 'scope', 'bapi.checkReturn': 'true' } })
    return advance(s, 11 * MINUTE)
  },
  answers: { 2: 1, 3: 2, 7: 2 },
}

export const LABS = [lab]
