// The guided lab sf-composite. See platform-labs.js for the shape of a lab.
import { at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { newOrg, newSalesforce, orgOf, recordsOf, timeOf } from '../platform-salesforce.js'
import { NAME } from './sf-composite.pkg.js'

const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const word = (s, k) => String(props(s)[k] ?? '').trim().toLowerCase()
const running = (s) => app(s, NAME)?.status === 'Running'
const org = (s) => orgOf(s, 'Production')
const compositeOk = (s) => running(s) && word(s, 'sync.mode') === 'composite' && word(s, 'composite.allOrNone') === 'true'
const per = (s) => Number(props(s)['composite.ordersPerRequest'])
const sizeOk = (s) => running(s) && Number.isInteger(per(s)) && per(s) >= 1 && per(s) <= 8
// webshop Accounts that no Contact points at, created after `from`
export const orphans = (s, from = -Infinity) => {
  const o = org(s)
  const linked = new Set(recordsOf(o, 'Contact').map((c) => c.AccountId))
  return recordsOf(o, 'Account').filter((a) => String(a.Harbor_Customer_Id__c ?? '').startsWith('WEB-') && timeOf(a.CreatedDate) > from && !linked.has(a.Id))
}

function salesforce() {
  // no Change Data Capture in this lab, so the event bus stays small
  return newSalesforce({ orgs: { Production: newOrg('Production', { cdc: [] }), Sandbox: newOrg('Sandbox', { cdc: [] }) } })
}

const lab = {
  id: 'p-sf-composite',
  group: 'Salesforce and SAP',
  title: 'Accounts without contacts after the webshop sync',
  minutes: 25,
  scenario: `${NAME} saves each new order of the Harbor webshop in Salesforce as an Account, a Contact and an Order, every 15 minutes. It is Tuesday 09:00. Sales sees webshop Accounts with no Contact and no Order, and the Salesforce admin warns that the app makes about four API requests per order. The Black Friday forecast is 30,000 orders a day, and the whole org has 100,000 requests a day.`,
  start() {
    let s = newPlatform({
      clock: at(1, 8),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@harbor.example', 'sync.mode': 'per-record', 'composite.allOrNone': 'false', 'composite.ordersPerRequest': '20' },
          secrets: { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
          store: {},
        }),
      ],
      salesforce: salesforce(),
      mail: [
        { t: at(1, 8, 50), to: OPS, subject: 'Webshop accounts without contacts', body: 'Several webshop customers from this morning are in Salesforce as an Account only: no Contact, no Order. The webshop says the orders were placed. Also, the webshop sync makes about four API requests per order. At the Black Friday forecast of 30,000 orders a day that is 120,000 requests, more than the 100,000 of the whole org. Harbor Salesforce admin team', source: 'Harbor Salesforce admin team' },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Each order costs a query and three create calls. For some orders the Contact fails with FIELD_CUSTOM_VALIDATION_EXCEPTION, after the Account was already saved.` },
    {
      title: 'Read the API usage of the org',
      how: `Salesforce, System Overview. The table API requests by client shows ${NAME}: about 40 requests for each run of 10 orders. At four requests per order, the forecast of 30,000 orders a day needs 120,000 requests, more than the limit of the org that every integration shares.`,
      done: (s) => Boolean(s.seen['sf:limits']),
    },
    {
      title: 'Find the orphan Accounts',
      how: "Salesforce, Developer Console. Run SELECT Id, Name, Harbor_Customer_Id__c FROM Account WHERE Harbor_Customer_Id__c LIKE 'WEB-%', then SELECT Id, AccountId FROM Contact WHERE AccountId = 'an Account Id from the log'. The query finds no Contact.",
      done: (s) => Boolean(s.seen['sf:soql']),
    },
    ask(
      'Why the Account stays behind',
      'The Contact create fails, but the Account of the same order is still in Salesforce. Why?',
      ['Salesforce saves an Account twice by mistake', 'Each REST call is its own transaction and commits at once. The flow has no way to undo the Account when the next call fails, so the order is half saved', 'The validation rule deletes the Contact after it was saved', 'The connector retries the Account but not the Contact'],
      1,
      'Every separate API call commits on its own. When the Contact call fails, the Account call before it is already committed, and nothing rolls it back. A Composite request with allOrNone true runs all its subrequests in one transaction: if one fails, Salesforce rolls back the others. The sObject Tree resource and sObject Collections with allOrNone do the same for their records.',
    ),
    {
      title: 'Save each order in one composite request',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set sync.mode to composite and composite.allOrNone to true. Then the flow sends POST /composite with three upsert subrequests per order. The Contact and the Order use AccountId @{acc_0.id}, the Id that the Account subrequest returned. Apply Changes.`,
      done: compositeOk,
    },
    ask(
      'The size of a composite request',
      'A composite request takes at most 25 subrequests. Each order needs three: Account, Contact and Order. How many orders fit in one request?',
      ['25', '8', '200', 'There is no limit with allOrNone'],
      1,
      'Composite allows 25 subrequests per request, so with three per order the most is 8 orders (24 subrequests). A larger request fails as a whole. sObject Collections take up to 200 records of one type per call, which fits a flat list of Accounts, but they cannot link a Contact to an Account created in the same call. That is what the @{ref.id} references of Composite are for.',
    ),
    {
      title: 'Fit the request to the limit',
      how: `Set composite.ordersPerRequest to 8 or less. With 20, each request has more than 25 subrequests and the whole request is refused. Apply Changes.`,
      done: sizeOk,
    },
    ask(
      'Read PROCESSING_HALTED',
      'With allOrNone true, one order of a request has a guest without email or phone. The response holds FIELD_CUSTOM_VALIDATION_EXCEPTION for one subrequest and PROCESSING_HALTED for all others. What does PROCESSING_HALTED tell the flow?',
      ['Those subrequests failed validation too and must be fixed by hand', 'Those subrequests were rolled back or never run because another one failed. They are fine: send them again without the order that had the real error', 'Salesforce is down and the whole run must wait', 'The API limit was reached'],
      1,
      'PROCESSING_HALTED is not the cause. With allOrNone the first real error stops the request, and every other subrequest comes back PROCESSING_HALTED: rolled back or never run. Find the subrequest with the real error code, set that order aside, and send the others again. Upserts on External IDs make that resend safe.',
    ),
    {
      title: 'Watch the next runs',
      how: 'Move the clock 45 minutes. Two runs in a row save their orders in at most one request per two orders, the guest orders are rejected whole, and no new webshop Account is without a Contact.',
      done: (s) => {
        if (!compositeOk(s) || !sizeOk(s)) return false
        const since = app(s, NAME).updated
        const orders = recordsOf(org(s), 'Order').filter((o) => String(o.Harbor_Order_Id__c ?? '').startsWith('W-') && timeOf(o.CreatedDate) > since)
        return s.clock >= since + 30 * MINUTE && (app(s, NAME).store?.streak ?? 0) >= 2 && orders.length >= 10 && orphans(s, since).length === 0
      },
    },
  ],
  why: 'One API call per record spends the request limit in proportion to the volume, and each call commits on its own, so a failure halfway through an order leaves an Account without its Contact and Order. A Composite request sends up to 25 subrequests in one API request. With allOrNone true they form one transaction, and @{referenceId.id} lets a later subrequest use the Id an earlier one created. When one subrequest fails, the others come back PROCESSING_HALTED: rolled back, not wrong, so resend them without the bad record. For flat lists of one object, sObject Collections take 200 records per call. In the lab the flow resends the halted orders once and leaves the rejected order to an error queue.',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_composite_composite.htm',
  solve(start) {
    let s = mark(mark(mark(start, `logs:${NAME}`), 'sf:limits'), 'sf:soql')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'sync.mode': 'composite', 'composite.allOrNone': 'true', 'composite.ordersPerRequest': '8' } })
    return until(s, s.clock + 45 * MINUTE)
  },
  answers: { 3: 1, 5: 1, 7: 1 },
}

export const LABS = [lab]
