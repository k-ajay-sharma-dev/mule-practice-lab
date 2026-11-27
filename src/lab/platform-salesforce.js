// A Salesforce org pair for the Mule Salesforce connector: objects and fields, records, validation rules, the rolling 24
// hour API request limit, Bulk API 2.0 ingest jobs, Platform Events and Change Data Capture with replay IDs, users,
// profiles and permission sets with object and field access, login policies, the connected app for the OAuth JWT bearer
// flow, Login History, SOQL with query locators, and the Composite and sObject Tree resources. Pure and import free, so
// the engine and the pkg files can import it. Lives in state.salesforce; every helper copes with it missing or holding
// the placeholder { created }.
//
// Modelled on Salesforce Setup and the APIs (developer.salesforce.com). The API reference of this module is the comment
// block "API" below; the report of the wave copies it for lab authors.
//
// ---------- API ----------
// State: state.salesforce = defaultSalesforce(now) gives { created } only; the orgs are filled in on first write
// (ensureOrgs). A lab builds its own: newSalesforce({ orgs: { Production: newOrg('Production', {...}), Sandbox: newOrg('Sandbox') } }).
// An org (orgs.Production, orgs.Sandbox):
//   myDomain, loginHost (login.salesforce.com or test.salesforce.com), orgId, edition, instance, apiVersion
//   limits { DailyApiRequests: { Max }, DailyBulkApiBatches, DailyBulkV2QueryJobs, HourlyPublishedPlatformEvents, DailyDeliveredPlatformEvents }
//   usage [{ h, n, by: { client: n }, rej: { client: n } }]  API requests per hour of the apps (h = hour number since epoch)
//   feeds [{ client, day, night, from, to }]  other integrations: calls per hour in office hours and at night, counted, not stored
//   feedState { client: { since, failed, until } }  a feed blocked by the limit
//   objects { Account: { label, prefix, fields: [{ name, label, type, required, readonly, custom, externalId, unique, values, restricted, to }], rules: [{ name, active, errorField, formula, when, message }] } }
//   records { Account: [...] }, totals { Account: n } (records counted but not kept), virtual { Account: { count, start, step, template } }
//     virtual records are generated when a query reads them (lab made, for large objects); writes do not see them
//   largeObject  rows above which a query needs a selective filter (default 200000)
//   users [{ username, name, profile, license, permsets, password, token, active, frozen, failed, lockedUntil, passwordExpires, revokedAt }]
//   profiles { name: { apiEnabled, modifyAll, objects: { Account: 'CRED' }, allObjects: 'CRED', fields: { 'Account.X': 'edit'|'read'|'none' }, allFields, loginIpRanges: [{ start, end }] } }
//   permsets { name: { label, apiEnabled, objects, allObjects, fields, allFields } }   same grants as a profile
//   network { trustedIps: [{ start, end }] }  Setup, Network Access
//   passwordPolicy { maxInvalid: 10, lockoutMinutes: 15 }
//   connectedApps [{ name, consumerKey, oauth, scopes, certificate: { name, expires }, permittedUsers, ipRelaxation, profiles, permsets }]
//   certificates [{ name, expires }]  certificate files the admin can upload to a connected app (lab made)
//   loginHistory [{ t, username, sourceIp, loginType, loginSubtype, application, status, loginUrl }]
//   sessions { 'app:config': { user, t, last } }, jobs [...], cdc ['Account'], platformEvents ['Order_Placed__e'],
//   eventDefs { Order_Placed__e: { publishBehavior } }, subscribers [{ name, kind, channel, position, perMinute, status, processed, lastError }]
//   channels { '/data/AccountChangeEvent': { events: [{ replayId, t, payload }], purgedUpTo } }, replay, seq
//   bulkChunk (lab made) the internal batch size of Bulk API 2.0 jobs, 10000 when not set
//   locks [{ id, until }], editors { every, from, to, by, n } (people who edit accounts), cursors, apiLog, delivered
//
// In a package: ctx.salesforce. The connector config comes from the properties (and secure properties) of the app:
//   salesforce.auth          basic (username, password and security token) or jwt (OAuth JWT bearer)
//   salesforce.url           basic: the authorization URL, https://login.salesforce.com/services/Soap/u/61.0 or https://test.salesforce.com/...
//                            jwt: the token endpoint host, https://login.salesforce.com (or test, or the My Domain)
//   salesforce.username, salesforce.password, salesforce.securityToken
//   salesforce.consumerKey, salesforce.keyStore (a file name; the lab reads the certificate name in it), salesforce.principal, salesforce.audienceUrl
//   egress.ip                the IP the org sees (lab made: 203.0.113.24 when not set)
// Each call returns { ok: true, ... } or { ok: false, type, code, error } where type is the Mule error type:
//   SALESFORCE:CONNECTIVITY      the login fails: INVALID_LOGIN, LOGIN_MUST_USE_SECURITY_TOKEN, API_CURRENTLY_DISABLED,
//                                INVALID_OPERATION_WITH_EXPIRED_PASSWORD, OAuth errors (code OAUTH), unknown host
//   SALESFORCE:INVALID_SESSION   INVALID_SESSION_ID: the session was revoked; the connector logs in again on the next call
//   SALESFORCE:LIMIT_EXCEEDED    REQUEST_LIMIT_EXCEEDED (lab made mapping: the connector reports the fault code in the message)
//   SALESFORCE:INVALID_INPUT     INVALID_FIELD, INVALID_TYPE, MALFORMED_QUERY, QUERY_TIMEOUT, EXCEEDED_ID_LIMIT, a replay ID
//                                that is too old, bad Bulk job specs (lab made mapping)
// Record failures are not errors: results have items [{ id, success, created, errors: [{ statusCode, message, fields }] }].
//   .login()                                   { ok, org, user, loginType }
//   .create(type, records, { times })          SOAP create, at most 200 records a call (EXCEEDED_ID_LIMIT above). times: the
//   .update(type, records, { times })          app repeats the call that many times, one record each (lab made: every
//   .upsert(type, externalIdFieldName, records, { times })   call is counted, one record is kept); result.made = calls made
//   .query(soql)                               the connector pages for you: { ok, totalSize, done: true, records }, one API request per 2000 rows
//   .composite(type, records, { operation, externalIdFieldName, allOrNone })  REST /composite/sobjects, 200 records a call
//   .compositeRequest({ allOrNone, compositeRequest: [{ method, url, referenceId, body }] })  REST /composite, 25 subrequests
//   .tree(type, { records })                   REST /composite/tree/{type}: parents with children, all or nothing, 200 records
//   .bulkCreateJob({ object, operation, externalIdFieldName, api: '2.0'|'1.0', concurrencyMode: 'Parallel'|'Serial', batchSize })
//   .uploadData(jobId, records, { total })     total: rows of the CSV beyond the records given, which all succeed (lab made)
//   .closeJob(jobId), .abortJob(jobId), .jobStatus(jobId), .failedResults(jobId) { ok, rows, csv }, .successfulResults(jobId)
//   .publishEvent(name, fields, { rollback })  { ok, success, id, replayId, published }; rollback: the app's transaction rolls back
//   .subscribe(channel, replayId, { max })     { ok, events: [{ replayId, t, payload }], lastReplayId, behind }
//   .limits()                                  { ok, limits } as GET /services/data/v61.0/limits
//   .rest(method, path, body)                  { status, body }: /limits, /query?q= (one page of 2000 with nextRecordsUrl),
//                                              /query/<locator>, /sobjects/{type}[/{id}|/{extField}/{value}], /composite,
//                                              /composite/sobjects[/{type}/{extField}], /composite/tree/{type}
// Pure helpers: orgOf(state, name), orgsOf, apiUsage(org, now), limitsOf(org, now), runSoql(org, soql, now, user),
// describe(org, type), channelInfo(org, channel, now), duplicateGroups(org), usedBy(state, org, client), jobsOf(state, org),
// accessOf(org, user, type, field), objectAccess(org, user, type), apiEnabled(org, user), loginsOf(state, org).
// Lab helpers that change a draft: ensureOrgs(s), seedAccounts(s, org, records), editRecord(s, org, type, rec).
// UI actions (pure, state in, new state out): see "UI actions" at the end. Seen keys of the screen: sf:home, sf:limits,
// sf:bulk, sf:objects, sf:cdc, sf:login-history, sf:soql, sf:events, sf:apps, sf:accounts, sf:users, sf:permsets,
// sf:profiles, sf:network, sf:job:<id>, sf:field:<Object>.<Field>.

const MIN = 60000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
export const RETENTION_MS = 72 * HOUR
export const API_VERSION = '61.0'
export const DEFAULT_IP = '203.0.113.24' // the address of an app when it sets no egress.ip (the default of platform-network.js)
const SESSION_MS = 2 * HOUR // Session Settings, Timeout value: 2 hours
const MAX_RECORDS = 400 // records kept per object (lab made); the rest are counted in totals
const MAX_EVENTS = 300 // events kept per channel besides the 72 hour retention (lab made)
const MAX_JOBS = 25
const MAX_LOG = 40
const BULK_PER_MINUTE = 10000 // Bulk API 2.0 makes internal batches of 10,000 records; the lab processes one a minute
const CHUNK = 200 // records per SOAP create, update or upsert call and per composite call
const PAGE = 2000 // rows per query batch
const SUBREQUESTS = 25

// ---------- small helpers ----------

// lab time is milliseconds since Monday 2 November 2026 00:00 UTC, the BASE of platform.js (copied, this module is import free)
export const BASE = Date.UTC(2026, 10, 2)
export const iso = (t) => new Date(BASE + t).toISOString().replace('Z', '+0000')
export const timeOf = (v) => Date.parse(String(v ?? '').replace(/\+0000$/, 'Z')) - BASE
const blank = (v) => v === undefined || v === null || String(v).trim() === ''
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const push = (list, item, max) => {
  list.push(item)
  if (list.length > max) list.splice(0, list.length - max)
}
const fail = (type, code, error, extra = {}) => ({ ok: false, type, code, error, ...extra })
export const fmt = (x) => Math.round(x).toLocaleString('en-US')
const ipNum = (ip) => String(ip ?? '').split('.').reduce((a, o) => a * 256 + (Number(o) || 0), 0)
export const isIp = (x) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(String(x ?? '').trim()) && String(x).trim().split('.').every((o) => Number(o) <= 255)
export const inRanges = (ip, ranges) => (ranges ?? []).some((r) => ipNum(ip) >= ipNum(r.start) && ipNum(ip) <= ipNum(r.end))

// ---------- the schema of the org ----------

const f = (name, label, type, extra = {}) => ({ name, label, type, ...extra })
const SYSTEM = [f('Id', 'Record ID', 'id', { readonly: true }), f('CreatedDate', 'Created Date', 'datetime', { readonly: true }), f('LastModifiedDate', 'Last Modified Date', 'datetime', { readonly: true }), f('SystemModstamp', 'System Modstamp', 'datetime', { readonly: true })]
// child relationships, for the sObject Tree resource and for record locks
export const CHILDREN = { Account: { Contacts: ['Contact', 'AccountId'], Orders: ['Order', 'AccountId'], Loyalty_Members__r: ['Loyalty_Member__c', 'Account__c'] } }
export const PARENT_FIELD = { Contact: 'AccountId', Order: 'AccountId', Loyalty_Member__c: 'Account__c' }

export function newObjects() {
  return {
    Account: {
      label: 'Account',
      prefix: '001',
      fields: [
        ...SYSTEM,
        f('Name', 'Account Name', 'string', { length: 255, required: true }),
        f('AccountNumber', 'Account Number', 'string', { length: 40 }),
        f('Type', 'Type', 'picklist', { values: ['Customer', 'Partner', 'Prospect', 'Other'] }),
        f('Phone', 'Account Phone', 'phone'),
        f('BillingCity', 'Billing City', 'string', { length: 40 }),
        f('BillingCountry', 'Billing Country', 'string', { length: 80 }),
        f('Industry', 'Industry', 'picklist', { values: ['Food and Beverage', 'Retail', 'Hospitality', 'Other'] }),
        f('Harbor_Customer_Id__c', 'Harbor Customer Id', 'string', { length: 20, custom: true, externalId: true, unique: true }),
        f('Loyalty_Tier__c', 'Loyalty Tier', 'picklist', { custom: true, values: ['Bronze', 'Silver', 'Gold'], restricted: true }),
        f('Credit_Limit__c', 'Credit Limit', 'currency', { custom: true }),
      ],
      // the lab reads a rule as a list of conditions that must all be true for the record to fail
      rules: [{ name: 'Billing_Country_Required', active: true, errorField: 'BillingCountry', formula: "AND(ISPICKVAL(Type, 'Customer'), ISBLANK(BillingCountry))", when: [{ field: 'Type', eq: 'Customer' }, { field: 'BillingCountry', blank: true }], message: 'Billing Country is required for customer accounts.' }],
    },
    Contact: {
      label: 'Contact',
      prefix: '003',
      fields: [...SYSTEM, f('FirstName', 'First Name', 'string', { length: 40 }), f('LastName', 'Last Name', 'string', { length: 80, required: true }), f('Email', 'Email', 'email'), f('Phone', 'Business Phone', 'phone'), f('AccountId', 'Account ID', 'reference', { to: 'Account' }), f('Harbor_Contact_Id__c', 'Harbor Contact Id', 'string', { length: 20, custom: true, externalId: true, unique: true })],
      rules: [{ name: 'Email_Or_Phone', active: true, errorField: 'Email', formula: 'AND(ISBLANK(Email), ISBLANK(Phone))', when: [{ field: 'Email', blank: true }, { field: 'Phone', blank: true }], message: 'Give an email address or a phone number.' }],
    },
    Order: {
      label: 'Order',
      prefix: '801',
      fields: [
        ...SYSTEM,
        f('OrderNumber', 'Order Number', 'autonumber', { readonly: true }),
        f('AccountId', 'Account ID', 'reference', { to: 'Account', required: true }),
        f('EffectiveDate', 'Order Start Date', 'date', { required: true }),
        f('Status', 'Status', 'picklist', { values: ['Draft', 'Activated'], required: true, restricted: true }),
        f('TotalAmount', 'Order Amount', 'currency'),
        f('Harbor_Order_Id__c', 'Harbor Order Id', 'string', { length: 20, custom: true, externalId: true, unique: true }),
      ],
      rules: [],
    },
    Loyalty_Member__c: {
      label: 'Loyalty Member',
      prefix: 'a0B',
      custom: true,
      fields: [
        ...SYSTEM,
        f('Name', 'Loyalty Member Name', 'string', { length: 80, required: true }),
        f('Member_Number__c', 'Member Number', 'string', { length: 20, custom: true, externalId: true, unique: true }),
        f('Account__c', 'Account', 'reference', { custom: true, to: 'Account' }),
        f('Tier__c', 'Tier', 'picklist', { custom: true, values: ['Bronze', 'Silver', 'Gold'], restricted: true }),
        f('Points__c', 'Points', 'double', { custom: true }),
      ],
      rules: [{ name: 'Points_Not_Negative', active: true, errorField: 'Points__c', formula: 'Points__c < 0', when: [{ field: 'Points__c', lt: 0 }], message: 'Points cannot be negative.' }],
    },
  }
}

