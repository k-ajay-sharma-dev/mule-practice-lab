// The guided lab sf-lock-row. See platform-labs.js for the shape of a lab.
import { at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { newOrg, newSalesforce, orgOf, seedAccounts, timeOf } from '../platform-salesforce.js'
import { ACCOUNTS, FLOW, NAME, PER_ACCOUNT } from './sf-lock-row.pkg.js'

const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const yes = (s, k) => String(props(s)[k] ?? '').trim().toLowerCase() === 'true'
const running = (s) => app(s, NAME)?.status === 'Running'
const jobs = (s) => orgOf(s, 'Production')?.jobs ?? []
const lockJobSeen = (s) => jobs(s).some((j) => s.seen[`sf:job:${j.id}`] && (j.failed ?? []).some((r) => r.sf__Error.startsWith('UNABLE_TO_LOCK_ROW')))
const STORES = ['Nordkai', 'Vik', 'Strand', 'Brygge', 'Torget', 'Kaia', 'Molo', 'Fjord', 'Havn', 'Sund', 'Holmen', 'Odden']

function startState() {
  // lab made: the internal batches of Bulk API 2.0 are scaled down from 10,000 to 100 rows, so a small file shows the effect
  const sfState = newSalesforce({ orgs: { Production: newOrg('Production', { bulkChunk: 100 }), Sandbox: newOrg('Sandbox') } })
  const tmp = { clock: at(0, 9), salesforce: sfState }
  const ids = seedAccounts(tmp, 'Production', STORES.slice(0, ACCOUNTS).map((x, i) => ({ Name: `Larkspur Store ${x}`, Brightmart_Customer_Id__c: `HC-${20001 + i}`, Type: 'Customer', BillingCity: x, BillingCountry: 'Norway' }))).map((r) => r.id)
  return { sfState, ids }
}

const lab = {
  id: 'p-sf-lock-row',
  group: 'Salesforce and SAP',
  title: 'Bulk contacts that lock their own accounts',
  minutes: 20,
  scenario: `${NAME} loads the contacts of the ${ACCOUNTS} Larkspur stores, ${PER_ACCOUNT} per store, into Salesforce with a Bulk API 2.0 upsert job every 20 minutes. It is Tuesday 10:00. Each job reaches JobComplete, but most rows fail, and the store managers miss their staff in Salesforce. Running the job again gives a different set of failures each time.`,
  start() {
    const { sfState, ids } = startState()
    const s = newPlatform({
      clock: at(1, 9),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@brightmart.example', 'contacts.accounts': ids.join(','), 'load.sortByParent': 'false', 'load.retryFailed': 'false' },
          secrets: { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
          store: {},
        }),
      ],
      salesforce: sfState,
      mail: [{ t: at(1, 9, 50), to: OPS, subject: 'Larkspur contacts missing', body: 'Most staff of the Larkspur stores are still not in Salesforce. Store Nordkai has 8 of its 24 contacts. Brightmart sales operations', source: 'Brightmart sales operations' }],
    })
    return until(s, at(1, 10))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Each job reaches JobComplete with many records failed.` },
    {
      title: 'Read the failed rows',
      how: 'Salesforce, Bulk Data Load Jobs. Open a Contact job with failures. failedResults gives UNABLE_TO_LOCK_ROW:unable to obtain exclusive access to this record or 1 records with the Id of an Account.',
      done: lockJobSeen,
    },
    ask(
      'Why the rows lock',
      'The failed rows are Contacts, but the locked record is an Account. Why?',
      ['The Accounts are deleted', 'Saving a Contact locks its parent Account. Bulk API 2.0 splits the file into batches and runs them in parallel, and the contacts of one store sit in every batch, so batches wait on the same Account lock until they give up', 'The integration user has no access to Account', 'Bulk API cannot write Contacts'],
      1,
      'A child record with a lookup or master detail to a parent locks the parent while it is saved, so roll ups and sharing stay right. Batches that run in parallel and hold children of the same parent fight for that lock, and the losers fail with UNABLE_TO_LOCK_ROW after a timeout. The file order decides how often it happens.',
    ),
    {
      title: 'Group the contacts by account',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set load.sortByParent to true, so the rows are sorted by AccountId and the contacts of one store stay in one batch. Apply Changes.`,
      done: (s) => running(s) && yes(s, 'load.sortByParent'),
    },
    ask(
      'Sort or serial',
      'Bulk API 1.0 offers concurrencyMode Serial. When would you use it instead of sorting?',
      ['Always, serial is faster', 'When the rows cannot be grouped by parent, for example records that touch many shared parents. Serial removes the lock contention but runs one batch at a time, so a big load takes much longer. Bulk API 2.0 has no serial mode', 'Never, serial is not supported for Contact', 'Only for deletes'],
      1,
      'Sorting by the parent keeps the parallel speed and removes most contention. Serial mode of Bulk API 1.0, or smaller batches, help when the parents overlap in ways a sort cannot fix. Either way a few rows can still fail at a batch boundary, so plan a retry.',
    ),
    {
      title: 'Retry only the failed rows',
      how: 'Set load.retryFailed to true and Apply Changes. After a job with failures, the next run reads its failedResults and loads only those rows. Upsert on Brightmart_Contact_Id__c makes the retry safe: a row that was saved meanwhile is updated, not duplicated.',
      done: (s) => running(s) && yes(s, 'load.retryFailed'),
    },
    ask(
      'A retry that is safe',
      'Why load only the failed rows, and why upsert on Brightmart_Contact_Id__c rather than insert?',
      ['A retry must always reload the full file', 'The failed rows are the only work left, so a retry is small and fast. Upsert on an External ID makes it idempotent: running a row twice updates it instead of creating a second Contact', 'Insert is not allowed in Bulk API 2.0', 'failedResults deletes the saved rows'],
      1,
      'failedResults holds each failed row with sf__Error, ready to be loaded again. With insert, a retry of a whole file would duplicate every row that worked. Upsert on the key of the source makes any retry safe.',
    ),
    {
      title: 'Watch the next loads',
      how: 'Move the clock 60 minutes. The sorted job fails only a few rows at a batch boundary, the retry job loads them with 0 failures, and every contact of the stores is in Salesforce.',
      done: (s) => {
        if (!yes(s, 'load.sortByParent') || !yes(s, 'load.retryFailed')) return false
        const a = app(s, NAME)
        const after = jobs(s).filter((j) => timeOf(j.createdDate) > a.updated && j.state === 'JobComplete')
        const contacts = orgOf(s, 'Production').records.Contact.filter((r) => /^HCT-/.test(r.Brightmart_Contact_Id__c ?? ''))
        const last = a.schedules.find((x) => x.flow === FLOW)?.last
        return after.some((j) => j.numberRecordsFailed === 0) && new Set(contacts.map((r) => r.Brightmart_Contact_Id__c)).size === ACCOUNTS * PER_ACCOUNT && contacts.length === ACCOUNTS * PER_ACCOUNT && Boolean(last?.ok)
      },
    },
  ],
  why: 'Saving a child record locks its parent. Bulk API 2.0 runs its batches in parallel, so children of one parent spread over many batches fail with UNABLE_TO_LOCK_ROW, and the set of failures changes with timing. Sort or group the rows by the parent so each parent sits in one batch, use smaller batches or the Serial mode of Bulk API 1.0 when grouping is not possible, and retry only the rows in failedResults. Upsert on an External ID makes the retry safe. In the lab the batches hold 100 rows instead of 10,000, and a parent in two batches always loses the later ones.',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.salesforce_large_data_volumes_bp.meta/salesforce_large_data_volumes_bp/ldv_deployments_best_practices_bulk_api.htm',
  solve(start) {
    let s = mark(start, `logs:${NAME}`)
    const j = jobs(s).find((x) => (x.failed ?? []).some((r) => r.sf__Error.startsWith('UNABLE_TO_LOCK_ROW')))
    s = mark(s, `sf:job:${j.id}`)
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'load.sortByParent': 'true', 'load.retryFailed': 'true' } })
    return until(s, s.clock + 61 * MINUTE)
  },
  answers: { 2: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
