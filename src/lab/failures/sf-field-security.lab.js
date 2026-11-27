// The guided lab sf-field-security. See platform-labs.js for the shape of a lab.
import { at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { accessOf, fieldOf, INTEGRATION_USER, newOrg, newSalesforce, orgOf, recordsOf, setFieldAccess, userOf } from '../platform-salesforce.js'
import { LIMITS, NAME } from './sf-field-security.pkg.js'

const PERMSET = 'Harbor_Mule_Account_Sync'
const FIELD = 'Account.Credit_Limit__c'
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const org = (s) => orgOf(s, 'Production')
const user = (s) => userOf(org(s), INTEGRATION_USER)
const level = (s) => accessOf(org(s), user(s), 'Account', 'Credit_Limit__c')
const checkOk = (s) => running(s) && String(props(s)['sync.checkSaveResults'] ?? '').trim().toLowerCase() === 'true'
// least privilege: no Modify All Data for the integration user, and the field granted in the permission set of the sync
const leastOk = (s) => {
  const o = org(s)
  const u = user(s)
  const holders = [o?.profiles?.[u?.profile], ...(u?.permsets ?? []).map((p) => o?.permsets?.[p])].filter(Boolean)
  return Boolean(u) && !holders.some((h) => h.modifyAll || h.viewAll) && (u.permsets ?? []).includes(PERMSET) && o.permsets[PERMSET]?.fields?.[FIELD] === 'edit' && !fieldOf(o.objects.Account, 'Credit_Limit__c')?.required
}

function salesforce() {
  const prod = newOrg('Production', {
    cdc: [],
    permsets: {
      // the old set: all objects and fields, plus Modify All Data. The security review retired it on Friday.
      Harbor_Mule_Integration: { label: 'Harbor Mule Integration (retired)', apiEnabled: true, modifyAll: true, allObjects: 'CRED', allFields: 'edit', fields: {} },
      // the new set, built from a field list made before Credit_Limit__c existed
      [PERMSET]: {
        label: 'Harbor Mule Account Sync',
        apiEnabled: true,
        objects: { Account: 'RE', Contact: 'CRE', Order: 'CRE' },
        fields: { 'Account.AccountNumber': 'edit', 'Account.Type': 'edit', 'Account.Phone': 'edit', 'Account.BillingCity': 'edit', 'Account.BillingCountry': 'edit', 'Account.Industry': 'read', 'Account.Harbor_Customer_Id__c': 'read', 'Account.Loyalty_Tier__c': 'read', 'Contact.FirstName': 'edit', 'Contact.Email': 'edit', 'Contact.Phone': 'edit', 'Contact.AccountId': 'edit', 'Order.TotalAmount': 'edit', 'Order.Harbor_Order_Id__c': 'edit' },
      },
    },
  })
  userOf(prod, INTEGRATION_USER).permsets = [PERMSET]
  for (const a of prod.connectedApps) a.permsets = [PERMSET]
  return newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox', { cdc: [] }) } })
}

const lab = {
  id: 'p-sf-field-security',
  group: 'Salesforce and SAP',
  title: 'The credit limit field vanished for the integration user',
  minutes: 25,
  scenario: `${NAME} copies the credit limits of the ERP to Account.Credit_Limit__c every 15 minutes, and its credit check reads them to hold orders of customers over their limit. On Friday a security review replaced the permission set Harbor_Mule_Integration, which had Modify All Data, with a narrow set Harbor_Mule_Account_Sync. It is Monday 09:00. The credit check fails with "No such column", the sync logs that it sent the limits, and finance sees no credit limit on any Account.`,
  start() {
    let s = newPlatform({
      clock: at(0, 8),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@harbor.example', 'sync.checkSaveResults': 'false' },
          secrets: { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
          store: {},
        }),
      ],
      salesforce: salesforce(),
      mail: [{ t: at(0, 8, 45), to: OPS, subject: 'No credit limits in Salesforce', body: 'Quay Deli, Pier Cafe and the others show an empty Credit Limit since this morning, and orders that should be on hold went through. The ERP has the limits. Harbor finance', source: 'Harbor finance' }],
    })
    return until(s, at(0, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. order-credit-check fails with INVALID_FIELD: No such column 'Credit_Limit__c' on entity 'Account'. credit-limit-sync logs "Credit limits sent for 6 Accounts" and no error.` },
    {
      title: 'Check that the field exists',
      how: "Salesforce, Object Manager, Account, Fields & Relationships: Credit Limit, Credit_Limit__c, is there. Then Developer Console: SELECT Name, Credit_Limit__c FROM Account runs fine for you as an administrator, and every Credit Limit is empty.",
      done: (s) => Boolean(s.seen['sf:objects'] && s.seen['sf:soql']),
    },
    ask(
      'A column that exists',
      'The field is in Object Manager and your query reads it. Why does the integration user get INVALID_FIELD "No such column"?',
      ['The field was renamed and the old name is cached', 'Field level security hides the field from that user. Salesforce answers as if the field did not exist, so the error looks like a typo or a missing field', 'The API version of the connector is too old for custom fields', 'The query needs __r instead of __c'],
      1,
      'For a user without Read access on a field, the field does not exist: describe leaves it out, SOQL fails with INVALID_FIELD "No such column", and a write fails as well. The error code points at the name, but the cause is a permission. Before you search for a typo, run the same query as an administrator, or check the field permissions of the user.',
    ),
    {
      title: 'Find what the integration user is granted',
      how: 'Salesforce, Users: Mule Integration has the profile Harbor Integration User and the permission set Harbor_Mule_Account_Sync. Open Permission Sets, Harbor Mule Account Sync. Object Settings give Account Read and Edit. Field Permissions: Account lists Credit_Limit__c with neither Read Access nor Edit Access.',
      done: (s) => Boolean(s.seen['sf:users'] && s.seen['sf:permsets']),
    },
    ask(
      'Object access and field access',
      'Harbor_Mule_Account_Sync gives Read and Edit on Account. Why can the user still not read Credit_Limit__c?',
      ['Edit on an object always includes every field', 'Object permissions and field level security are separate. Object access lets the user see and change Account records; each field still needs its own Read Access, and Edit Access to change it', 'The profile overrides the permission set', 'Custom fields need Modify All Data'],
      1,
      'Salesforce checks two layers. Object Settings decide which record types a user can create, read, edit or delete. Field Permissions decide, field by field, what the user can see and change on those records. A new permission set starts with no field access, and a field added later is not in any old field list. Access adds up over the profile and all permission sets of the user.',
    ),
    {
      title: 'Make failed saves visible',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set sync.checkSaveResults to true and Apply Changes. The Update operation returns a SaveResult per record and raises no error when one fails. Now the flow reads them and raises APP:SAVE_FAILED with the status code of each record.`,
      done: checkOk,
    },
    ask(
      'The right size of fix',
      'Which change fixes the integration user with the least privilege?',
      ['Assign Harbor_Mule_Integration again, it has Modify All Data', 'Change the profile of the user to System Administrator', 'Grant Read Access and Edit Access on Credit_Limit__c in Harbor_Mule_Account_Sync', 'Make Credit_Limit__c a required field, because required fields are always visible'],
      2,
      'The user needs one more field, so grant that field in the permission set that holds the integration access. Modify All Data or View All Data skips every sharing and field check, which is what the security review removed. A System Administrator profile gives the same and more. Making the field required changes the data model for every user and fails while Accounts have no value.',
    ),
    {
      title: 'Grant the field in the permission set',
      how: 'Salesforce, Permission Sets, Harbor Mule Account Sync, Field Permissions: Account. Tick Read Access and Edit Access for Credit_Limit__c. With Read only, the credit check works but the sync gets INVALID_FIELD_FOR_INSERT_UPDATE. Do not assign the retired set again.',
      done: (s) => level(s) === 'edit' && leastOk(s),
    },
    {
      title: 'Watch the next runs',
      how: 'Move the clock 35 minutes. credit-limit-sync logs every SaveResult with success true two runs in a row, order-credit-check reads the limits and holds Pier Cafe, and every Account of the ERP shows its credit limit.',
      done: (s) => {
        if (!checkOk(s) || level(s) !== 'edit' || !leastOk(s)) return false
        const st = app(s, NAME).store ?? {}
        const accounts = recordsOf(org(s), 'Account')
        return (st.syncClean ?? 0) >= 2 && (st.checkClean ?? 0) >= 1 && Object.entries(LIMITS).every(([id, v]) => accounts.some((a) => a.Harbor_Customer_Id__c === id && a.Credit_Limit__c === v))
      },
    },
  ],
  why: 'Object permissions and field level security are separate layers. A user with Read and Edit on Account still needs Read Access on each field to see it and Edit Access to change it, and a new or rebuilt permission set grants no field until you tick it. Without Read Access the field does not exist for that user: SOQL fails with INVALID_FIELD "No such column", which looks like a typo, and writes fail too. With Read only, writes fail with INVALID_FIELD_FOR_INSERT_UPDATE. The Update operation of the connector does not raise an error for a failed record, so check the SaveResults. Fix it with the one field in the integration permission set, not with View All Data or Modify All Data. In the lab the old permission set is kept as retired.',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/admin_fls.htm',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), 'sf:objects')
    s = mark(mark(mark(s, 'sf:soql'), 'sf:users'), 'sf:permsets')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'sync.checkSaveResults': 'true' } })
    s = setFieldAccess(s, 'Production', 'permset', PERMSET, 'Account', 'Credit_Limit__c', 'edit')
    return until(s, s.clock + 35 * MINUTE)
  },
  answers: { 2: 1, 4: 1, 6: 2 },
}

export const LABS = [lab]
