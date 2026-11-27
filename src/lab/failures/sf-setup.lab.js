// The guided lab sf-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, at, deployApp, finishDeploys, MINUTE, mark, newPlatform, runNow } from '../platform.js'
import { app, OPS, until } from '../platform-kit.js'
import { accessOf, apiEnabled, assignPermset, createConnectedApp, createPermset, createUser, newOrg, newSalesforce, objectAccess, orgOf, setApiEnabled, setConnectedApp, setFieldAccess, setObjectAccess, BASE } from '../platform-salesforce.js'
import { MEMBERS, NAME, SYNC, TEST } from './sf-setup.pkg.js'

const ORG = 'Production'
const CERT = 'brightmart-loyalty-jwt-2027'
const PROFILE = 'Brightmart Integration User'
const OLD_USERS = ['mule.integration@brightmart.example', 'amira.lund@brightmart.example', 'sales.ops@brightmart.example']
const FIELDS = ['Brightmart_Customer_Id__c', 'Loyalty_Tier__c']
const org = (s) => orgOf(s, ORG)
const newUser = (s) => (org(s)?.users ?? []).find((u) => u.profile === PROFILE && !OLD_USERS.includes(u.username))
// a permission set that holds what the sync needs: API Enabled, Account read, create and edit, edit on the two fields
const grants = (o, p) => {
  const h = o?.permsets?.[p]
  if (!h?.apiEnabled) return false
  const fake = { username: '-', profile: '-', permsets: [p] }
  return ['R', 'C', 'E'].every((c) => objectAccess(o, fake, 'Account').includes(c)) && FIELDS.every((f) => accessOf(o, fake, 'Account', f) === 'edit')
}
const permsetOk = (s) => Object.keys(org(s)?.permsets ?? {}).some((p) => p !== 'Brightmart_Mule_Integration' && grants(org(s), p))
const userOk = (s) => {
  const u = newUser(s)
  return Boolean(u) && apiEnabled(org(s), u) && (u.permsets ?? []).some((p) => grants(org(s), p))
}
const capp = (s) => (org(s)?.connectedApps ?? []).find((a) => a.oauth && a.certificate?.name === CERT && a.scopes.includes('Manage user data via APIs (api)'))
const approvedOk = (s) => {
  const a = capp(s)
  const u = newUser(s)
  return Boolean(a && u) && a.permittedUsers === 'Admin approved users are pre-authorized' && (a.profiles.includes(u.profile) || (u.permsets ?? []).some((p) => a.permsets.includes(p)))
}
const props = (s) => app(s, NAME)?.props ?? {}
const deployOk = (s) => {
  const a = app(s, NAME)
  const p = props(s)
  const url = (k) => String(p[k] ?? '').trim().replace(/\/$/, '')
  return a?.status === 'Running' && String(p['salesforce.auth']).trim() === 'jwt' && url('salesforce.url') === 'https://login.salesforce.com' && url('salesforce.audienceUrl') === 'https://login.salesforce.com' && String(p['salesforce.consumerKey'] ?? '').trim() === capp(s)?.consumerKey && String(p['salesforce.keyStore'] ?? '').includes(CERT) && String(p['salesforce.principal'] ?? '').trim().toLowerCase() === newUser(s)?.username && Boolean(a.secrets?.['salesforce.keyStorePassword']) && !('salesforce.keyStorePassword' in p)
}

function salesforce() {
  // a new integration: no connected app for it yet, and the certificate of its keystore ready to upload
  const prod = newOrg(ORG, { connectedApps: [], certificates: [{ name: CERT, expires: Date.UTC(2027, 10, 30) - BASE }] })
  return newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox') } })
}