export const PLATFORM_EVENTS = [
  {
    name: 'Order_Placed__e',
    label: 'Order Placed',
    publishBehavior: 'Publish After Commit',
    eventType: 'High Volume',
    fields: [f('Order_Id__c', 'Order Id', 'string', { required: true }), f('Account_Id__c', 'Account Id', 'string'), f('Total__c', 'Total', 'double'), f('Channel__c', 'Channel', 'string')],
  },
]
export const PUBLISH_BEHAVIORS = ['Publish After Commit', 'Publish Immediately']
// the objects that Change Data Capture offers in this lab (the real list is much longer)
export const CDC_AVAILABLE = ['Account', 'Contact', 'Order', 'Loyalty_Member__c']
export const channelOfEntity = (type) => `/data/${type.replace(/__c$/, '__')}ChangeEvent`
export const PROFILES = ['System Administrator', 'Standard User', 'Minimum Access - API Only Integrations', 'Harbor Integration User']
export const LICENSES = { 'Minimum Access - API Only Integrations': 'Salesforce Integration', 'Harbor Integration User': 'Salesforce Integration', 'System Administrator': 'Salesforce', 'Standard User': 'Salesforce' }

const SEED = [
  ['Quay Deli', 'HC-10001', 'Customer', 'Harborview', 'Norway', 'Gold'],
  ['Pier Cafe', 'HC-10002', 'Customer', 'Harborview', 'Norway', 'Silver'],
  ['Dock Bakery', 'HC-10003', 'Customer', 'Saltmere', 'Denmark', 'Bronze'],
  ['Harbor Bistro', 'HC-10004', 'Customer', 'Harborview', 'Norway', 'Gold'],
  ['Lantern Books', 'HC-10005', 'Customer', 'Saltmere', 'Denmark', null],
  ['Seaglass Florist', 'HC-10006', 'Customer', 'Brightwater', 'Sweden', 'Silver'],
]

// ---------- the orgs ----------

const ORGS = {
  Production: { myDomain: 'harbor.my.salesforce.com', loginHost: 'login.salesforce.com', orgId: '00DHb0000001aQ2EAI', edition: 'Enterprise Edition', instance: 'NA224', pod: 'Hb0', userSuffix: '', max: 100000, password: 'Hrb-Int-Prod-26', token: 'labTokenProd7x2', key: 'Prod' },
  Sandbox: { myDomain: 'harbor--uat.sandbox.my.salesforce.com', loginHost: 'test.salesforce.com', orgId: '00DHu0000002cW7EAI', edition: 'Full Sandbox', instance: 'CS204', pod: 'Hu0', userSuffix: '.uat', max: 5000000, password: 'Hrb-Int-Uat-26', token: 'labTokenUat4k9', key: 'Uat' },
}
export const orgNames = () => Object.keys(ORGS)
export const INTEGRATION_USER = 'mule.integration@harbor.example'
export const userIn = (orgName, base) => `${base}${ORGS[orgName]?.userSuffix ?? ''}`
export const ADMIN = 'amira.lund@harbor.example'

const ALL = 'CRED' // Create, Read, Edit, Delete
export function newOrg(name, extra = {}) {
  const o = ORGS[name] ?? ORGS.Production
  const u = (x) => `${x}${o.userSuffix}`
  const org = {
    name,
    myDomain: o.myDomain,
    loginHost: o.loginHost,
    orgId: o.orgId,
    edition: o.edition,
    instance: o.instance,
    pod: o.pod,
    apiVersion: API_VERSION,
    limits: {
      // Enterprise Edition: 100,000 a day plus 1,000 per Salesforce license; a full sandbox gets 5,000,000
      DailyApiRequests: { Max: o.max },
      DailyBulkApiBatches: { Max: 15000 },
      DailyBulkV2QueryJobs: { Max: 10000 },
      HourlyPublishedPlatformEvents: { Max: 250000 },
      DailyDeliveredPlatformEvents: { Max: 50000 }, // lab made: the real value depends on the edition and add-ons
    },
    usage: [],
    bulkUsage: [],
    // the other integrations of Harbor: calls per hour in office hours (from to to) and at night
    feeds:
      name === 'Production'
        ? [
            { client: 'Pierline CPQ', day: 1800, night: 150, from: 8, to: 18 },
            { client: 'Outlook Integration', day: 900, night: 50, from: 7, to: 19 },
            { client: 'Salesforce Mobile', day: 400, night: 20, from: 7, to: 20 },
          ]
        : [{ client: 'UAT test runs', day: 600, night: 0, from: 9, to: 17 }],
    feedState: {},
    objects: newObjects(),
    records: { Account: [], Contact: [], Order: [], Loyalty_Member__c: [] },
    totals: {},
    virtual: {},
    largeObject: 200000,
    users: [
      { username: u(INTEGRATION_USER), name: 'Mule Integration', profile: 'Harbor Integration User', license: 'Salesforce Integration', permsets: ['Harbor_Mule_Integration'], password: o.password, token: o.token, active: true },
      { username: u(ADMIN), name: 'Amira Lund', profile: 'System Administrator', license: 'Salesforce', permsets: [], password: 'lab-admin', token: 'labTokenAdmin', active: true },
      { username: u('sales.ops@harbor.example'), name: 'Sales Operations', profile: 'Standard User', license: 'Salesforce', permsets: [], password: 'lab-sales', token: 'labTokenSales', active: true },
    ],
    profiles: {
      'System Administrator': { apiEnabled: true, modifyAll: true, loginIpRanges: [] },
      'Standard User': { apiEnabled: true, allObjects: 'CRE', allFields: 'edit', loginIpRanges: [] },
      // the profile Salesforce gives a user of the Salesforce Integration license: API only, no object access of its own
      'Minimum Access - API Only Integrations': { apiEnabled: true, apiOnly: true, objects: {}, fields: {}, loginIpRanges: [] },
      // a clone of that profile for the integration users of Harbor: object and field access come from permission sets
      'Harbor Integration User': { apiEnabled: true, apiOnly: true, objects: {}, fields: {}, loginIpRanges: [] },
    },
    permsets: {
      Harbor_Mule_Integration: { label: 'Harbor Mule Integration', apiEnabled: true, allObjects: ALL, allFields: 'edit', fields: {} },
    },
    network: { trustedIps: [] },
    passwordPolicy: { maxInvalid: 10, lockoutMinutes: 15 },
    connectedApps: [
      {
        name: 'Harbor MuleSoft Integration',
        consumerKey: `3MVG9lab.HarborMule.${o.key}`,
        oauth: true,
        scopes: ['Manage user data via APIs (api)', 'Perform requests at any time (refresh_token, offline_access)'],
        certificate: { name: 'harbor-mule-jwt-2027', expires: Date.UTC(2027, 7, 31) - BASE },
        permittedUsers: 'Admin approved users are pre-authorized',
        ipRelaxation: 'Relax IP restrictions',
        profiles: [],
        permsets: ['Harbor_Mule_Integration'],
      },
    ],
    certificates: [{ name: 'harbor-mule-jwt-2027', expires: Date.UTC(2027, 7, 31) - BASE }],
    loginHistory: [],
    sessions: {},
    jobs: [],
    cdc: ['Account'],
    platformEvents: PLATFORM_EVENTS.map((e) => e.name),
    eventDefs: {},
    subscribers: [],
    channels: {},
    replay: 41000,
    seq: 100,
    locks: [],
    editors: null,
    cursors: {},
    apiLog: [],
    delivered: [],
    ...extra,
  }
  if (!extra.records) seedRecords(org, 0)
  return org
}

function seedRecords(org, now) {
  const t = iso(now - 30 * DAY)
  const ids = SEED.map(([name, hc, type, city, country, tier]) => {
    const r = { Id: newId(org, 'Account'), Name: name, Type: type, BillingCity: city, BillingCountry: country, Harbor_Customer_Id__c: hc, Loyalty_Tier__c: tier, Phone: '+47 5550 ' + hc.slice(-4), CreatedDate: t, LastModifiedDate: t, SystemModstamp: t }
    org.records.Account.push(r)
    return r.Id
  })
  org.records.Contact.push({ Id: newId(org, 'Contact'), FirstName: 'Mia', LastName: 'Strand', Email: 'mia@harbor-bistro.example', AccountId: ids[3], CreatedDate: t, LastModifiedDate: t, SystemModstamp: t })
  org.records.Contact.push({ Id: newId(org, 'Contact'), FirstName: 'Olav', LastName: 'Berg', Email: 'olav@quay-deli.example', AccountId: ids[0], CreatedDate: t, LastModifiedDate: t, SystemModstamp: t })
  org.records.Order.push({ Id: newId(org, 'Order'), OrderNumber: '00000101', AccountId: ids[0], EffectiveDate: '2026-10-28', Status: 'Activated', TotalAmount: 412.5, Harbor_Order_Id__c: 'O-1001', CreatedDate: t, LastModifiedDate: t, SystemModstamp: t })
  org.records.Loyalty_Member__c.push({ Id: newId(org, 'Loyalty_Member__c'), Name: 'Quay Deli', Member_Number__c: 'LM-5001', Account__c: ids[0], Tier__c: 'Gold', Points__c: 1840, CreatedDate: t, LastModifiedDate: t, SystemModstamp: t })
}

export const newSalesforce = ({ orgs, ...extra } = {}) => ({ created: extra.created ?? 0, orgs: orgs ?? Object.fromEntries(orgNames().map((n) => [n, newOrg(n)])), ...extra })
// the open console: a placeholder; the orgs are filled in when something first writes to them
export const defaultSalesforce = (now = 0) => ({ created: now })

// Reads see a placeholder as the default orgs (cached per object, so a read never changes the state)
const DEFAULTS = new WeakMap()
const orgsRead = (s) => {
  const y = s?.salesforce
  if (!y) return null
  if (y.orgs) return y.orgs
  if (!DEFAULTS.has(y)) DEFAULTS.set(y, newSalesforce({ created: y.created ?? 0 }).orgs)
  return DEFAULTS.get(y)
}
export const orgOf = (s, name = 'Production') => orgsRead(s)?.[name] ?? null
export const orgsOf = (s) => Object.values(orgsRead(s) ?? {})
// writes the default orgs into a draft that holds the placeholder
export function ensureOrgs(s) {
  if (s?.salesforce && !s.salesforce.orgs) s.salesforce.orgs = newSalesforce({ created: s.salesforce.created ?? s.clock ?? 0 }).orgs
  return s
}
export const upgradeSalesforce = ensureOrgs

const newId = (org, type) => {
  const prefix = org.objects?.[type]?.prefix ?? { job: '750', event: 'e00', user: '005', permset: '0PS', app: '0H4', cursor: '01g' }[type] ?? '000'
  org.seq = (org.seq ?? 100) + 1
  return `${prefix}${org.pod ?? 'Hb0'}${String(org.seq).padStart(9, '0')}AAA`
}

// ---------- the schema readers ----------

export const objectOf = (org, type) => org?.objects?.[Object.keys(org?.objects ?? {}).find((k) => same(k, type))] ?? null
export const typeName = (org, type) => Object.keys(org?.objects ?? {}).find((k) => same(k, type)) ?? null
export const fieldOf = (obj, name) => obj?.fields.find((x) => same(x.name, name)) ?? null
export const recordsOf = (org, type) => org?.records?.[typeName(org, type)] ?? []
export function describe(org, type) {
  const obj = objectOf(org, type)
  const name = typeName(org, type)
  return obj ? { name, ...obj, count: recordsOf(org, type).length + (org.totals?.[name] ?? 0) + (org.virtual?.[name]?.count ?? 0) } : null
}
// virtual records: { count, start, step, template: { Name: 'Customer {n}', ... }, offset }
function* virtualRows(org, type) {
  const v = org?.virtual?.[type]
  if (!v) return
  const prefix = org.objects[type].prefix
  for (let i = 1; i <= v.count; i++) {
    const n = i + (v.offset ?? 0)
    const t = iso((v.start ?? 0) + i * (v.step ?? MIN))
    const r = { Id: `${prefix}${org.pod}V${String(i).padStart(8, '0')}AAA`, CreatedDate: t, LastModifiedDate: t, SystemModstamp: t }
    for (const [k, x] of Object.entries(v.template ?? {})) r[k] = typeof x === 'string' ? x.replaceAll('{n}', String(n)) : x
    yield r
  }
}

// ---------- users, profiles and permission sets ----------

const LEVEL = { none: 0, read: 1, edit: 2 }
export const userOf = (org, username) => (org?.users ?? []).find((u) => same(u.username, username)) ?? null
const holdersOf = (org, user) => [org?.profiles?.[user?.profile], ...(user?.permsets ?? []).map((p) => org?.permsets?.[p])].filter(Boolean)
export const apiEnabled = (org, user) => holdersOf(org, user).some((h) => h.apiEnabled || h.modifyAll)
// the object permissions of a user, as a string of C, R, E and D
export function objectAccess(org, user, type) {
  if (!user) return ALL
  const hs = holdersOf(org, user)
  if (hs.some((h) => h.modifyAll)) return ALL
  const got = new Set(hs.flatMap((h) => [...String(h.objects?.[type] ?? h.allObjects ?? '')]))
  return [...ALL].filter((c) => got.has(c)).join('')
}
// field level security: 'edit', 'read' or 'none'. A system field is readable when the object is.
export function accessOf(org, user, type, field) {
  if (!user) return 'edit'
  const hs = holdersOf(org, user)
  if (hs.some((h) => h.modifyAll)) return 'edit'
  const obj = org.objects[type]
  const fd = fieldOf(obj, field)
  if (!objectAccess(org, user, type).includes('R')) return 'none'
  if (fd?.readonly || fd?.name === 'Name' || fd?.required) return fd.readonly ? 'read' : 'edit' // required fields are always visible
  let best = 0
  for (const h of hs) {
    const own = h.fields?.[`${type}.${fd?.name ?? field}`]
    const lvl = own ?? h.allFields ?? 'none'
    best = Math.max(best, LEVEL[lvl] ?? 0)
  }
  return Object.keys(LEVEL).find((k) => LEVEL[k] === best)
}

