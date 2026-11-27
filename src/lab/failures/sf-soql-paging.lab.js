// The guided lab sf-soql-paging. See platform-labs.js for the shape of a lab.
import { at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { describe, newOrg, newSalesforce, orgOf } from '../platform-salesforce.js'
import { FLOW, NAME } from './sf-soql-paging.pkg.js'

const MIGRATED = 4500 // the Accounts of the Saltmere migration
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const word = (s, k) => String(props(s)[k] ?? '').trim()
const running = (s) => app(s, NAME)?.status === 'Running'
const store = (s) => app(s, NAME)?.store ?? {}
const total = (s) => describe(orgOf(s, 'Production'), 'Account')?.count ?? 0
const pagingOk = (s) => running(s) && word(s, 'sf.followNextRecordsUrl') === 'true'
const selectiveOk = (s) => running(s) && word(s, 'sync.changedField').toLowerCase() === 'systemmodstamp'
const reloadOk = (s) => running(s) && word(s, 'sync.fullReload') === 'true'

function salesforce() {
  const prod = newOrg('Production', {
    // the Saltmere migration loaded 4,500 Accounts on Friday morning. Lab made: the rows are generated when a query reads
    // them, and Account counts as a large object from 4,000 rows (in a real org the selectivity thresholds start in the
    // hundreds of thousands), so the lab stays small.
    virtual: { Account: { count: MIGRATED, start: at(-3, 6), step: 500, template: { Name: 'Saltmere Customer {n}', Harbor_Customer_Id__c: 'HC-S{n}', Type: 'Customer', BillingCity: 'Saltmere', BillingCountry: 'Denmark' } } },
    largeObject: 4000,
    editors: { every: 30, from: 8, to: 18, by: 'sales.ops@harbor.example' },
  })
  return newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox') } })
}

const lab = {
  id: 'p-sf-soql-paging',
  group: 'Salesforce and SAP',
  title: 'The customer hub stops at 2,000',
  minutes: 25,
  scenario: `${NAME} copies the Accounts of Salesforce to the Harbor customer hub every 15 minutes. It went live this morning at 07:00 with a full load, after the Saltmere migration added 4,500 Accounts on Friday. It is Monday 10:00. Customer service cannot find most Saltmere customers in the hub, and since 07:15 every run of the sync fails.`,
  start() {
    let s = newPlatform({
      clock: at(0, 6, 59),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@harbor.example', 'sf.followNextRecordsUrl': 'false', 'sync.changedField': 'LastModifiedDate', 'sync.fullReload': 'false' },
          secrets: { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
        }),
      ],
      salesforce: salesforce(),
    })
    s = until(s, at(0, 9, 40))
    s.mail.push({ t: s.clock, to: OPS, subject: 'Saltmere customers missing in the hub', body: `The hub has ${store(s).count ?? 0} customers, but Salesforce has ${total(s)} Accounts. Saltmere Customer 3120 (HC-S3120) and most other Saltmere customers are not there. Changes our team made in Salesforce this morning are not in the hub either. Harbor customer service`, source: 'Harbor customer service' })
    return until(s, at(0, 10))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. The full load at 07:00 shows totalSize, done false and a nextRecordsUrl, and wrote 2000 Accounts. Every run since 07:15 fails with QUERY_TIMEOUT on the query of changed accounts.` },
    {
      title: 'Count the Accounts',
      how: 'Salesforce, Developer Console, Query Editor. Run SELECT COUNT() FROM Account and Execute. Compare the total with what the hub has.',
      done: (s) => Boolean(s.seen['sf:soql']),
    },
    ask(
      'Why the hub has 2,000',
      'The response of the full load had totalSize 4506 and 2000 records. Why?',
      ['The integration user can read only 2,000 Accounts', 'The REST query resource returns the records in batches of up to 2,000. When more remain, done is false and nextRecordsUrl points to the next batch. The flow mapped only the first response and never called nextRecordsUrl', 'SOQL has a LIMIT 2000 by default', 'The hub refuses more than 2,000 rows'],
      1,
      'A query result larger than the batch size comes back in parts. The REST API gives nextRecordsUrl and done false; the SOAP API gives a queryLocator for queryMore. The Query operation of the Salesforce connector follows them for you, but an HTTP Request to /query does not. OFFSET is no way around it, since it stops at 2,000.',
    ),
    {
      title: 'Read every batch',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set sf.followNextRecordsUrl to true, so the flow calls each nextRecordsUrl until done is true. Do not apply yet.`,
      done: pagingOk,
    },
    ask(
      'Why the changed accounts time out',
      'The query of changed accounts is WHERE LastModifiedDate > the last run. Since the migration it fails with QUERY_TIMEOUT. Why?',
      ['The integration user lost access to LastModifiedDate', 'Account is now large, and the filter is not selective: LastModifiedDate has no index, so Salesforce scans every row and the query runs too long. SystemModstamp is indexed and moves on every change, so a filter on it is selective', 'The API limit is reached', 'Datetime filters are not allowed on Account'],
      1,
      'On a large object the query optimizer needs a selective filter on an indexed field: Id, Name, CreatedDate, SystemModstamp, lookup fields, External ID or unique fields. LastModifiedDate is not indexed. SystemModstamp also changes when the system updates a record, so a delta on it never misses a change.',
    ),
    {
      title: 'Find the indexed fields',
      how: 'Salesforce, Object Manager, Account, Fields & Relationships. Harbor Customer Id is an External ID and Unique, so it is indexed. The standard fields Id, Name, CreatedDate and SystemModstamp are indexed too. LastModifiedDate and Type are not.',
      done: (s) => Boolean(s.seen['sf:objects']),
    },
    {
      title: 'Filter on SystemModstamp',
      how: 'Set sync.changedField to SystemModstamp. Do not apply yet.',
      done: selectiveOk,
    },
    {
      title: 'Load the missing Accounts',
      how: 'Set sync.fullReload to true and Apply Changes. The next run makes a full load with every batch, then the runs after it read the changed accounts again.',
      done: reloadOk,
    },
    {
      title: 'Watch the hub catch up',
      how: 'Move the clock 30 minutes. The full load reads every batch, the hub has as many customers as Salesforce has Accounts, and the next run of changed accounts ends without a QUERY_TIMEOUT.',
      done: (s) => {
        if (!pagingOk(s) || !selectiveOk(s) || !reloadOk(s)) return false
        const a = app(s, NAME)
        const st = store(s)
        const last = a.schedules.find((x) => x.flow === FLOW)?.last
        return s.clock >= a.updated + 30 * MINUTE && (st.full?.t ?? -1) >= a.updated && st.count === total(s) && Boolean(st.lastDelta?.ok) && st.lastDelta.t > st.full.t && Boolean(last?.ok)
      },
    },
  ],
  why: 'A SOQL result comes back in batches of up to 2,000 records. The REST response says done false and gives nextRecordsUrl, and the client must call it until done is true; the SOAP API does the same with queryMore. An HTTP Request that maps only the first response loses the rest without an error. On a large object a filter must also be selective: it must use an indexed field such as SystemModstamp, an External ID or a lookup, or the query fails with QUERY_TIMEOUT. LastModifiedDate is not indexed. In the lab Account counts as large from 4,000 rows, and the migrated rows are generated when a query reads them.',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_query.htm',
  solve(start) {
    let s = mark(mark(mark(start, `logs:${NAME}`), 'sf:soql'), 'sf:objects')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'sf.followNextRecordsUrl': 'true', 'sync.changedField': 'SystemModstamp', 'sync.fullReload': 'true' } })
    return until(s, s.clock + 31 * MINUTE)
  },
  answers: { 2: 1, 4: 1 },
}

export const LABS = [lab]
