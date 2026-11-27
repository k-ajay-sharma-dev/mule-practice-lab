// The guided lab sf-upsert-extid. See platform-labs.js for the shape of a lab.
import { at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { duplicateGroups, editField, fieldOf, mergeAccounts, newOrg, newSalesforce, orgOf, timeOf } from '../platform-salesforce.js'
import { NAME } from './sf-upsert-extid.pkg.js'

const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const org = (s) => orgOf(s, 'Production')
const extField = (s) => fieldOf(org(s)?.objects.Account, 'Brightmart_Customer_Id__c')
const upsertOk = (s) => running(s) && String(props(s)['sync.operation'] ?? '').trim() === 'upsert'
const mapOk = (s) => running(s) && String(props(s)['map.billingCountry'] ?? '').trim() === 'countryCode'
const failedJobSeen = (s) => (org(s)?.jobs ?? []).some((j) => j.numberRecordsFailed > 0 && s.seen[`sf:job:${j.id}`])

function salesforce() {
  const prod = newOrg('Production')
  Object.assign(fieldOf(prod.objects.Account, 'Brightmart_Customer_Id__c'), { externalId: false, unique: false })
  return newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox') } })
}

const lab = {
  id: 'p-sf-upsert-extid',
  group: 'Salesforce and SAP',
  title: 'Every customer twice in Salesforce',
  minutes: 25,
  scenario: `${NAME} sends the changed customers of the customer master to the Accounts of the Brightmart org every 10 minutes. For each customer it queries Account by Name, then updates the match or creates a new Account. It is Tuesday 09:00. Sales sees Quay Deli and Quay Deli AS as two accounts with the same Brightmart Customer Id, orders land on the wrong one, and the two new Larkspur stores never reach Salesforce at all.`,
  start() {
    let s = newPlatform({
      clock: at(0, 9),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@brightmart.example', 'sync.operation': 'create-query', 'map.billingCountry': 'country' },
          secrets: { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
          store: {},
        }),
      ],
      salesforce: salesforce(),
      mail: [{ t: at(1, 8, 40), to: OPS, subject: 'Duplicate accounts in Salesforce', body: 'We have Quay Deli and Quay Deli AS, Pier Cafe and Pier Cafe Ltd, and more, each pair with the same Brightmart Customer Id. The reps do not know which one to use. And the Larkspur stores Nordkai and Vik are still missing. Brightmart sales operations', source: 'Brightmart sales operations' }],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. A customer whose name changed in the master is not found by the Name query, so the flow creates a new Account. The Larkspur stores fail with FIELD_CUSTOM_VALIDATION_EXCEPTION.` },
    {
      title: 'Find the duplicates',
      how: "Salesforce, Developer Console. Run SELECT Brightmart_Customer_Id__c, COUNT(Id) FROM Account GROUP BY Brightmart_Customer_Id__c HAVING COUNT(Id) > 1. You can also open Accounts, where the duplicates are grouped by Brightmart Customer Id.",
      done: (s) => Boolean(s.seen['sf:soql'] || s.seen['sf:accounts']),
    },
    ask(
      'External ID or Salesforce ID',
      'The flow could store the Salesforce Id in the customer master, or upsert on Brightmart_Customer_Id__c. Why is an External ID field the better key for this sync?',
      ['A Salesforce Id is only 15 characters', 'The External ID is the key the source already has. Upsert finds the Account by it, updates it or creates it in one call, and works the same in every org, while a Salesforce Id differs between Sandbox and Production and must be written back to the source', 'Upsert by Id is not supported', 'External IDs make queries slower, so they protect the API limit'],
      1,
      'A record has a different Salesforce Id in each org, and the source does not know it until it has created the record. An External ID field holds the key of the source system. Upsert with externalIdFieldName matches on it, so the same message can run again without making a duplicate. Mark the field Unique as well, so Salesforce refuses a second record with the same value. Matching by Name breaks as soon as a name changes.',
    ),
    {
      title: 'Mark the field as External ID',
      how: 'Salesforce, Object Manager, Account, Fields & Relationships. Edit Brightmart_Customer_Id__c and tick External ID. Save.',
      done: (s) => Boolean(extField(s)?.externalId),
    },
    {
      title: 'Merge the duplicates and make the field Unique',
      how: 'Tick Unique on the same field. Salesforce refuses with DUPLICATE_VALUE while two Accounts share a value. Open Accounts, choose the master record of each pair and click Merge Accounts. Then edit the field again, tick Unique and Save.',
      done: (s) => Boolean(extField(s)?.unique) && duplicateGroups(org(s)).length === 0,
    },
    {
      title: 'Upsert on the External ID',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set sync.operation to upsert. The flow then loads each run in a Bulk API 2.0 upsert job with externalIdFieldName Brightmart_Customer_Id__c. Apply Changes.`,
      done: upsertOk,
    },
    {
      title: 'Read the failed results of a job',
      how: 'Wait for a run, then open Salesforce, Bulk Data Load Jobs and the job with Records Failed above 0. Its failedResults show sf__Error for each row: FIELD_CUSTOM_VALIDATION_EXCEPTION:Billing Country is required for customer accounts.:BillingCountry for the Larkspur stores.',
      done: failedJobSeen,
    },
    {
      title: 'Fix the mapping, not the rule',
      how: 'The validation rule is right: the rows have no BillingCountry. The Larkspur stores carry their country only in countryCode. Set map.billingCountry to countryCode and Apply Changes. Leave the validation rule active.',
      done: (s) => mapOk(s) && (org(s)?.objects.Account.rules ?? []).every((r) => r.active),
    },
    {
      title: 'Watch the next runs',
      how: 'Move the clock 25 minutes. The next jobs reach JobComplete with 0 records failed, no two Accounts share a Brightmart Customer Id, and both Larkspur stores are in Accounts.',
      done: (s) => {
        if (!upsertOk(s) || !mapOk(s) || !extField(s)?.unique) return false
        const since = app(s, NAME).updated
        const jobs = (org(s)?.jobs ?? []).filter((j) => timeOf(j.createdDate) > since)
        const done = jobs.filter((j) => j.state === 'JobComplete')
        const accounts = org(s).records.Account
        return s.clock >= since + 20 * MINUTE && done.length >= 2 && done.every((j) => j.numberRecordsFailed === 0) && duplicateGroups(org(s)).length === 0 && ['HC-20001', 'HC-20002'].every((id) => accounts.some((r) => r.Brightmart_Customer_Id__c === id))
      },
    },
  ],
  why: 'Matching on a name is not a key: names change and differ between systems, so a query by Name plus create makes a duplicate each time. Upsert on an External ID field matches on the key of the source system, in one call and the same way in every org. Mark the field External ID and Unique, which Salesforce allows only once the duplicates are merged. With Bulk API 2.0 a row that fails does not fail the job: read failedResults, where sf__Error holds the status code, such as FIELD_CUSTOM_VALIDATION_EXCEPTION or DUPLICATE_VALUE, and fix the data or the mapping instead of turning off the rule. In the lab the merge is on the Accounts page and failedResults keeps up to 50 rows.',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/get_job_failed_results.htm',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), 'sf:soql')
    s = editField(s, 'Production', 'Account', 'Brightmart_Customer_Id__c', { externalId: true }).state
    for (const g of duplicateGroups(org(s))) s = mergeAccounts(s, 'Production', g[0].Id, g.map((r) => r.Id))
    s = editField(s, 'Production', 'Account', 'Brightmart_Customer_Id__c', { unique: true }).state
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'sync.operation': 'upsert' } })
    s = until(s, s.clock + 35 * MINUTE)
    const failed = org(s).jobs.find((j) => j.numberRecordsFailed > 0)
    if (failed) s = mark(s, `sf:job:${failed.id}`)
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'map.billingCountry': 'countryCode' } })
    return until(s, s.clock + 25 * MINUTE)
  },
  answers: { 2: 1 },
}

export const LABS = [lab]