// ---------- the API request limit ----------

const hourOf = (t) => Math.floor(t / HOUR)
const rateOf = (feed, h) => {
  const hod = ((h % 24) + 24) % 24
  return hod >= feed.from && hod < feed.to ? feed.day : feed.night
}
const part = (h, now) => (h === hourOf(now) ? ((now % HOUR) / MIN + 1) / 60 : 1)
// API requests in the rolling 24 hours (counted per hour): the stored calls of the apps and the counted calls of the feeds
export function apiUsage(org, now) {
  const H = hourOf(now)
  const byClient = {}
  const rejected = {}
  let apps = 0
  for (const b of org?.usage ?? []) {
    if (b.h <= H - 24 || b.h > H) continue
    apps += b.n
    for (const [k, v] of Object.entries(b.by ?? {})) byClient[k] = (byClient[k] ?? 0) + v
    for (const [k, v] of Object.entries(b.rej ?? {})) rejected[k] = (rejected[k] ?? 0) + v
  }
  let feeds = 0
  for (const fd of org?.feeds ?? []) {
    let v = 0
    for (let h = H - 23; h <= H; h++) v += rateOf(fd, h) * part(h, now)
    v = Math.round(v)
    feeds += v
    byClient[fd.client] = (byClient[fd.client] ?? 0) + v
  }
  const max = org?.limits?.DailyApiRequests?.Max ?? 0
  const used = Math.round(apps + feeds)
  const hourly = []
  for (let h = H - 23; h <= H; h++) hourly.push({ h, n: Math.round(((org?.usage ?? []).find((x) => x.h === h)?.n ?? 0) + (org?.feeds ?? []).reduce((k, fd) => k + rateOf(fd, h) * part(h, now), 0)) })
  return { max, used, remaining: Math.max(0, max - used), byClient, rejected, hourly }
}
const bucket = (list, h) => {
  let b = list.find((x) => x.h === h)
  if (!b) {
    b = { h, n: 0, by: {} }
    list.push(b)
    list.sort((a, c) => a.h - c.h)
    while (list.length && list[0].h <= h - 26) list.shift()
  }
  return b
}
function count(org, now, client, n) {
  const b = bucket((org.usage ??= []), hourOf(now))
  b.n += n
  b.by[client] = (b.by[client] ?? 0) + n
}
function reject(org, now, client, n) {
  const b = bucket((org.usage ??= []), hourOf(now))
  b.rej ??= {}
  b.rej[client] = (b.rej[client] ?? 0) + n
}
const sumSince = (list, now, ms) => (list ?? []).filter((b) => b.h > hourOf(now) - ms / HOUR).reduce((k, b) => k + b.n, 0)

export function limitsOf(org, now) {
  const u = apiUsage(org, now)
  const L = org.limits
  const published = Object.values(org.channels ?? {}).reduce((k, c) => k + (c.events ?? []).filter((e) => e.t > now - HOUR && e.published).length, 0)
  return {
    DailyApiRequests: { Max: u.max, Remaining: u.remaining },
    DailyBulkApiBatches: { Max: L.DailyBulkApiBatches.Max, Remaining: Math.max(0, L.DailyBulkApiBatches.Max - sumSince(org.bulkUsage, now, DAY)) },
    DailyBulkV2QueryJobs: { Max: L.DailyBulkV2QueryJobs.Max, Remaining: L.DailyBulkV2QueryJobs.Max },
    HourlyPublishedPlatformEvents: { Max: L.HourlyPublishedPlatformEvents.Max, Remaining: Math.max(0, L.HourlyPublishedPlatformEvents.Max - published) },
    DailyDeliveredPlatformEvents: { Max: L.DailyDeliveredPlatformEvents.Max, Remaining: Math.max(0, L.DailyDeliveredPlatformEvents.Max - sumSince(org.delivered, now, DAY)) },
  }
}

// Takes `n` API requests for a client and returns how many went through. Lab made: the org blocks at Max; the real org
// allows a small overage first.
function take(org, now, client, n = 1) {
  const room = apiUsage(org, now).remaining
  const ok = Math.max(0, Math.min(n, room))
  if (ok) count(org, now, client, ok)
  if (ok < n) reject(org, now, client, n - ok)
  return ok
}
const LIMIT = () => fail('SALESFORCE:LIMIT_EXCEEDED', 'REQUEST_LIMIT_EXCEEDED', 'REQUEST_LIMIT_EXCEEDED: TotalRequests Limit exceeded.', { status: 403 })

// ---------- login ----------

const hostOf = (url) => String(url ?? '').trim().replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, '').toLowerCase()
export function orgForHost(s, host) {
  const h = hostOf(host)
  return orgsOf(s).find((o) => o.loginHost === h || o.myDomain === h) ?? null
}
export const configOf = (props = {}) => ({
  auth: String(props['salesforce.auth'] ?? 'basic').trim().toLowerCase() || 'basic',
  url: props['salesforce.url'] ?? '',
  username: String(props['salesforce.username'] ?? '').trim(),
  password: props['salesforce.password'] ?? '',
  securityToken: props['salesforce.securityToken'] ?? '',
  consumerKey: String(props['salesforce.consumerKey'] ?? '').trim(),
  keyStore: String(props['salesforce.keyStore'] ?? '').trim(),
  principal: String(props['salesforce.principal'] ?? '').trim(),
  audienceUrl: props['salesforce.audienceUrl'] ?? '',
  ip: String(props['egress.ip'] ?? '').trim() || DEFAULT_IP,
})

const loginLine = (org, now, entry) => push((org.loginHistory ??= []), { t: now, ...entry }, MAX_LOG)
export const INVALID_LOGIN = 'INVALID_LOGIN: Invalid username, password, security token; or user locked out.'
const connFail = (code, text) => fail('SALESFORCE:CONNECTIVITY', code, text)

// Logs in the way the connector does on connect; returns { ok, org, user, loginType } or a failure
function login(s, cfg, now) {
  const jwt = cfg.auth === 'jwt'
  const host = hostOf(cfg.url)
  if (!host) return connFail('CONNECTIVITY', `${jwt ? 'Token endpoint' : 'Authorization URL'} is empty in the connector configuration.`)
  const org = orgsRead(s) && orgForHost(s, host)
  if (!org) return connFail('CONNECTIVITY', `java.net.UnknownHostException: ${host}`)
  return jwt ? loginJwt(org, cfg, host, now) : loginBasic(org, cfg, host, now)
}

function loginBasic(org, cfg, host, now) {
  const user = userOf(org, cfg.username)
  const base = { username: cfg.username || '(none)', sourceIp: cfg.ip, loginType: 'Other Apex API', loginSubtype: '', application: 'N/A', loginUrl: `${host}/services/Soap/u/${API_VERSION}` }
  const no = (status, code = 'INVALID_LOGIN', text = INVALID_LOGIN) => {
    if (user) loginLine(org, now, { ...base, status })
    return connFail(code, text)
  }
  if (!user || !user.active) return no('Invalid Password') // no line for a user the org does not have
  if (user.frozen) return no('User is Frozen')
  if ((user.lockedUntil ?? 0) > now) return no('Password Lockout')
  const profile = org.profiles?.[user.profile] ?? {}
  const ranges = profile.loginIpRanges ?? []
  if (ranges.length && !inRanges(cfg.ip, ranges)) return no('Restricted IP')
  // the API wants the password with the security token after it, unless the IP is trusted (Network Access, or in the
  // Login IP Ranges of the profile)
  const trusted = inRanges(cfg.ip, org.network?.trustedIps) || (ranges.length > 0 && inRanges(cfg.ip, ranges))
  const tokenOk = cfg.securityToken === user.token || (trusted && blank(cfg.securityToken))
  if (cfg.password !== user.password || !tokenOk) {
    if (cfg.password === user.password && blank(cfg.securityToken)) return no('Failed: API security token required', 'LOGIN_MUST_USE_SECURITY_TOKEN', 'LOGIN_MUST_USE_SECURITY_TOKEN: Invalid username, password, security token; or user locked out. Are you at a new location? When accessing Salesforce, either via a desktop client or the API, from outside of your company’s trusted networks, you must add a security token to your password to log in.')
    user.failed = (user.failed ?? 0) + 1
    const pol = org.passwordPolicy ?? { maxInvalid: 10, lockoutMinutes: 15 }
    if (user.failed >= pol.maxInvalid) {
      // Lockout effective period: minutes, or 0 for Forever (an admin must unlock the user)
      user.lockedUntil = pol.lockoutMinutes ? now + pol.lockoutMinutes * MIN : Number.MAX_SAFE_INTEGER
      user.failed = 0
      return no('Password Lockout')
    }
    return no('Invalid Password')
  }
  user.failed = 0
  if (!apiEnabled(org, user)) return no('Failed: API disabled for user', 'API_CURRENTLY_DISABLED', 'API_CURRENTLY_DISABLED: API is disabled for this User')
  if (user.passwordExpires && user.passwordExpires <= now) {
    loginLine(org, now, { ...base, status: 'Success' })
    return connFail('INVALID_OPERATION_WITH_EXPIRED_PASSWORD', 'INVALID_OPERATION_WITH_EXPIRED_PASSWORD: The users password has expired, you must call SetPassword before attempting any other API operations')
  }
  loginLine(org, now, { ...base, status: 'Success' })
  return { ok: true, org, user, loginType: 'Username Password' }
}

// OAuth 2.0 JWT bearer: the app signs a JWT with the private key of its keystore (lab made signing: the keystore file
// name says which certificate it holds); Salesforce checks it with the certificate of the connected app.
function loginJwt(org, cfg, host, now) {
  const app = (org.connectedApps ?? []).find((a) => a.oauth && a.consumerKey === cfg.consumerKey)
  const user = userOf(org, cfg.principal)
  const base = { username: cfg.principal || '(none)', sourceIp: cfg.ip, loginType: 'Remote Access 2.0', loginSubtype: 'OAuth JWT Bearer', application: app?.name ?? 'Unknown', loginUrl: `${host}/services/oauth2/token` }
  const no = (status, body) => {
    if (user) loginLine(org, now, { ...base, status })
    return connFail('OAUTH', `Failed to get access token: HTTP 400 ${body}`)
  }
  if (!app) return no('Failed: OAuth client identifier invalid', '{"error":"invalid_client_id","error_description":"client identifier invalid"}')
  if (hostOf(cfg.audienceUrl) !== org.loginHost) return no('Failed: Invalid assertion', '{"error":"invalid_grant","error_description":"audience is invalid"}')
  const cert = app.certificate
  if (!cert || !cfg.keyStore.toLowerCase().includes(String(cert.name).toLowerCase())) return no('Failed: Invalid assertion', '{"error":"invalid_grant","error_description":"invalid assertion"}')
  if (cert.expires <= now) return no('Failed: Certificate expired', '{"error":"invalid_grant","error_description":"invalid assertion"}') // lab made: an expired certificate fails the check
  if (!user || !user.active || user.frozen) return no('Failed: User not found', '{"error":"invalid_grant","error_description":"user hasn\'t approved this consumer"}')
  const approved = app.permittedUsers === 'Admin approved users are pre-authorized' ? (app.profiles ?? []).includes(user.profile) || (user.permsets ?? []).some((p) => (app.permsets ?? []).includes(p)) : (user.approvedApps ?? []).includes(app.name)
  if (!approved) return no("Failed: User hasn't approved this consumer", '{"error":"invalid_grant","error_description":"user hasn\'t approved this consumer"}')
  const ranges = org.profiles?.[user.profile]?.loginIpRanges ?? []
  if (app.ipRelaxation === 'Enforce IP restrictions' && ranges.length && !inRanges(cfg.ip, ranges)) return no('Restricted IP', '{"error":"invalid_grant","error_description":"ip restricted"}')
  if (!apiEnabled(org, user)) return no('Failed: API disabled for user', '{"error":"invalid_grant","error_description":"user is not admin approved to access this app"}') // lab made text
  loginLine(org, now, { ...base, status: 'Success' })
  return { ok: true, org, user, loginType: 'OAuth JWT' }
}

// ---------- record writes ----------

const err = (statusCode, message, fields = []) => ({ statusCode, message, fields })
const errText = (e) => `${e.statusCode}:${e.message}:${e.fields.join(',') || ''} --`
const noColumn = (k, type) => `No such column '${k}' on entity '${type}'. If you are attempting to use a custom field, be sure to append the '__c' after the custom field name. Please reference your WSDL or the describe call for the appropriate names.`

function cdcPublish(org, type, changeType, rec, changed, by, now) {
  if (!(org.cdc ?? []).includes(type)) return
  const fields = changeType === 'DELETE' ? {} : Object.fromEntries(changed.filter((k) => k !== 'Id').map((k) => [k, rec[k] ?? null]))
  publish(org, channelOfEntity(type), now, { ChangeEventHeader: { entityName: type, changeType, recordIds: [rec.Id], commitTimestamp: now, commitUser: by, changedFields: changeType === 'UPDATE' ? changed.filter((k) => !['Id', 'LastModifiedDate', 'SystemModstamp'].includes(k)) : [] }, ...fields })
}
function publish(org, channel, now, payload, published = false) {
  const c = ((org.channels ??= {})[channel] ??= { events: [], purgedUpTo: 0 })
  org.replay = (org.replay ?? 41000) + 1
  c.events.push({ replayId: org.replay, t: now, payload, ...(published && { published: true }) })
  if (c.events.length > MAX_EVENTS) c.purgedUpTo = Math.max(c.purgedUpTo ?? 0, c.events.splice(0, c.events.length - MAX_EVENTS).at(-1).replayId)
  return org.replay
}

const matches = (cond, rec) => {
  const v = rec[cond.field]
  if (cond.blank) return blank(v)
  if ('eq' in cond) return same(v, cond.eq)
  if ('lt' in cond) return !blank(v) && Number(v) < cond.lt
  return false
}