const lab = {
  id: 'p-sf-setup',
  group: 'Salesforce and SAP',
  title: 'Set up a Salesforce integration with the JWT bearer flow',
  minutes: 35,
  scenario: `Brightmart starts a loyalty program, and ${NAME} must send the loyalty members to the Brightmart org as Accounts, upserted on Brightmart_Customer_Id__c with their Loyalty_Tier__c. Nothing exists yet for it in Salesforce: no user, no permission set, no connected app. The keystore ${CERT}.jks is packed in the app, and the security team put its certificate ${CERT}.crt in the org. It is Tuesday 09:00. Set it up the way it should run in production: its own API only user with a permission set, OAuth JWT bearer through a connected app, secrets protected, a tested connection, a first sync and an alert.`,
  start() {
    return newPlatform({ clock: at(1, 9), apps: [], jars: [NAME], salesforce: salesforce() })
  },
  steps: [
    {
      title: 'Create the integration user',
      how: `Salesforce, Users, New User. Last Name Loyalty Sync, Username mule.loyalty@brightmart.example, Profile ${PROFILE} (API only, with no object access of its own), a password of at least 8 characters. Save.`,
      done: (s) => Boolean(newUser(s)),
    },
    {
      title: 'Create a permission set with what the sync needs',
      how: 'Salesforce, Permission Sets, New: Label Loyalty Sync Integration, API Name Loyalty_Sync_Integration. Open it. Tick API Enabled. In Object Settings tick Read, Create and Edit on Account. In Field Permissions for Account tick Read Access and Edit Access on Brightmart_Customer_Id__c and Loyalty_Tier__c. Nothing more: least privilege.',
      done: permsetOk,
    },
    {
      title: 'Assign the permission set',
      how: 'Salesforce, Users. On mule.loyalty@brightmart.example choose Loyalty_Sync_Integration and click Add Assignment.',
      done: userOk,
    },
    {
      title: 'Create the connected app',
      how: `Salesforce, App Manager, New Connected App. Name Brightmart Loyalty Sync, a Contact Email, tick Enable OAuth Settings, choose the certificate ${CERT}.crt for Use digital signatures, and select the scope Manage user data via APIs (api). Save. Open the app and click Manage Consumer Details to read the consumer key.`,
      done: (s) => Boolean(capp(s)),
    },
    {
      title: 'Pre-authorize the integration user',
      how: 'On the connected app, OAuth Policies: set Permitted Users to Admin approved users are pre-authorized. In Permission Sets tick Loyalty Sync Integration. The JWT flow has no login page, so without this the token request fails.',
      done: approvedOk,
    },
    {
      title: 'Deploy the app with its config',
      how: `Runtime Manager, Deploy application. Name ${NAME}, file ${NAME}-1.0.0-mule-application.jar. Properties: salesforce.auth jwt, salesforce.url https://login.salesforce.com, salesforce.audienceUrl https://login.salesforce.com, salesforce.consumerKey the consumer key, salesforce.keyStore ${CERT}.jks, salesforce.principal mule.loyalty@brightmart.example. Add salesforce.keyStorePassword (any value in the lab) and click Protect, so it is a secure property. Deploy Application.`,
      done: deployOk,
    },
    {
      title: 'Test the connection',
      how: `Runtime Manager, ${NAME}, Schedules. Tick ${TEST} and click Run. The log says Test Connection: connection is valid, and Salesforce Login History shows a Success of subtype OAuth JWT Bearer.`,
      done: (s) => {
        const x = app(s, NAME)?.schedules.find((y) => y.flow === TEST)?.last
        return deployOk(s) && Boolean(x?.ok) && x.t >= app(s, NAME).updated
      },
    },
    {
      title: 'Sync the first members and see them in the org',
      how: `${SYNC} runs every 5 minutes. Move the clock 5 minutes, then open Salesforce, Accounts (or run SELECT Name, Brightmart_Customer_Id__c, Loyalty_Tier__c FROM Account WHERE Brightmart_Customer_Id__c LIKE 'HC-3%' in the Developer Console). ${MEMBERS.map((m) => m.Name).join(', ')} are there with their tiers.`,
      done: (s) => deployOk(s) && Boolean(s.seen['sf:accounts'] || s.seen['sf:soql']) && MEMBERS.every((m) => (org(s)?.records.Account ?? []).some((r) => r.Brightmart_Customer_Id__c === m.Brightmart_Customer_Id__c && r.Loyalty_Tier__c === m.Loyalty_Tier__c && r.LastModifiedBy === newUser(s)?.username)),
    },
    {
      title: 'Alert on failures',
      how: `Anypoint Monitoring, Alerts, Create Alert: resource type Application, application ${NAME}, metric Message Error Count, Above 0 for 1 minute, recipient ${OPS}. A failed sync then reaches the team.`,
      done: (s) => s.monAlerts.some((a) => a.enabled && a.name_ === NAME && a.metric === 'Message Error Count' && ['Above', 'Above or equal to'].includes(a.operator) && Number(a.threshold) <= (a.operator === 'Above' ? 0 : 1) && a.recipients),
    },
  ],
  why: 'An integration gets its own user with an API only profile and a permission set that grants API Enabled and only the objects and fields it needs, so its access is visible and can be revoked in one place. The OAuth JWT bearer flow logs it in without a password: the app signs with the private key of its keystore, the connected app holds the certificate, and an admin pre-authorizes the user through the permission set. On the Anypoint side the keystore password is a secure property, the config names the login URL, consumer key, keystore and principal, a connection test proves the login before data moves, and an alert on the error count tells the team when a sync fails. In the lab the keystore file name stands for its key and the certificate is already in the org.',
  docs: 'https://docs.mulesoft.com/salesforce-connector/latest/salesforce-connector-config-topics',
  solve(start) {
    let s = createUser(start, ORG, { username: 'mule.loyalty@brightmart.example', name: 'Loyalty Sync', profile: PROFILE, password: 'Loyalty-Sync-26' }).state
    s = createPermset(s, ORG, { label: 'Loyalty Sync Integration', name: 'Loyalty_Sync_Integration' }).state
    s = setApiEnabled(s, ORG, 'permset', 'Loyalty_Sync_Integration', true)
    s = setObjectAccess(s, ORG, 'permset', 'Loyalty_Sync_Integration', 'Account', 'RCE')
    for (const f of FIELDS) s = setFieldAccess(s, ORG, 'permset', 'Loyalty_Sync_Integration', 'Account', f, 'edit')
    s = assignPermset(s, ORG, 'mule.loyalty@brightmart.example', 'Loyalty_Sync_Integration')
    s = createConnectedApp(s, ORG, { name: 'Brightmart Loyalty Sync', email: OPS, oauth: true, certificate: CERT, scopes: ['Manage user data via APIs (api)'] }).state
    s = setConnectedApp(s, ORG, 'Brightmart Loyalty Sync', { permittedUsers: 'Admin approved users are pre-authorized', permsets: ['Loyalty_Sync_Integration'] })
    const key = capp(s).consumerKey
    const form = { name: NAME, pkg: NAME, jar: `${NAME}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props: { 'salesforce.auth': 'jwt', 'salesforce.url': 'https://login.salesforce.com', 'salesforce.audienceUrl': 'https://login.salesforce.com', 'salesforce.consumerKey': key, 'salesforce.keyStore': `${CERT}.jks`, 'salesforce.principal': 'mule.loyalty@brightmart.example' }, secrets: { 'salesforce.keyStorePassword': 'lab-keystore' } }
    s = finishDeploys(deployApp(s, form).state)
    s = runNow(s, NAME, TEST)
    s = until(s, s.clock + 6 * MINUTE)
    s = mark(s, 'sf:accounts')
    return addMonAlert(s, { title: 'Loyalty sync failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
  },
  answers: {},
}

export const LABS = [lab]
