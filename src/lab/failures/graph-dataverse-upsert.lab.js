// The guided lab graph-dataverse-upsert. See platform-labs.js for the shape of a lab.
import { advance, at, callApi, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { addKey, DAY, deleteRows, dupesOf, emptyMsgraph, guidOf, keyOn, newRegistration, newRow, ORG_URL, rowsOf, TENANT_ID } from '../platform-msgraph.js'
import { CUSTOMER_SYNC, CUSTOMERS } from './graph-dataverse-upsert.pkg.js'

const APP_ID = guidOf('reg:brightmart-d365-customer-sync')
const key = (s) => keyOn(s.msgraph, 'account', ['accountnumber'])
const clean = (s) => dupesOf(s.msgraph, 'account', 'accountnumber').length === 0
const active = (s) => key(s)?.status === 'Active' && clean(s)
const running = (s) => app(s, CUSTOMER_SYNC)?.status === 'Running'
const upserting = (s) => running(s) && String(app(s, CUSTOMER_SYNC).props['dynamics.writeMode'] ?? '').trim() === 'upsert'
const patched = (s, since) => (s.msgraph?.log ?? []).some((e) => e.who === CUSTOMER_SYNC && e.api === 'dataverse' && e.m === 'PATCH' && e.st === 204 && e.t >= since)
const allThere = (s) => CUSTOMERS.every(([no]) => rowsOf(s.msgraph, 'account').some((r) => r.accountnumber === no))

function graph(now) {
  const m = emptyMsgraph(now)
  const t0 = now - 90 * DAY
  newRegistration(m, { name: CUSTOMER_SYNC, appId: APP_ID, t: t0, secrets: [{ desc: 'mule-sandbox', start: t0, end: now + 270 * DAY }] })
  m.dv.roles['Brightmart Account Writer'] = { system: false, privs: { account: ['Create', 'Read', 'Write'] } }
  m.dv.users.push({ id: guidOf(`user:${APP_ID}`), appId: APP_ID, name: CUSTOMER_SYNC, roles: ['Brightmart Account Writer'], t: t0 })
  for (const [i, [no, name, city]] of CUSTOMERS.entries()) newRow(m, 'account', { accountnumber: no, name, address1_city: city }, t0 + i * MINUTE, 'Data migration')
  // the last weeks: every change of a customer became a new account
  for (let i = 0; i < 10; i++) {
    const [no, name, city] = CUSTOMERS[(i * 3) % CUSTOMERS.length]
    newRow(m, 'account', { accountnumber: no, name, address1_city: city }, now - (20 - i) * DAY, CUSTOMER_SYNC)
  }
  return m
}

const lab = {
  id: 'p-graph-dataverse-upsert',
  group: 'HR, ITSM and CRM',
  title: 'Every customer change is a new account in Dynamics',
  minutes: 25,
  scenario: `${CUSTOMER_SYNC} sends each customer change of the web shop to Dynamics 365. Sales reps complain that they find Northgate Grocers four times in the account list, each with other details, and their reports count customers twice. The app was built to create accounts and nobody changed it when the shop began to send updates. Make the sync write each customer once, and clean up what is there.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      msgraph: graph(at(1, 8)),
      apps: [newApp(CUSTOMER_SYNC, { props: { 'azure.tenantId': TENANT_ID, 'azure.clientId': APP_ID, 'dataverse.url': ORG_URL, 'dynamics.writeMode': 'create' }, secrets: { 'azure.clientSecret': '' }, store: {} })],
      traffic: [{ app: CUSTOMER_SYNC, env: 'Sandbox', method: 'POST', path: '/customers', body: '{"source":"web"}', perMinute: 1, every: 2 }],
      mail: [
        {
          t: at(1, 8, 50),
          to: OPS,
          subject: 'Duplicate accounts in Dynamics',
          body: 'Hi, the account view in Dynamics has the same customers again and again, all with the same account number. Account number is our customer number from the web shop and must be unique. Can the sync update the account instead of adding one? Brightmart sales operations',
          source: 'Brightmart sales operations',
        },
      ],
    })
    s.apps[0].secrets['azure.clientSecret'] = s.msgraph.apps[0].secrets[0].value
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'See the duplicates',
      how: 'Dynamics and SharePoint from the console menu, Dataverse tab, table Account, Rows. Pick Account Number under Show duplicates of: each customer has several rows with the same number, created by the app.',
      done: (s) => Boolean(s.seen['msgraph:table:account']),
    },
    ask(
      'Why the rows repeat',
      `Why does each change of a customer add an account?`,
      [
        'Dataverse copies a row when it is updated, to keep history',
        'The app sends POST /accounts. A POST always creates a row, and Dataverse has nothing that says account number must be unique, so it accepts the same number again',
        'Duplicate detection rules are off for the app user',
        'The web shop sends each change twice',
      ],
      1,
      'A POST to an entity set is a create. The primary key of a Dataverse row is a GUID that Dataverse makes, so the account number of the shop is only a column. To find a row by a business key, define an alternate key on that column; then the Web API can address the row by it and refuses a second row with the same value. Duplicate detection rules only warn in the UI and do not stop API creates.',
    ),
    {
      title: 'Define the alternate key',
      how: 'Dataverse tab, table Account, Keys. New key: Display name Account Number Key, column Account Number, Save. Dataverse builds the index in the background: the status is Pending, then Active, or Failed when the data has duplicates.',
      done: (s) => Boolean(key(s)),
    },
    {
      title: 'Clean up and activate the key',
      how: 'Rows, Show duplicates of Account Number, Select all but the oldest, Delete. Then Keys: if the key Failed, press Reactivate. Move the clock a minute: the key shows Active. In real Dynamics you would merge the duplicates, so related rows move to the account you keep.',
      done: active,
    },
    ask(
      'Upsert in the Web API',
      'Which request writes a customer once, whether it exists or not?',
      [
        "PATCH /accounts(accountnumber='C-1001') with the fields. It updates the account with that key or creates it. If-Match: * makes it update only (404 when missing), If-None-Match: * makes it create only (412 when it exists)",
        "GET /accounts?$filter=accountnumber eq 'C-1001', then POST when nothing came back",
        'POST /accounts with the header Prefer: upsert',
        "PUT /accounts(accountnumber='C-1001') with the whole row",
      ],
      0,
      'PATCH on a row address is an upsert in Dataverse. The address can be the GUID or an alternate key. A read then write is two calls and races when two changes of the same customer come close together. The If-Match and If-None-Match headers with * turn the upsert into a plain update or a plain create.',
    ),
    {
      title: 'Switch the app to upsert',
      how: `Runtime Manager, ${CUSTOMER_SYNC}, Settings, Properties. Set dynamics.writeMode to upsert and Apply Changes. The app then sends PATCH /accounts(accountnumber='...').`,
      done: upserting,
    },
    {
      title: 'Send a change from the API client',
      how: `API client from the console menu, application ${CUSTOMER_SYNC}, POST /customers with body {"accountNumber":"C-1003","name":"Larch and Pine Stores","city":"York","phone":"01904 550 210"}. The answer is 200 and the Request log of Dynamics and SharePoint shows PATCH 204. Account C-1003 has the new phone and is still one row.`,
      done: (s) => upserting(s) && active(s) && (s.lastCalls ?? []).some((c) => c.app === CUSTOMER_SYNC && c.status === 200 && c.method === 'POST' && c.t >= app(s, CUSTOMER_SYNC).updated) && patched(s, app(s, CUSTOMER_SYNC).updated),
    },
    {
      title: 'Prove no new duplicates come',
      how: 'Move the clock 10 minutes after your last change. The shop keeps sending changes. Account still has one row for each account number, all eight customers are there, and the key is Active.',
      done: (s) => upserting(s) && active(s) && allThere(s) && s.clock >= app(s, CUSTOMER_SYNC).updated + 10 * MINUTE && patched(s, s.clock - 3 * MINUTE),
    },
  ],
  why: 'A Dataverse row has a GUID as its primary key, so a business key such as the customer number needs an alternate key. Define it, clean up the duplicates first (the index fails on duplicate data, then Reactivate), and write with PATCH /accounts(accountnumber=\'...\'): an upsert that updates or creates, safe to repeat after a timeout. If-Match: * stops the create and If-None-Match: * stops the update. With the key active a plain POST of a known number fails with 412 and 0x80040237 instead of making a duplicate. In the lab the index is built within a minute and duplicates are deleted; in Dynamics merge them so related rows follow.',
  docs: 'https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api',
  solve(start) {
    let s = mark(start, 'msgraph:table:account')
    s = deleteRows(s, 'account', dupesOf(s.msgraph, 'account', 'accountnumber').map((r) => r.accountid)).state
    s = addKey(s, 'account', { name: 'brightmart_accountnumberkey', cols: ['accountnumber'] }).state
    s = advance(s, MINUTE)
    s = change(s, CUSTOMER_SYNC, { props: { ...app(s, CUSTOMER_SYNC).props, 'dynamics.writeMode': 'upsert' } })
    s = advance(s, 2 * MINUTE)
    s = callApi(s, { env: 'Sandbox', app: CUSTOMER_SYNC, method: 'POST', path: '/customers', body: '{"accountNumber":"C-1003","name":"Larch and Pine Stores","city":"York","phone":"01904 550 210"}' }).state
    return advance(s, 10 * MINUTE)
  },
  answers: { 1: 1, 4: 0 },
}

export const LABS = [lab]