// One record of a create, update or upsert as `user` (null: an admin in the UI). `dupes` is the set of external IDs
// given twice in the same request. Returns { success, id, created, errors }.
function writeOne(org, op, type, input, extField, by, now, dupes, user = null) {
  const obj = org.objects[type]
  const rec = Object.fromEntries(Object.entries(input ?? {}).filter(([k]) => k !== 'attributes'))
  const perm = objectAccess(org, user, type)
  if (!perm.includes('R')) return { success: false, errors: [err('INVALID_TYPE', `sObject type '${type}' is not supported.`)] }
  for (const k of Object.keys(rec)) {
    const fd = fieldOf(obj, k)
    const lvl = fd ? accessOf(org, user, type, fd.name) : 'none'
    if (!fd || lvl === 'none') return { success: false, errors: [err('INVALID_FIELD', noColumn(k, type))] }
    if ((fd.readonly && !(fd.name === 'Id' && op !== 'create')) || (lvl === 'read' && fd.name !== 'Id')) return { success: false, errors: [err('INVALID_FIELD_FOR_INSERT_UPDATE', `Unable to create/update fields: ${fd.name}. Please check the security settings of this field and verify that it is read/write for your profile or permission set.`, [fd.name])] }
    if (fd.name !== k) {
      rec[fd.name] = rec[k]
      delete rec[k]
    }
  }
  const list = org.records[type]
  let target = null
  if (op === 'update') {
    if (blank(rec.Id)) return { success: false, errors: [err('MISSING_ARGUMENT', 'Id not specified in an update call')] }
    target = list.find((r) => r.Id === rec.Id)
    if (!target) return { success: false, errors: [err('INVALID_CROSS_REFERENCE_KEY', 'invalid cross reference id')] } // lab made: the org has no recycle bin
  } else if (op === 'upsert') {
    const key = fieldOf(obj, extField)?.name ?? 'Id'
    const v = rec[key]
    if (blank(v)) return { success: false, errors: [err('MISSING_ARGUMENT', `${key} not specified`, [key])] }
    if (dupes?.has(String(v).trim().toLowerCase())) return { success: false, errors: [err('DUPLICATE_VALUE', `Duplicate external id specified: ${v}`, [key])] }
    const found = list.filter((r) => same(r[key], v))
    if (found.length > 1) return { success: false, errors: [err('DUPLICATE_EXTERNAL_ID', `${key}: more than one record found for external id field: [${found.map((r) => r.Id).join(', ')}]`, [key])] }
    target = found[0] ?? null
    if (!target && key === 'Id') return { success: false, errors: [err('INVALID_CROSS_REFERENCE_KEY', 'invalid cross reference id')] }
  }
  // object permissions (lab made code for a missing Create or Edit permission)
  if (!perm.includes(target ? 'E' : 'C')) return { success: false, errors: [err('INSUFFICIENT_ACCESS_OR_READONLY', `insufficient access rights on object id`)] }
  const merged = { ...target, ...rec }
  const missing = obj.fields.filter((fd) => fd.required && !fd.readonly && blank(merged[fd.name])).map((fd) => fd.name)
  if (missing.length) return { success: false, errors: [err('REQUIRED_FIELD_MISSING', `Required fields are missing: [${missing.join(', ')}]`, missing)] }
  const lockId = target?.Id ?? (PARENT_FIELD[type] ? merged[PARENT_FIELD[type]] : null)
  if (lockId && (org.locks ?? []).some((l) => l.id === lockId && l.until > now)) return { success: false, errors: [err('UNABLE_TO_LOCK_ROW', `unable to obtain exclusive access to this record or 1 records: ${lockId}`)] }
  for (const fd of obj.fields) {
    const v = merged[fd.name]
    if (fd.restricted && !blank(v) && !fd.values.includes(v)) return { success: false, errors: [err('INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST', `${fd.label}: bad value for restricted picklist field: ${v}`, [fd.name])] }
    if ((fd.type === 'double' || fd.type === 'currency') && !blank(v) && Number.isNaN(Number(v))) return { success: false, errors: [err('INVALID_TYPE_ON_FIELD_IN_RECORD', `${fd.label}: value not of required type: ${v}`, [fd.name])] }
    if (fd.type === 'reference' && !blank(v) && fd.name in rec && !recordsOf(org, fd.to).some((r) => r.Id === v)) return { success: false, errors: [err('INVALID_CROSS_REFERENCE_KEY', `${fd.label}: id value of incorrect type: ${v}`, [fd.name])] }
  }
  for (const r of obj.rules ?? []) if (r.active && r.when.every((c) => matches(c, merged))) return { success: false, errors: [err('FIELD_CUSTOM_VALIDATION_EXCEPTION', r.message, [r.errorField])] }
  for (const fd of obj.fields) {
    if (!fd.unique || blank(merged[fd.name])) continue
    const other = list.find((r) => r !== target && same(r[fd.name], merged[fd.name]))
    if (other) return { success: false, errors: [err('DUPLICATE_VALUE', `duplicate value found: ${fd.name} duplicates value on record with id: ${other.Id}`, [fd.name])] }
  }
  const t = iso(now)
  for (const fd of obj.fields) if ((fd.type === 'double' || fd.type === 'currency') && !blank(merged[fd.name])) merged[fd.name] = Number(merged[fd.name])
  if (target) {
    const changed = Object.keys(rec).filter((k) => k !== 'Id' && String(target[k] ?? '') !== String(merged[k] ?? ''))
    Object.assign(target, merged, { LastModifiedDate: t, SystemModstamp: t, LastModifiedBy: by })
    if (changed.length) cdcPublish(org, type, 'UPDATE', target, [...changed, 'LastModifiedDate'], by, now)
    return { success: true, id: target.Id, created: false, errors: [] }
  }
  const made = { ...merged, Id: newId(org, type), CreatedDate: t, LastModifiedDate: t, SystemModstamp: t, LastModifiedBy: by }
  if (fieldOf(obj, 'OrderNumber')) made.OrderNumber = String(org.seq).padStart(8, '0')
  push(list, made, MAX_RECORDS)
  cdcPublish(org, type, 'CREATE', made, Object.keys(merged), by, now)
  return { success: true, id: made.Id, created: true, errors: [] }
}

const dupesOf = (records, key) => {
  const seen = new Map()
  for (const r of records) {
    const v = r?.[key] ?? Object.entries(r ?? {}).find(([k]) => same(k, key))?.[1]
    if (blank(v)) continue
    const k = String(v).trim().toLowerCase()
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  return new Set([...seen].filter(([, c]) => c > 1).map(([k]) => k))
}

// a whole call of records in one org: checks the type and the external ID field, then writes each record
function writeMany(org, op, typeIn, records, extField, by, now, user) {
  const type = typeName(org, typeIn)
  if (!type || !objectAccess(org, user, type).includes('R')) return fail('SALESFORCE:INVALID_INPUT', 'INVALID_TYPE', `INVALID_TYPE: sObject type '${typeIn}' is not supported.`)
  if (op === 'upsert') {
    const fd = fieldOf(org.objects[type], extField)
    if (!fd || (fd.name !== 'Id' && !fd.externalId) || accessOf(org, user, type, fd.name) === 'none') return fail('SALESFORCE:INVALID_INPUT', 'INVALID_FIELD', `INVALID_FIELD: Field name provided, ${extField} is not an External ID or indexed field for ${type}`)
  }
  const dupes = op === 'upsert' ? dupesOf(records, fieldOf(org.objects[type], extField).name) : null
  const items = records.map((r) => writeOne(org, op, type, r, extField, by, now, dupes, user))
  return { ok: true, items, successful: items.every((i) => i.success) }
}
function deleteOne(org, type, id, by, now, user) {
  const list = org.records[type] ?? []
  const k = list.findIndex((x) => x.Id === id)
  if (k < 0) return { success: false, errors: [err('ENTITY_IS_DELETED', 'entity is deleted')] }
  if (!objectAccess(org, user, type).includes('D')) return { success: false, errors: [err('INSUFFICIENT_ACCESS_OR_READONLY', 'insufficient access rights on object id')] }
  const [gone] = list.splice(k, 1)
  cdcPublish(org, type, 'DELETE', gone, [], by, now)
  return { success: true, id, errors: [] }
}

// ---------- SOQL (a subset) ----------

const KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'NULLS', 'FIRST', 'LAST', 'NULL', 'TRUE', 'FALSE', 'COUNT'])
function tokens(text) {
  const out = []
  const re = /(?:('(?:[^'\\]|\\.)*')|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))|(\d{4}-\d{2}-\d{2})|([A-Za-z_][A-Za-z0-9_.]*(?::\d+)?)|(-?\d+(?:\.\d+)?)|(!=|<=|>=|=|<|>|\(|\)|,))/y
  const src = String(text).trim().replace(/;\s*$/, '')
  let at = 0
  while (at < src.length) {
    re.lastIndex = at
    const m = re.exec(src)
    if (!m || m[0].length === 0) return { bad: at, src }
    const [, str, dt, d, word, num, op] = m
    if (str !== undefined) out.push({ k: 'str', v: str.slice(1, -1).replace(/\\(.)/g, '$1'), at })
    else if (dt) out.push({ k: 'dt', v: -BASE + Date.parse(dt.replace(/([+-])(\d{2}):?(\d{2})$/, (x, sg, a, b) => `${sg}${a}:${b}`)), at })
    else if (d) out.push({ k: 'date', v: d, at })
    else if (word) out.push({ k: KEYWORDS.has(word.toUpperCase()) ? 'kw' : 'id', v: KEYWORDS.has(word.toUpperCase()) ? word.toUpperCase() : word, at })
    else if (num) out.push({ k: 'num', v: Number(num), at })
    else out.push({ k: 'op', v: op, at })
    at = re.lastIndex
    while (/\s/.test(src[at] ?? '')) at++
  }
  return { list: out, src }
}

const qfail = (code, message) => fail('SALESFORCE:INVALID_INPUT', code, `${code}: ${message}`)
const startOfDay = (t) => t - (t % DAY)
function literal(tk, now) {
  if (!tk) return { bad: true }
  if (tk.k === 'str' || tk.k === 'num') return { v: tk.v }
  if (tk.k === 'dt') return { v: tk.v, time: true }
  if (tk.k === 'date') return { v: tk.v, date: true }
  if (tk.k === 'kw' && tk.v === 'NULL') return { v: null }
  if (tk.k === 'kw' && (tk.v === 'TRUE' || tk.v === 'FALSE')) return { v: tk.v === 'TRUE' }
  if (tk.k === 'id') {
    const u = tk.v.toUpperCase()
    if (u === 'TODAY') return { range: [startOfDay(now), startOfDay(now) + DAY] }
    if (u === 'YESTERDAY') return { range: [startOfDay(now) - DAY, startOfDay(now)] }
    const m = u.match(/^LAST_N_DAYS:(\d+)$/)
    if (m) return { range: [startOfDay(now) - Number(m[1]) * DAY, now + 1] }
  }
  return { bad: true }
}
function compare(fd, value, op, lit) {
  if (lit.range) {
    const t = fd.type === 'date' ? timeOf(`${value}T00:00:00Z`) : timeOf(value)
    if (Number.isNaN(t)) return false
    const [a, b] = lit.range
    return op === '=' ? t >= a && t < b : op === '!=' ? t < a || t >= b : op === '<' ? t < a : op === '<=' ? t < b : op === '>' ? t >= b : t >= a
  }
  if (lit.v === null) return op === '=' ? blank(value) : op === '!=' ? !blank(value) : false
  if (blank(value)) return op === '!='
  let a = value
  let b = lit.v
  if (fd.type === 'datetime') (a = timeOf(value)), (b = lit.time ? lit.v : timeOf(`${lit.v}T00:00:00Z`))
  else if (fd.type === 'date') (a = String(value)), (b = String(lit.v))
  else if (typeof b === 'number') a = Number(value)
  else if (typeof b === 'boolean') a = Boolean(value)
  else (a = String(a).toLowerCase()), (b = String(b).toLowerCase())
  return op === '=' ? a === b : op === '!=' ? a !== b : op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b
}
const likeRe = (p) => new RegExp(`^${String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')
// the fields Salesforce indexes: Id, Name, foreign keys, CreatedDate, SystemModstamp (not LastModifiedDate), External ID and unique fields
export const isIndexed = (fd) => ['Id', 'Name', 'CreatedDate', 'SystemModstamp'].includes(fd.name) || fd.type === 'reference' || fd.externalId || fd.unique
const caret = (src, at) => `\n${src}\n${' '.repeat(at)}^\nERROR at Row:1:Column:${at + 1}\n`

// Runs a SOQL query on an org (read only) as `user` (null: an admin). Returns { ok, totalSize, done, records, columns }
// with all rows, or a failure. The callers page the rows.
export function runSoql(org, soql, now = 0, user = null) {
  const tk = tokens(soql)
  if (tk.bad !== undefined) return qfail('MALFORMED_QUERY', `${caret(tk.src, tk.bad)}unexpected token`)
  const L = tk.list
  let i = 0
  const peek = (k, v) => L[i] && L[i].k === k && (v === undefined || L[i].v === v)
  const eat = (k, v) => (peek(k, v) ? L[i++] : null)
  const where = () => (L[i] ? `${caret(tk.src, L[i].at)}unexpected token: '${L[i].k === 'str' ? `'${L[i].v}'` : L[i].v}'` : 'unexpected end of query')
  if (!eat('kw', 'SELECT')) return qfail('MALFORMED_QUERY', where())
  const items = []
  do {
    if (eat('kw', 'COUNT')) {
      if (!eat('op', '(')) return qfail('MALFORMED_QUERY', where())
      const of = eat('id')
      if (!eat('op', ')')) return qfail('MALFORMED_QUERY', where())
      const alias = peek('id') ? L[i++].v : null
      items.push({ count: true, of, alias })
    } else {
      const id = eat('id')
      if (!id) return qfail('MALFORMED_QUERY', where())
      items.push({ tok: id })
    }
  } while (eat('op', ','))
  if (!eat('kw', 'FROM')) return qfail('MALFORMED_QUERY', where())
  // Order is a keyword too: right after FROM it is the object name
  const from = eat('id') ?? (peek('kw', 'ORDER') ? { ...L[i++], v: 'Order' } : null)
  if (!from) return qfail('MALFORMED_QUERY', where())
  const type = typeName(org, from.v)
  if (!type || !objectAccess(org, user, type).includes('R')) return qfail('INVALID_TYPE', `${caret(tk.src, from.at)}sObject type '${from.v}' is not supported. If you are attempting to use a custom object, be sure to append the '__c' after the entity name. Please reference your WSDL or the describe call for the appropriate names.`)
  const obj = org.objects[type]
  const used = []
  const field = (tok) => {
    if (tok.v.includes('.')) return { bad: qfail('INVALID_FIELD', `${caret(tk.src, tok.at)}Relationship fields are not supported in this lab: ${tok.v}`) } // lab made
    const fd = fieldOf(obj, tok.v)
    if (!fd || accessOf(org, user, type, fd.name) === 'none') return { bad: qfail('INVALID_FIELD', `${caret(tk.src, tok.at)}${noColumn(tok.v, type)}`) }
    return { fd }
  }
  for (const it of items) {
    const tok = it.tok ?? it.of
    if (!tok) continue
    const r = field(tok)
    if (r.bad) return r.bad
    if (it.tok) it.field = r.fd.name
    else it.of = r.fd.name
  }
  let bad = null
  const stop = (x) => ((bad ??= x), null)
  const cond = () => {
    if (eat('kw', 'NOT')) {
      const x = cond()
      return x && ((r) => !x(r))
    }
    if (eat('op', '(')) {
      const x = orExpr()
      if (!x || !eat('op', ')')) return stop(qfail('MALFORMED_QUERY', where()))
      return x
    }
    const id = eat('id')
    if (!id) return stop(qfail('MALFORMED_QUERY', where()))
    const r = field(id)
    if (r.bad) return stop(r.bad)
    const fd = r.fd
    used.push(fd)
    const not = Boolean(eat('kw', 'NOT'))
    if (eat('kw', 'IN')) {
      if (!eat('op', '(')) return stop(qfail('MALFORMED_QUERY', where()))
      const vals = []
      do {
        const lit = literal(L[i++], now)
        if (lit.bad) return stop(qfail('MALFORMED_QUERY', where()))
        vals.push(lit)
      } while (eat('op', ','))
      if (!eat('op', ')')) return stop(qfail('MALFORMED_QUERY', where()))
      return (rec) => vals.some((v) => compare(fd, rec[fd.name], '=', v)) !== not
    }
    if (not) return stop(qfail('MALFORMED_QUERY', where()))
    if (eat('kw', 'LIKE')) {
      const lit = literal(L[i++], now)
      if (lit.bad || typeof lit.v !== 'string') return stop(qfail('MALFORMED_QUERY', where()))
      const re = likeRe(lit.v)
      return (rec) => !blank(rec[fd.name]) && re.test(String(rec[fd.name]))
    }
    const op = eat('op')
    if (!op || !['=', '!=', '<', '<=', '>', '>='].includes(op.v)) return stop(qfail('MALFORMED_QUERY', where()))
    const valTok = L[i++]
    const lit = literal(valTok, now)
    if (lit.bad) return stop(qfail('MALFORMED_QUERY', where()))
    if (fd.type === 'datetime' && typeof lit.v === 'string' && !lit.date) return stop(qfail('INVALID_FIELD', `${caret(tk.src, valTok.at)}value of filter criterion for field '${fd.name}' must be of type dateTime and should not be enclosed in quotes`))
    return (rec) => compare(fd, rec[fd.name], op.v, lit)
  }
  const andExpr = () => {
    let x = cond()
    while (x && eat('kw', 'AND')) {
      const a = x
      const b = cond()
      x = b && ((r) => a(r) && b(r))
    }
    return x
  }
  const orExpr = () => {
    let x = andExpr()
    while (x && eat('kw', 'OR')) {
      const a = x
      const b = andExpr()
      x = b && ((r) => a(r) || b(r))
    }
    return x
  }
  let test = null
  if (eat('kw', 'WHERE')) {
    test = orExpr()
    if (!test) return bad ?? qfail('MALFORMED_QUERY', where())
  }
  let group = null
  let having = null
  if (eat('kw', 'GROUP')) {
    if (!eat('kw', 'BY')) return qfail('MALFORMED_QUERY', where())
    const g = eat('id')
    if (!g) return qfail('MALFORMED_QUERY', where())
    const r = field(g)
    if (r.bad) return r.bad
    group = r.fd.name
    if (eat('kw', 'HAVING')) {
      if (!eat('kw', 'COUNT') || !eat('op', '(')) return qfail('MALFORMED_QUERY', where())
      eat('id')
      if (!eat('op', ')')) return qfail('MALFORMED_QUERY', where())
      const op = eat('op')
      const num = eat('num')
      if (!op || !num) return qfail('MALFORMED_QUERY', where())
      having = { op: op.v, v: num.v }
    }
  }
  let order = null
  if (eat('kw', 'ORDER')) {
    if (!eat('kw', 'BY')) return qfail('MALFORMED_QUERY', where())
    const o = eat('id')
    if (!o) return qfail('MALFORMED_QUERY', where())
    const r = field(o)
    if (r.bad) return r.bad
    order = { field: r.fd.name, desc: Boolean(eat('kw', 'DESC')) }
    if (!order.desc) eat('kw', 'ASC')
    if (eat('kw', 'NULLS')) eat('kw', 'FIRST') || eat('kw', 'LAST')
  }
  let limit = null
  if (eat('kw', 'LIMIT')) {
    const num = eat('num')
    if (!num) return qfail('MALFORMED_QUERY', where())
    limit = num.v
  }
  if (i < L.length) return qfail('MALFORMED_QUERY', where())
  const counts = items.filter((x) => x.count)
  const plain = items.filter((x) => x.field)
  const loose = plain.find((p) => p.field !== group)
  if ((counts.length || group) && loose) return qfail('MALFORMED_QUERY', `Field must be grouped or aggregated: ${loose.field}`)
  const v = org.virtual?.[type]
  const rows = recordsOf(org, type).length + (v?.count ?? 0) + (org.totals?.[type] ?? 0)
  // a filter on a large object must use an indexed field, or the query runs too long (lab made: any indexed field in WHERE)
  if (test && rows >= (org.largeObject ?? 200000) && !used.some(isIndexed)) return qfail('QUERY_TIMEOUT', 'Your query request was running for too long.')
  const all = [...(v ? [...virtualRows(org, type)] : []), ...recordsOf(org, type)]
  const kept = test ? all.filter((r) => test(r)) : all
  const extra = test ? 0 : (org.totals?.[type] ?? 0)
  if (counts.length === 1 && !counts[0].of && !group) return { ok: true, totalSize: kept.length + extra, done: true, records: [], columns: [], countOnly: true }
  let out
  if (counts.length || group) {
    const groups = new Map()
    for (const r of kept) {
      const k = group ? String(r[group] ?? '').toLowerCase() : ''
      if (!groups.has(k)) groups.set(k, { key: group ? (r[group] ?? null) : null, list: [] })
      groups.get(k).list.push(r)
    }
    if (!group && !groups.size) groups.set('', { key: null, list: [] })
    out = [...groups.values()].map((g) => {
      const rec = { attributes: { type: 'AggregateResult' } }
      if (group) rec[group] = g.key
      counts.forEach((c, n) => (rec[c.alias ?? `expr${n}`] = (c.of ? g.list.filter((r) => !blank(r[c.of])).length : g.list.length) + (group ? 0 : extra)))
      return rec
    })
    if (having) {
      const k = counts[0]?.alias ?? 'expr0'
      const h = having
      out = out.filter((r) => {
        const c = r[k] ?? 0
        return h.op === '>' ? c > h.v : h.op === '>=' ? c >= h.v : h.op === '<' ? c < h.v : h.op === '<=' ? c <= h.v : h.op === '=' ? c === h.v : c !== h.v
      })
    }
  } else out = kept.map((r) => ({ attributes: { type, url: `/services/data/v${API_VERSION}/sobjects/${type}/${r.Id}` }, ...Object.fromEntries(plain.map((p) => [p.field, r[p.field] ?? null])) }))
  if (order) {
    const fd = fieldOf(obj, order.field)
    const key = (r) => (fd.type === 'datetime' ? timeOf(r[order.field]) : typeof r[order.field] === 'number' ? r[order.field] : String(r[order.field] ?? '').toLowerCase())
    out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (order.desc ? -1 : 1))
  }
  if (limit !== null) out = out.slice(0, limit)
  const columns = [...(group ? [group] : []), ...plain.filter((p) => p.field !== group).map((p) => p.field), ...counts.map((c, n) => c.alias ?? `expr${n}`)]
  return { ok: true, totalSize: out.length, done: true, records: out, columns }
}

// ---------- Bulk API ----------

const OPS = ['insert', 'update', 'upsert', 'delete']
const jobOf = (org, id) => (org.jobs ?? []).find((j) => j.id === id) ?? null
export const jobInfo = (j) => {
  const { rows, failed, done, ...info } = j // eslint-disable-line no-unused-vars
  return info
}
function createJob(org, now, by, { object, operation = 'insert', externalIdFieldName, api = '2.0', concurrencyMode, batchSize } = {}) {
  const type = typeName(org, object)
  const v1 = String(api) === '1.0'
  const bad = (text) => fail('SALESFORCE:INVALID_INPUT', 'InvalidJob', `InvalidJob : ${text}`)
  if (!type) return bad(`Unable to find object: ${object}`)
  if (!OPS.includes(operation)) return bad(`Invalid operation: ${operation}`)
  // Bulk API 2.0 always runs in parallel and makes its own batches; Serial and the batch size are Bulk API 1.0 options
  if (!v1 && concurrencyMode === 'Serial') return bad('concurrencyMode is not a field of a Bulk API 2.0 job. Bulk API 2.0 processes in parallel; use Bulk API 1.0 for serial mode.') // lab made text
  if (operation === 'upsert') {
    if (blank(externalIdFieldName)) return bad(`External ID was blank for ${type}. An External ID must be specified for upsert.`)
    const fd = fieldOf(org.objects[type], externalIdFieldName)
    if (!fd || (fd.name !== 'Id' && !fd.externalId)) return bad(`Field name provided, ${externalIdFieldName} is not an External ID or indexed field for ${type}`)
  }
  // org.bulkChunk (lab made) scales the internal batches of Bulk API 2.0 down, so small lab files show parallel effects
  const size = v1 ? Math.max(1, Math.min(10000, Number(batchSize) || 10000)) : (org.bulkChunk ?? 10000)
  const job = { id: newId(org, 'job'), object: type, operation, ...(operation === 'upsert' && { externalIdFieldName: fieldOf(org.objects[type], externalIdFieldName).name }), state: 'Open', createdById: by, createdDate: iso(now), systemModstamp: iso(now), concurrencyMode: v1 && concurrencyMode === 'Serial' ? 'Serial' : 'Parallel', contentType: 'CSV', lineEnding: 'LF', columnDelimiter: 'COMMA', apiVersion: Number(API_VERSION), jobType: v1 ? 'Classic' : 'V2Ingest', batchSize: size, numberRecordsProcessed: 0, numberRecordsFailed: 0, retries: 0, totalProcessingTime: 0, rows: [], total: 0, failed: [], done: [] }
  push((org.jobs ??= []), job, MAX_JOBS)
  // lab made: only the last 8 jobs keep their result rows, so the saved state stays small
  for (const old of org.jobs.slice(0, -8)) if (old.failed?.length || old.done?.length) Object.assign(old, { failed: [], done: [], trimmed: true })
  return { ok: true, job: jobInfo(job) }
}
// Parallel batches lock the parent record of each child they write. A parent with children in two batches is locked by
// the first batch, and the rows of the other batches fail with UNABLE_TO_LOCK_ROW (lab made: in a real org it depends on
// timing, and Salesforce retries a batch up to 10 times before it gives up).
function lockedRows(j) {
  const pf = PARENT_FIELD[j.object]
  if (!pf || j.concurrencyMode === 'Serial' || j.operation === 'delete') return new Set()
  const size = j.batchSize ?? 10000
  const owner = new Map()
  const out = new Set()
  j.rows.forEach((r, k) => {
    const p = r[pf]
    if (blank(p)) return
    const b = Math.floor(k / size)
    if (!owner.has(p)) owner.set(p, b)
    else if (owner.get(p) !== b) out.add(k)
  })
  return out
}
function processJob(org, j, now) {
  const obj = org.objects[j.object]
  const headers = [...new Set(j.rows.flatMap((r) => Object.keys(r)))]
  const unknown = headers.find((h) => !fieldOf(obj, h))
  if (unknown) {
    Object.assign(j, { state: 'Failed', errorMessage: `InvalidBatch : Field name not found : ${unknown}`, rows: [], systemModstamp: iso(now) })
    return
  }
  const user = userOf(org, j.createdById)
  let failedN = 0
  const failed = []
  const done = []
  const locked = lockedRows(j)
  const op = j.operation === 'insert' ? 'create' : j.operation
  const dupes = op === 'upsert' ? dupesOf(j.rows, j.externalIdFieldName) : null
  j.rows.forEach((r, k) => {
    let res
    if (locked.has(k)) res = { success: false, errors: [err('UNABLE_TO_LOCK_ROW', `unable to obtain exclusive access to this record or 1 records: ${r[PARENT_FIELD[j.object]]}`)] }
    else if (op === 'delete') res = deleteOne(org, j.object, r.Id, j.createdById, now, user)
    else res = writeOne(org, op, j.object, r, j.externalIdFieldName, j.createdById, now, dupes, user)
    if (!res.success) {
      failedN++
      if (failed.length < 50) failed.push({ sf__Id: op === 'delete' ? (r.Id ?? '') : '', sf__Error: errText(res.errors[0]), ...r })
    } else if (done.length < 10) done.push({ sf__Id: res.id, sf__Created: String(Boolean(res.created)), ...r })
  })
  const total = Math.max(j.total, j.rows.length)
  if (op === 'create' || op === 'upsert') org.totals[j.object] = (org.totals[j.object] ?? 0) + Math.max(0, total - j.rows.length)
  bucket((org.bulkUsage ??= []), hourOf(now)).n += Math.max(1, Math.ceil(total / (j.batchSize ?? BULK_PER_MINUTE)))
  Object.assign(j, { state: 'JobComplete', numberRecordsProcessed: total, numberRecordsFailed: failedN, failed, done, rows: [], totalProcessingTime: Math.round(total * 1.6) + 400, systemModstamp: iso(now) })
}
export function failedCsv(j) {
  return toCsv(j?.failed ?? [], ['sf__Id', 'sf__Error'])
}
export function successCsv(j) {
  return toCsv(j?.done ?? [], ['sf__Id', 'sf__Created'])
}
function toCsv(rows, first) {
  if (!rows.length) return first.map((h) => `"${h}"`).join(',') + '\n'
  const heads = [...new Set([...first, ...rows.flatMap((r) => Object.keys(r))])]
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [heads.map(q).join(','), ...rows.map((r) => heads.map((h) => q(r[h])).join(','))].join('\n')
}

// ---------- event bus ----------

export function channelInfo(org, channel, now) {
  const c = org?.channels?.[channel]
  const events = (c?.events ?? []).filter((e) => e.t > now - RETENTION_MS)
  const purged = Math.max(c?.purgedUpTo ?? 0, (c?.events ?? []).filter((e) => e.t <= now - RETENTION_MS).at(-1)?.replayId ?? 0)
  return { channel, events, oldest: events[0]?.replayId ?? null, latest: events.at(-1)?.replayId ?? null, purgedUpTo: purged }
}
export const channelsOf = (org) => [...(org?.cdc ?? []).map(channelOfEntity), ...(org?.platformEvents ?? []).map((e) => `/event/${e}`)]
export const eventDef = (org, name) => {
  const d = PLATFORM_EVENTS.find((e) => e.name === name)
  return d ? { ...d, ...org?.eventDefs?.[name] } : null
}

// ---------- the context of an app ----------

export function salesforceCtx(s, app) {
  const client = app?.name ?? 'app'
  const cfg = configOf({ ...app?.props, ...app?.secrets })
  const now = s?.clock ?? 0
  const key = `${client}:${app?.config ?? 1}`
  // connects (or reuses the session of this configuration); `free` calls (inside a composite request) count nothing
  const connect = () => {
    if (!s?.salesforce) return connFail('CONNECTIVITY', `java.net.UnknownHostException: ${hostOf(cfg.url) || 'login.salesforce.com'}`)
    ensureOrgs(s)
    const org = orgForHost(s, hostOf(cfg.url))
    const ses = org?.sessions?.[key]
    if (ses && ses.last + SESSION_MS > now) {
      const user = userOf(org, ses.user)
      if (!user || (user.revokedAt ?? -1) >= ses.t) {
        delete org.sessions[key]
        return fail('SALESFORCE:INVALID_SESSION', 'INVALID_SESSION_ID', 'INVALID_SESSION_ID: Invalid Session ID found in SessionHeader: Illegal Session. Session not found, missing session hash.', { status: 401 })
      }
      ses.last = now
      return { ok: true, org, user, loginType: 'session' }
    }
    const r = login(s, cfg, now)
    if (!r.ok) return r
    r.org.sessions ??= {}
    r.org.sessions[key] = { user: r.user.username, t: now, last: now }
    return r
  }
  const log = (org, call, status, code = '') => push((org.apiLog ??= []), { t: now, client, call, status, code }, MAX_LOG)
  return makeApi({ connect, log, client, now, free: false })
}

function makeApi({ connect, log, client, now, free }) {
  const spend = (org, call, n = 1) => {
    if (free) return n
    const done = take(org, now, client, n)
    if (done < n) log(org, call, 403, 'REQUEST_LIMIT_EXCEEDED')
    return done
  }
  const by = (c) => c.user.username
  const begin = (call, n = 1) => {
    const c = connect()
    if (!c.ok) return c
    if (!spend(c.org, call, n)) return LIMIT()
    return c
  }
  const tooMany = () => fail('SALESFORCE:INVALID_INPUT', 'EXCEEDED_ID_LIMIT', `EXCEEDED_ID_LIMIT: record limit reached. cannot submit more than ${CHUNK} records into this call`)

  function records(op, type, recs, extField, opts = {}) {
    const list = [].concat(recs ?? [])
    if (list.length > CHUNK) return tooMany()
    const c = connect()
    if (!c.ok) return c
    const times = Math.max(1, Math.floor(opts.times ?? 1))
    const made = spend(c.org, `${op} ${type}`, times)
    if (!made) return { ...LIMIT(), made: 0 }
    const r = writeMany(c.org, op, type, list, extField, by(c), now, c.user)
    if (!r.ok) return log(c.org, `${op} ${type}`, 400, r.code), r
    const t = typeName(c.org, type)
    if (made > 1) c.org.totals[t] = (c.org.totals[t] ?? 0) + (made - 1) * r.items.filter((x) => x.created).length
    log(c.org, `${op} ${type}${made > 1 ? ` x ${fmt(made)}` : ''}`, 200)
    return made < times ? { ...LIMIT(), made, items: r.items } : { ...r, made }
  }
  // all or none: a failed request leaves the org as it was, apart from the API request it cost
  const atomic = (org, fn) => {
    const keep = structuredClone({ records: org.records, channels: org.channels, replay: org.replay, seq: org.seq, totals: org.totals })
    const r = fn()
    if (r.rollback) Object.assign(org, keep)
    return r
  }
  const queryAll = (c, soql) => {
    const r = runSoql(c.org, soql, now, c.user)
    log(c.org, 'query', r.ok ? 200 : 400, r.ok ? '' : r.code)
    return r
  }

  const api = {
    login() {
      const c = connect()
      return c.ok ? { ok: true, org: c.org.name, user: c.user.username, loginType: c.loginType } : c
    },
    create: (type, recs, opts) => records('create', type, recs, null, opts),
    update: (type, recs, opts) => records('update', type, recs, null, opts),
    upsert: (type, extField, recs, opts) => records('upsert', type, recs, extField, opts),
    delete(type, ids) {
      const c = begin(`delete ${type}`)
      if (!c.ok) return c
      const t = typeName(c.org, type)
      return { ok: true, items: [].concat(ids).map((id) => deleteOne(c.org, t, id, by(c), now, c.user)) }
    },
    // the Query operation of the connector reads every batch: one API request per 2000 rows
    query(soql) {
      const c = connect()
      if (!c.ok) return c
      if (!spend(c.org, 'query')) return LIMIT()
      const r = queryAll(c, soql)
      if (!r.ok) return r
      const more = Math.max(0, Math.ceil(r.records.length / PAGE) - 1)
      if (more && spend(c.org, 'queryMore', more) < more) return LIMIT()
      return r
    },
    // GET /query: one batch and a locator for the next (lab made: the locator keeps the query and the offset)
    queryPage(soql, offset = 0) {
      const c = connect()
      if (!c.ok) return c
      if (!spend(c.org, offset ? 'queryMore' : 'query')) return LIMIT()
      const r = queryAll(c, soql)
      if (!r.ok) return r
      const page = r.records.slice(offset, offset + PAGE)
      const done = offset + PAGE >= r.records.length
      let nextRecordsUrl
      if (!done) {
        const id = `01g${c.org.pod}${String(Object.keys(c.org.cursors ?? {}).length + 1).padStart(9, '0')}AAA`
        c.org.cursors = Object.fromEntries([...Object.entries(c.org.cursors ?? {}).slice(-9), [id, { soql, user: by(c) }]])
        nextRecordsUrl = `/services/data/v${API_VERSION}/query/${id}-${offset + PAGE}`
      }
      return { ok: true, totalSize: r.countOnly ? r.totalSize : r.records.length, done, records: page, ...(nextRecordsUrl && { nextRecordsUrl }) }
    },
    queryMore(locator) {
      const m = String(locator ?? '').match(/(01g\w+)-(\d+)$/)
      const c = connect()
      if (!c.ok) return c
      const cur = m && c.org.cursors?.[m[1]]
      if (!cur) return fail('SALESFORCE:INVALID_INPUT', 'INVALID_QUERY_LOCATOR', 'INVALID_QUERY_LOCATOR: invalid query locator')
      return api.queryPage(cur.soql, Number(m[2]))
    },
    composite(type, recs, { operation = 'create', externalIdFieldName, allOrNone = false } = {}) {
      const list = [].concat(recs ?? [])
      if (list.length > CHUNK) return tooMany()
      const c = begin(`composite ${operation} ${type}`)
      if (!c.ok) return c
      return atomic(c.org, () => {
        const r = writeMany(c.org, operation, type, list, externalIdFieldName, by(c), now, c.user)
        if (!r.ok || !allOrNone || r.successful) return r
        return { ok: true, successful: false, rollback: true, items: r.items.map((x) => (x.success ? { success: false, errors: [err('ALL_OR_NONE_OPERATION_ROLLED_BACK', 'Record rolled back because not all records were valid and the request was using AllOrNone header')] } : x)) }
      })
    },
    // POST /composite: up to 25 subrequests in one API request, with @{referenceId.field} references
    compositeRequest({ allOrNone = false, compositeRequest = [] } = {}) {
      if (compositeRequest.length > SUBREQUESTS) return fail('SALESFORCE:INVALID_INPUT', 'LIMIT_EXCEEDED', `LIMIT_EXCEEDED: A composite request can have up to ${SUBREQUESTS} subrequests. This request has ${compositeRequest.length}.`) // lab made text
      const c = begin('composite')
      if (!c.ok) return c
      const sub = makeApi({ connect: () => c, log: () => {}, client, now, free: true })
      return atomic(c.org, () => {
        const results = {}
        const out = []
        let failed = false
        for (const q of compositeRequest) {
          if (failed && allOrNone) {
            out.push({ body: [{ errorCode: 'PROCESSING_HALTED', message: 'The transaction was rolled back since another operation in the same transaction failed.' }], httpHeaders: {}, httpStatusCode: 400, referenceId: q.referenceId })
            continue
          }
          let missing = null
          const fill = (text) => String(text).replace(/@\{(\w+)\.(\w+)\}/g, (x, ref, k) => (results[ref]?.[k] !== undefined ? results[ref][k] : ((missing ??= `${ref}.${k}`), x)))
          const url = fill(q.url ?? '')
          const body = q.body === undefined ? undefined : JSON.parse(fill(JSON.stringify(q.body)))
          let res
          if (missing) res = { status: 400, body: [{ errorCode: 'PROCESSING_HALTED', message: `Invalid reference specified. No value for ${missing} found in ${missing.split('.')[0]}. Provided referenceId ('${missing.split('.')[0]}') must start with a letter or a number, and it can contain only letters, numbers and underscores ('_').` }] }
          else res = restCall(sub, q.method, url, body)
          if (res.status >= 400) failed = true
          else if (res.body && typeof res.body === 'object' && !Array.isArray(res.body)) results[q.referenceId] = res.body
          out.push({ body: res.body, httpHeaders: res.status === 201 ? { Location: `${url}/${res.body?.id ?? ''}` } : {}, httpStatusCode: res.status, referenceId: q.referenceId })
        }
        if (failed && allOrNone) for (const o of out) if (o.httpStatusCode < 400) Object.assign(o, { body: [{ errorCode: 'PROCESSING_HALTED', message: 'The transaction was rolled back since another operation in the same transaction failed.' }], httpStatusCode: 400 })
        return { ok: true, rollback: failed && allOrNone, compositeResponse: out }
      })
    },
    // POST /composite/tree/{type}: parents and their children in one request, all or nothing, at most 200 records
    tree(type, { records: recs = [] } = {}) {
      const flat = (list) => list.reduce((n, r) => n + 1 + Object.values(r).filter((v) => Array.isArray(v?.records)).reduce((m, v) => m + flat(v.records), 0), 0)
      const c = begin(`tree ${type}`)
      if (!c.ok) return c
      if (flat(recs) > CHUNK) return fail('SALESFORCE:INVALID_INPUT', 'EXCEEDED_ID_LIMIT', `EXCEEDED_ID_LIMIT: The request can contain up to ${CHUNK} records`)
      return atomic(c.org, () => {
        const results = []
        let errors = false
        const save = (t, list, parent) => {
          for (const r of list) {
            const { attributes, ...rest } = r
            const kids = Object.entries(rest).filter(([, v]) => v && typeof v === 'object' && Array.isArray(v.records))
            const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => !(v && typeof v === 'object' && Array.isArray(v.records))))
            if (parent) fields[parent.field] = parent.id
            const w = writeOne(c.org, 'create', t, fields, null, by(c), now, null, c.user)
            if (!w.success) {
              errors = true
              results.push({ referenceId: attributes?.referenceId ?? null, errors: w.errors })
              continue
            }
            results.push({ referenceId: attributes?.referenceId ?? null, id: w.id })
            for (const [rel, v] of kids) {
              const ch = CHILDREN[t]?.[rel]
              if (!ch) {
                errors = true
                results.push({ referenceId: attributes?.referenceId ?? null, errors: [err('INVALID_FIELD', `No such column '${rel}' on entity '${t}'.`)] })
                continue
              }
              save(ch[0], v.records, { field: ch[1], id: w.id })
            }
          }
        }
        save(typeName(c.org, type), recs, null)
        return errors ? { ok: true, hasErrors: true, rollback: true, results: results.filter((x) => x.errors) } : { ok: true, hasErrors: false, results }
      })
    },
    bulkCreateJob(spec) {
      const c = begin('bulk create job')
      if (!c.ok) return c
      return createJob(c.org, now, by(c), spec)
    },
    uploadData(jobId, recs, { total = 0 } = {}) {
      const c = begin('bulk upload')
      if (!c.ok) return c
      const j = jobOf(c.org, jobId)
      if (!j) return fail('SALESFORCE:INVALID_INPUT', 'NOT_FOUND', `NOT_FOUND: The requested resource does not exist: job ${jobId}`)
      if (j.state !== 'Open') return fail('SALESFORCE:INVALID_INPUT', 'InvalidJobState', `InvalidJobState : Job is in state ${j.state}. Data can only be uploaded to a job in state Open.`)
      j.rows.push(...structuredClone([].concat(recs ?? [])))
      j.total = Math.max(j.total, j.rows.length, total)
      return { ok: true, job: jobInfo(j) }
    },
    closeJob(jobId) {
      const c = begin('bulk close job')
      if (!c.ok) return c
      const j = jobOf(c.org, jobId)
      if (!j) return fail('SALESFORCE:INVALID_INPUT', 'NOT_FOUND', `NOT_FOUND: The requested resource does not exist: job ${jobId}`)
      if (j.state !== 'Open') return fail('SALESFORCE:INVALID_INPUT', 'InvalidJobState', `InvalidJobState : Job is in state ${j.state}.`)
      Object.assign(j, { state: 'UploadComplete', closedAt: now, systemModstamp: iso(now) })
      return { ok: true, job: jobInfo(j) }
    },
    abortJob(jobId) {
      const c = begin('bulk abort job')
      if (!c.ok) return c
      const j = jobOf(c.org, jobId)
      if (j && ['Open', 'UploadComplete'].includes(j.state)) Object.assign(j, { state: 'Aborted', rows: [] })
      return j ? { ok: true, job: jobInfo(j) } : fail('SALESFORCE:INVALID_INPUT', 'NOT_FOUND', 'NOT_FOUND: The requested resource does not exist')
    },
    jobStatus(jobId) {
      const c = begin('bulk job info')
      if (!c.ok) return c
      const j = jobOf(c.org, jobId)
      return j ? { ok: true, job: jobInfo(j) } : fail('SALESFORCE:INVALID_INPUT', 'NOT_FOUND', `NOT_FOUND: The requested resource does not exist: job ${jobId}`)
    },
    failedResults(jobId) {
      const c = begin('bulk failedResults')
      if (!c.ok) return c
      const j = jobOf(c.org, jobId)
      if (!j) return fail('SALESFORCE:INVALID_INPUT', 'NOT_FOUND', `NOT_FOUND: The requested resource does not exist: job ${jobId}`)
      return { ok: true, rows: structuredClone(j.failed ?? []), csv: failedCsv(j) }
    },
    successfulResults(jobId) {
      const c = begin('bulk successfulResults')
      if (!c.ok) return c
      const j = jobOf(c.org, jobId)
      if (!j) return fail('SALESFORCE:INVALID_INPUT', 'NOT_FOUND', `NOT_FOUND: The requested resource does not exist: job ${jobId}`)
      return { ok: true, rows: structuredClone(j.done ?? []), csv: successCsv(j) }
    },
    // Publish After Commit: the event goes out only when the transaction of the publisher commits; Publish Immediately:
    // it goes out at once, even when the transaction later rolls back
    publishEvent(name, fields = {}, { rollback = false } = {}) {
      const c = begin(`publish ${name}`)
      if (!c.ok) return c
      const def = c.org.platformEvents.includes(name) ? eventDef(c.org, name) : null
      if (!def) return fail('SALESFORCE:INVALID_INPUT', 'INVALID_TYPE', `INVALID_TYPE: sObject type '${name}' is not supported.`)
      const bad = Object.keys(fields).find((k) => !def.fields.some((x) => x.name === k))
      if (bad) return fail('SALESFORCE:INVALID_INPUT', 'INVALID_FIELD', `INVALID_FIELD: No such column '${bad}' on entity '${name}'.`)
      const miss = def.fields.filter((x) => x.required && blank(fields[x.name])).map((x) => x.name)
      if (miss.length) return { ok: true, success: false, errors: [err('REQUIRED_FIELD_MISSING', `Required fields are missing: [${miss.join(', ')}]`, miss)] }
      const id = newId(c.org, 'event')
      if (rollback && def.publishBehavior === 'Publish After Commit') return { ok: true, success: true, id, published: false }
      const replayId = publish(c.org, `/event/${name}`, now, { ...fields, CreatedDate: iso(now), CreatedById: by(c), EventUuid: id }, true)
      return { ok: true, success: true, id, replayId, published: true }
    },
    // the events of a channel after replayId; -1 new events only, -2 all retained events. max: the most events one
    // call delivers (lab made batch). Delivered events count against DailyDeliveredPlatformEvents.
    subscribe(channel, replayId = -1, { max = 1000 } = {}) {
      const c = connect()
      if (!c.ok) return c
      const org = c.org
      if (!channelsOf(org).includes(channel)) return fail('SALESFORCE:INVALID_INPUT', '400', `400::The channel you requested to subscribe to does not exist {${channel}}`) // lab made text
      const info = channelInfo(org, channel, now)
      const id = Number(replayId)
      const latest = info.latest ?? org.replay
      if (id === -1) return { ok: true, events: [], lastReplayId: latest, behind: 0 }
      if (id !== -2 && (!Number.isFinite(id) || id < info.purgedUpTo || id > (org.replay ?? 0))) return fail('SALESFORCE:INVALID_INPUT', '400', `400::The replayId {${replayId}} you provided was invalid. Please provide a valid ID, -2 to replay all events, or -1 to replay only new events.`)
      const after = info.events.filter((e) => id === -2 || e.replayId > id)
      const pe = channel.startsWith('/event/')
      const room = pe ? Math.max(0, limitsOf(org, now).DailyDeliveredPlatformEvents.Remaining) : Infinity
      if (pe && !room && after.length) return fail('SALESFORCE:LIMIT_EXCEEDED', 'DELIVERY_LIMIT', 'The daily allocation of delivered platform events is used up. No events are delivered until it frees up.') // lab made text
      const give = after.slice(0, Math.min(max, room))
      if (pe && give.length) bucket((org.delivered ??= []), hourOf(now)).n += give.length
      return { ok: true, events: structuredClone(give), lastReplayId: give.at(-1)?.replayId ?? (id === -2 ? (info.oldest ?? latest) - 1 : id), behind: after.length - give.length }
    },
    limits() {
      const c = begin('limits')
      if (!c.ok) return c
      return { ok: true, limits: limitsOf(c.org, now) }
    },
    rest(method, path, body) {
      return restCall(api, method, path, body)
    },
  }
  return api
}

// REST style: the paths of /services/data/vXX.0 that apps use, on top of the calls above
function restCall(api, method, path, body) {
  const p = String(path ?? '').replace(/^\/services\/data\/v\d+\.\d+/, '')
  const M = String(method ?? 'GET').toUpperCase()
  const out = (r) => ({ status: r.status ?? (r.code === 'INVALID_SESSION_ID' ? 401 : r.code === 'REQUEST_LIMIT_EXCEEDED' ? 403 : r.type === 'SALESFORCE:CONNECTIVITY' ? 401 : 400), body: [{ message: String(r.error).replace(/^[A-Z_]+: /, ''), errorCode: r.code }] })
  const itemErr = (it) => ({ status: 400, body: it.errors.map((e) => ({ message: e.message, errorCode: e.statusCode, fields: e.fields })) })
  if (M === 'GET' && p === '/limits') {
    const r = api.limits()
    return r.ok ? { status: 200, body: r.limits } : out(r)
  }
  const q = p.match(/^\/query\/?\?q=(.*)$/)
  if (M === 'GET' && q) {
    const r = api.queryPage(decodeURIComponent(q[1].replace(/\+/g, ' ')))
    return r.ok ? { status: 200, body: { totalSize: r.totalSize, done: r.done, ...(r.nextRecordsUrl && { nextRecordsUrl: r.nextRecordsUrl }), records: r.records } } : out(r)
  }
  const more = p.match(/^\/query\/(01g\w+-\d+)$/)
  if (M === 'GET' && more) {
    const r = api.queryMore(more[1])
    return r.ok ? { status: 200, body: { totalSize: r.totalSize, done: r.done, ...(r.nextRecordsUrl && { nextRecordsUrl: r.nextRecordsUrl }), records: r.records } } : out(r)
  }
  if (M === 'POST' && p === '/composite') {
    const r = api.compositeRequest(body ?? {})
    return r.ok ? { status: 200, body: { compositeResponse: r.compositeResponse } } : out(r)
  }
  const tree = p.match(/^\/composite\/tree\/(\w+)$/)
  if (M === 'POST' && tree) {
    const r = api.tree(tree[1], body ?? {})
    if (!r.ok) return out(r)
    return { status: r.hasErrors ? 400 : 201, body: { hasErrors: r.hasErrors, results: r.results } }
  }
  if (p === '/composite/sobjects' && (M === 'POST' || M === 'PATCH')) {
    const recs = body?.records ?? []
    const r = api.composite(recs[0]?.attributes?.type, recs, { operation: M === 'POST' ? 'create' : 'update', allOrNone: Boolean(body?.allOrNone) })
    return r.ok ? { status: 200, body: r.items.map((x) => ({ id: x.id ?? null, success: x.success, errors: x.errors })) } : out(r)
  }
  const ext = p.match(/^\/composite\/sobjects\/(\w+)\/(\w+)$/)
  if (ext && M === 'PATCH') {
    const r = api.composite(ext[1], body?.records ?? [], { operation: 'upsert', externalIdFieldName: ext[2], allOrNone: Boolean(body?.allOrNone) })
    return r.ok ? { status: 200, body: r.items.map((x) => ({ id: x.id ?? null, success: x.success, created: x.created, errors: x.errors })) } : out(r)
  }
  const one = p.match(/^\/sobjects\/(\w+)(?:\/(\w+))?(?:\/([^/]+))?$/)
  if (one) {
    const [, type, a, b] = one
    if (M === 'POST' && !a) {
      const r = api.create(type, [body ?? {}])
      if (!r.ok) return out(r)
      const it = r.items[0]
      return it.success ? { status: 201, body: { id: it.id, success: true, errors: [] } } : itemErr(it)
    }
    if (M === 'PATCH' && a) {
      const r = b ? api.upsert(type, a, [{ ...body, [a]: decodeURIComponent(b) }]) : api.update(type, [{ ...body, Id: a }])
      if (!r.ok) return out(r)
      const it = r.items[0]
      if (!it.success) return itemErr(it)
      return it.created ? { status: 201, body: { id: it.id, success: true, created: true, errors: [] } } : { status: b ? 200 : 204, body: b ? { id: it.id, success: true, created: false, errors: [] } : null }
    }
    if (M === 'DELETE' && a) {
      const r = api.delete(type, [a])
      if (!r.ok) return out(r)
      return r.items[0].success ? { status: 204, body: null } : { status: 404, body: [{ errorCode: 'ENTITY_IS_DELETED', message: 'entity is deleted' }] }
    }
    if (M === 'GET' && a && !b) {
      const r = api.query(`SELECT Id FROM ${type} WHERE Id = '${a}'`)
      if (!r.ok) return out(r)
      return r.records.length ? { status: 200, body: r.records[0] } : { status: 404, body: [{ errorCode: 'NOT_FOUND', message: 'The requested resource does not exist' }] }
    }
  }
  return { status: 404, body: [{ errorCode: 'NOT_FOUND', message: 'The requested resource does not exist' }] }
}

// ---------- the clock ----------

// runs once a lab minute while state.salesforce exists; changes `s` in place (the engine passes a draft). The open console
// holds the placeholder only, so nothing is written until something uses the org.
export function salesforceTick(s) {
  const y = s?.salesforce
  if (!y?.orgs) return s
  const now = s.clock ?? 0
  for (const org of Object.values(y.orgs)) {
    // Bulk API: a closed job is queued, then processed at 10,000 records a minute
    for (const j of org.jobs ?? []) {
      if (j.state === 'UploadComplete' && j.closedAt + MIN <= now) Object.assign(j, { state: 'InProgress', startedAt: now, systemModstamp: iso(now) })
      else if (j.state === 'InProgress' && j.startedAt + Math.max(1, Math.ceil(Math.max(j.total, j.rows.length) / BULK_PER_MINUTE)) * MIN <= now) {
        if (!j.rows.length && !j.total) Object.assign(j, { state: 'Failed', errorMessage: 'InvalidBatch : No data was uploaded for this job', systemModstamp: iso(now) }) // lab made text
        else processJob(org, j, now)
      }
    }
    // the 72 hour retention of the event bus
    for (const c of Object.values(org.channels ?? {})) {
      const k = c.events.findIndex((e) => e.t > now - RETENTION_MS)
      const drop = k < 0 ? c.events.length : k
      if (drop) c.purgedUpTo = Math.max(c.purgedUpTo ?? 0, c.events.splice(0, drop).at(-1).replayId)
    }
    if (org.locks?.length) org.locks = org.locks.filter((l) => l.until > now)
    // the other integrations stop when the limit is reached, and start again when calls fall out of the 24 hours
    const left = apiUsage(org, now).remaining
    for (const fd of org.feeds ?? []) {
      const st = org.feedState?.[fd.client]
      const rate = rateOf(fd, hourOf(now))
      if (left <= 0 && rate > 0) {
        org.feedState ??= {}
        org.feedState[fd.client] = { since: st?.since ?? now, failed: (st?.failed ?? 0) + rate / 60 }
        reject(org, now, fd.client, Math.round(rate / 60))
      } else if (st?.since && left > 0) org.feedState[fd.client] = { since: null, failed: st.failed, until: now }
    }
    // platform event subscribers in the org (an Apex trigger or a flow): each takes up to perMinute events a minute
    for (const sub of org.subscribers ?? []) {
      if (sub.status !== 'Running') continue
      const info = channelInfo(org, sub.channel, now)
      if (sub.position < info.purgedUpTo) {
        Object.assign(sub, { status: 'Error', lastError: `The events after replay ID ${sub.position} are past the 72 hour retention and were not delivered.` })
        continue
      }
      const next = info.events.filter((e) => e.replayId > sub.position).slice(0, sub.perMinute ?? 2000)
      if (!next.length) continue
      sub.position = next.at(-1).replayId
      sub.processed = (sub.processed ?? 0) + next.length
      sub.lastAt = now
    }
    // people who edit accounts in office hours (labs): each edit is an UPDATE change event
    const ed = org.editors
    if (ed && (now / MIN) % (ed.every ?? 60) === 0) {
      const hod = Math.floor((now % DAY) / HOUR)
      const list = org.records.Account
      if (hod >= (ed.from ?? 8) && hod < (ed.to ?? 18) && list.length) {
        ed.n = (ed.n ?? 0) + 1
        const r = list[ed.n % list.length]
        const tiers = ['Bronze', 'Silver', 'Gold']
        writeOne(org, 'update', 'Account', ed.n % 2 ? { Id: r.Id, Phone: `+47 5551 ${String(1000 + (ed.n % 9000)).slice(-4)}` } : { Id: r.Id, Loyalty_Tier__c: tiers[ed.n % 3] }, null, ed.by ?? 'sales.ops@harbor.example', now)
      }
    }
  }
  return s
}

// ---------- for labs (they change a draft) ----------

// writes records in an org as an admin in the UI would (no API request is counted)
export function seedAccounts(s, orgName, records, type = 'Account', by = ADMIN) {
  ensureOrgs(s)
  const org = s.salesforce.orgs[orgName]
  return records.map((r) => writeOne(org, 'create', type, r, null, by, s.clock ?? 0))
}
export const editRecord = (s, orgName, type, rec, by = 'sales.ops@harbor.example') => {
  ensureOrgs(s)
  return writeOne(s.salesforce.orgs[orgName], 'update', type, rec, null, by, s.clock ?? 0)
}
// the API requests a client made in the rolling 24 hours, and since a time
export const usedBy = (s, orgName, client) => apiUsage(orgOf(s, orgName), s.clock ?? 0).byClient[client] ?? 0
export const callsSince = (s, orgName, client, from) => (orgOf(s, orgName)?.usage ?? []).filter((b) => b.h >= hourOf(from)).reduce((k, b) => k + (b.by?.[client] ?? 0), 0)
export const rejectedSince = (s, orgName, client, from) => (orgOf(s, orgName)?.usage ?? []).filter((b) => b.h >= hourOf(from)).reduce((k, b) => k + (b.rej?.[client] ?? 0), 0)
export const jobsOf = (s, orgName = 'Production') => orgOf(s, orgName)?.jobs ?? []
export const loginsOf = (s, orgName = 'Production') => orgOf(s, orgName)?.loginHistory ?? []
export function duplicateGroups(org, type = 'Account', key = 'Harbor_Customer_Id__c') {
  const m = new Map()
  for (const r of recordsOf(org, type)) {
    if (blank(r[key])) continue
    const k = String(r[key]).toLowerCase()
    m.set(k, [...(m.get(k) ?? []), r])
  }
  return [...m.values()].filter((g) => g.length > 1)
}

// ---------- UI actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  if (!s.salesforce) return s
  ensureOrgs(s)
  fn(s, s.clock ?? 0)
  return s
}
const withOrg = (state, orgName, fn) => edit(state, (s, now) => s.salesforce.orgs[orgName] && fn(s.salesforce.orgs[orgName], now, s))
const adminOf = (org) => org.users.find((u) => u.profile === 'System Administrator')?.username ?? 'admin'
const result = (state, errors, fn) => (errors.length ? { state, errors } : { state: fn(), errors: [] })

// Object Manager, Fields and Relationships, Edit: External ID, Unique and Required. Returns { state, errors }.
export function editField(state, orgName, type, field, patch) {
  const org = orgOf(state, orgName)
  const obj = objectOf(org, type)
  const fd = fieldOf(obj, field)
  const errors = []
  if (!fd) errors.push('There is no such field.')
  else {
    const flags = ('externalId' in patch && patch.externalId !== Boolean(fd.externalId)) || ('unique' in patch && patch.unique !== Boolean(fd.unique))
    if (flags && !fd.custom) errors.push('A standard field has no External ID or Unique setting.')
    else if ((patch.externalId || patch.unique) && !['string', 'email', 'double'].includes(fd.type)) errors.push(`${fd.label} is a ${fd.type} field. External ID and Unique are for Text, Number and Email fields.`)
    else if (patch.unique && !fd.unique) {
      const seen = new Map()
      for (const r of recordsOf(org, type)) {
        if (blank(r[fd.name])) continue
        const k = String(r[fd.name]).toLowerCase()
        if (seen.has(k)) {
          errors.push(`DUPLICATE_VALUE: duplicate value found: ${fd.name} duplicates value on record with id: ${seen.get(k)}. Remove the duplicate ${obj.label} records before you make the field unique.`)
          break
        }
        seen.set(k, r.Id)
      }
    }
    if (!errors.length && patch.required && !fd.required && recordsOf(org, type).some((r) => blank(r[fd.name]))) errors.push(`Some ${obj.label} records have no ${fd.label}. Fill them in before you make the field required.`)
  }
  return result(state, errors, () =>
    withOrg(state, orgName, (o) => {
      const x = fieldOf(objectOf(o, type), field)
      for (const k of ['externalId', 'unique', 'required']) if (k in patch) x[k] = Boolean(patch[k])
    }),
  )
}
export const setRuleActive = (state, orgName, type, rule, active) =>
  withOrg(state, orgName, (o) => {
    const r = objectOf(o, type)?.rules.find((x) => x.name === rule)
    if (r) r.active = Boolean(active)
  })
export const setCdcEntities = (state, orgName, entities) => withOrg(state, orgName, (o) => void (o.cdc = CDC_AVAILABLE.filter((x) => entities.includes(x))))
// Merge Accounts: the master keeps its values, the others are deleted (their contacts and orders move to the master)
export const mergeAccounts = (state, orgName, masterId, otherIds) =>
  withOrg(state, orgName, (org, now) => {
    const list = org.records.Account
    const master = list.find((r) => r.Id === masterId)
    if (!master) return
    for (const id of otherIds) {
      if (id === masterId) continue
      const k = list.findIndex((r) => r.Id === id)
      if (k < 0) continue
      const [gone] = list.splice(k, 1)
      for (const t of ['Contact', 'Order']) for (const r of org.records[t]) if (r.AccountId === gone.Id) r.AccountId = master.Id
      for (const r of org.records.Loyalty_Member__c) if (r.Account__c === gone.Id) r.Account__c = master.Id
      for (const k2 of Object.keys(gone)) if (blank(master[k2]) && !blank(gone[k2])) master[k2] = gone[k2]
      cdcPublish(org, 'Account', 'DELETE', gone, [], adminOf(org), now)
    }
    master.LastModifiedDate = master.SystemModstamp = iso(now)
    cdcPublish(org, 'Account', 'UPDATE', master, ['LastModifiedDate'], adminOf(org), now)
  })

const tokenMail = (s, org, u, why) => {
  u.token = `labToken${org.name === 'Production' ? 'P' : 'U'}${(org.seq++ % 9000) + 1000}`
  s.mail ??= []
  s.mail.push({ t: s.clock ?? 0, to: 'ops@harbor.example', subject: 'Your new Salesforce security token', body: `${why} The security token of ${u.username} in ${org.myDomain} was reset. New security token (case sensitive): ${u.token}. Apps that log in with the old token get INVALID_LOGIN.`, source: 'Salesforce' })
  if (s.mail.length > 40) s.mail.shift()
}
// Users, Reset Password: Salesforce resets the security token too and mails it (lab made: to the operations inbox,
// which reads the mail of the integration user)
export const setPassword = (state, orgName, username, password) =>
  withOrg(state, orgName, (org, now, s) => {
    const u = userOf(org, username)
    if (!u || blank(password)) return
    Object.assign(u, { password: String(password), passwordExpires: null, failed: 0, lockedUntil: 0, passwordChangedAt: now })
    tokenMail(s, org, u, 'The password was changed, which also resets the security token.')
  })
export const resetSecurityToken = (state, orgName, username) =>
  withOrg(state, orgName, (org, now, s) => {
    const u = userOf(org, username)
    if (u) tokenMail(s, org, u, 'Reset My Security Token was used.')
  })
export const unlockUser = (state, orgName, username) =>
  withOrg(state, orgName, (org) => {
    const u = userOf(org, username)
    if (u) Object.assign(u, { lockedUntil: 0, failed: 0 })
  })
export const revokeSessions = (state, orgName, username) =>
  withOrg(state, orgName, (org, now) => {
    const u = userOf(org, username)
    if (u) u.revokedAt = now
  })
export const setUserFrozen = (state, orgName, username, frozen) =>
  withOrg(state, orgName, (org) => {
    const u = userOf(org, username)
    if (u) u.frozen = Boolean(frozen)
  })
// New User. Returns { state, errors }.
export function createUser(state, orgName, { username, name, profile, password } = {}) {
  const org = orgOf(state, orgName)
  const e = []
  const un = String(username ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(un)) e.push('Username must be in the form of an email address, for example mule.sync@harbor.example.')
  else if (userOf(org, un)) e.push(`Duplicate Username. The username already exists in this or another Salesforce organization.`)
  if (blank(name)) e.push('Enter the last name of the user.')
  if (!org?.profiles?.[profile]) e.push('Choose a profile.')
  if (blank(password) || String(password).length < 8) e.push('The password must have at least 8 characters.')
  return result(state, e, () =>
    withOrg(state, orgName, (o, now, s) => {
      const u = { username: un, name: String(name).trim(), profile, license: LICENSES[profile] ?? 'Salesforce', permsets: [], password: String(password), token: '', active: true, created: now }
      o.users.push(u)
      tokenMail(s, o, u, 'A new user was created.')
    }),
  )
}
// New Permission Set. Returns { state, errors }.
export function createPermset(state, orgName, { name, label } = {}) {
  const org = orgOf(state, orgName)
  const n = String(name ?? '').trim()
  const e = []
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n) || /__|_$/.test(n)) e.push('The API Name can only contain underscores and alphanumeric characters. It must begin with a letter, not include spaces, not end with an underscore, and not contain two consecutive underscores.')
  else if (org?.permsets?.[n]) e.push(`A permission set with the API Name ${n} already exists.`)
  return result(state, e, () => withOrg(state, orgName, (o) => void ((o.permsets ??= {})[n] = { label: String(label ?? '').trim() || n, apiEnabled: false, objects: {}, fields: {} })))
}
// System Permissions (API Enabled), Object Settings ('CRED' letters) and field permissions of a permission set or profile
export const setApiEnabled = (state, orgName, kind, name, on) =>
  withOrg(state, orgName, (o) => {
    const h = kind === 'profile' ? o.profiles[name] : o.permsets[name]
    if (h) h.apiEnabled = Boolean(on)
  })
export const setObjectAccess = (state, orgName, kind, name, type, letters) =>
  withOrg(state, orgName, (o) => {
    const h = kind === 'profile' ? o.profiles[name] : o.permsets[name]
    if (!h) return
    const set = new Set(String(letters ?? '').toUpperCase())
    // Edit needs Read, Delete needs Edit, Create needs Read (as in Setup)
    if (set.has('D')) set.add('E')
    if (set.has('E') || set.has('C')) set.add('R')
    h.objects = { ...h.objects, [type]: [...ALL].filter((c) => set.has(c)).join('') }
  })
export const setFieldAccess = (state, orgName, kind, name, type, field, level) =>
  withOrg(state, orgName, (o) => {
    const h = kind === 'profile' ? o.profiles[name] : o.permsets[name]
    if (h && LEVEL[level] !== undefined) h.fields = { ...h.fields, [`${type}.${field}`]: level }
  })
export const assignPermset = (state, orgName, username, permset, on = true) =>
  withOrg(state, orgName, (o) => {
    const u = userOf(o, username)
    if (!u || !o.permsets?.[permset]) return
    u.permsets = on ? [...new Set([...(u.permsets ?? []), permset])] : (u.permsets ?? []).filter((p) => p !== permset)
  })
// Login IP Ranges of a profile, and the trusted IP ranges of Network Access. Returns { state, errors }.
export function addIpRange(state, orgName, where, start, end) {
  const e = []
  if (!isIp(start) || !isIp(end)) e.push('Enter a valid IP address in both fields, for example 203.0.113.24.')
  else if (ipNum(end) < ipNum(start)) e.push('The end address must not be lower than the start address.')
  else if (ipNum(end) - ipNum(start) >= 33554432) e.push('The range is too large. A trusted range can hold at most 33,554,432 addresses.')
  return result(state, e, () =>
    withOrg(state, orgName, (o) => {
      const list = where === 'network' ? (o.network.trustedIps ??= []) : (o.profiles[where].loginIpRanges ??= [])
      list.push({ start: String(start).trim(), end: String(end).trim() })
    }),
  )
}
export const removeIpRange = (state, orgName, where, index) =>
  withOrg(state, orgName, (o) => {
    const list = where === 'network' ? o.network.trustedIps : o.profiles[where]?.loginIpRanges
    list?.splice(index, 1)
  })
// New Connected App (App Manager). Returns { state, errors }.
export function createConnectedApp(state, orgName, { name, email, oauth = true, certificate, scopes = [] } = {}) {
  const org = orgOf(state, orgName)
  const n = String(name ?? '').trim()
  const e = []
  if (!n) e.push('Enter a Connected App Name.')
  else if ((org?.connectedApps ?? []).some((a) => same(a.name, n))) e.push('A connected app with this name already exists.')
  if (blank(email)) e.push('Enter a Contact Email.')
  if (oauth && !scopes.length) e.push('Select at least one OAuth scope.')
  if (certificate && !(org?.certificates ?? []).some((c) => c.name === certificate)) e.push('Choose a certificate file to upload.')
  return result(state, e, () =>
    withOrg(state, orgName, (o) => {
      const cert = o.certificates.find((c) => c.name === certificate)
      o.seq++
      o.connectedApps.push({ name: n, email: String(email).trim(), consumerKey: `3MVG9lab.${n.replace(/[^A-Za-z0-9]/g, '')}.${o.seq}`, oauth: Boolean(oauth), scopes: [...scopes], certificate: cert ? { ...cert } : null, permittedUsers: 'All users may self-authorize', ipRelaxation: 'Enforce IP restrictions', profiles: [], permsets: [] })
    }),
  )
}
export const OAUTH_SCOPES = ['Manage user data via APIs (api)', 'Perform requests at any time (refresh_token, offline_access)', 'Full access (full)', 'Access the identity URL service (id, profile, email, address, phone)']
export const PERMITTED = ['All users may self-authorize', 'Admin approved users are pre-authorized']
export const IP_RELAXATION = ['Enforce IP restrictions', 'Relax IP restrictions for activated devices', 'Relax IP restrictions']
// Manage, Edit Policies; and the Profiles and Permission Sets related lists of the connected app
export const setConnectedApp = (state, orgName, appName, patch) =>
  withOrg(state, orgName, (o) => {
    const a = o.connectedApps.find((x) => x.name === appName)
    if (!a) return
    if (patch.permittedUsers && PERMITTED.includes(patch.permittedUsers)) a.permittedUsers = patch.permittedUsers
    if (patch.ipRelaxation && IP_RELAXATION.includes(patch.ipRelaxation)) a.ipRelaxation = patch.ipRelaxation
    if (patch.permsets) a.permsets = patch.permsets.filter((p) => o.permsets?.[p])
    if (patch.profiles) a.profiles = patch.profiles.filter((p) => o.profiles?.[p])
    if (patch.certificate) {
      const c = o.certificates.find((x) => x.name === patch.certificate)
      if (c) a.certificate = { ...c }
    }
  })
export const setPermittedUsers = (state, orgName, appName, permittedUsers) => setConnectedApp(state, orgName, appName, { permittedUsers })
export const abortBulkJob = (state, orgName, jobId) =>
  withOrg(state, orgName, (o) => {
    const j = jobOf(o, jobId)
    if (j && ['Open', 'UploadComplete'].includes(j.state)) Object.assign(j, { state: 'Aborted', rows: [] })
  })
export const setPublishBehavior = (state, orgName, name, publishBehavior) =>
  withOrg(state, orgName, (o) => {
    if (PUBLISH_BEHAVIORS.includes(publishBehavior)) o.eventDefs = { ...o.eventDefs, [name]: { ...o.eventDefs?.[name], publishBehavior } }
  })
// Platform Event, Subscriptions: Suspend, Resume (from where it stopped) or Resume from tip (new events only)
export const setSubscriber = (state, orgName, name, action) =>
  withOrg(state, orgName, (o, now) => {
    const sub = (o.subscribers ?? []).find((x) => x.name === name)
    if (!sub) return
    if (action === 'suspend') sub.status = 'Suspended'
    if (action === 'resume') Object.assign(sub, { status: 'Running', lastError: null, position: Math.max(sub.position, channelInfo(o, sub.channel, now).purgedUpTo) })
    if (action === 'tip') Object.assign(sub, { status: 'Running', lastError: null, position: o.replay })
  })
// The Query Editor of the Developer Console: a query counts as an API request of the admin
export function soql(state, orgName, text) {
  const org = orgOf(state, orgName)
  if (!org) return { state, result: connFail('CONNECTIVITY', 'No org') }
  const now = state.clock ?? 0
  if (apiUsage(org, now).remaining <= 0) return { state, result: LIMIT() }
  const r = runSoql(org, text, now)
  const next = withOrg(state, orgName, (o) => count(o, now, 'Developer Console', 1))
  return { state: next, result: r }
}
