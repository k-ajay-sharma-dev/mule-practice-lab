// The guided lab graph-secret-expired. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { addSecret, DAY, emptyMsgraph, guidOf, newRegistration, ORG_URL, regOf, removeSecret, rowsOf, setNotify, TENANT_ID } from '../platform-msgraph.js'
import { EXPORT } from './graph-secret-expired.pkg.js'

const APP_ID = guidOf('reg:brightmart-d365-order-export')
const ALERT_TO = 'crm-integration@brightmart.example'
const ARRIVE = at(1, 9)
const reg = (s) => regOf(s.msgraph, APP_ID)
const running = (s) => app(s, EXPORT)?.status === 'Running'
const store = (s) => app(s, EXPORT)?.store ?? {}
const live = (s) => (reg(s)?.secrets ?? []).filter((x) => x.end > s.clock)
const fresh = (s) => live(s).filter((x) => x.start >= ARRIVE && x.end > s.clock + 30 * DAY)
const stored = (s) => {
  const a = app(s, EXPORT)
  const v = a?.secrets?.['azure.clientSecret']
  return running(s) && !a.props['azure.clientSecret'] && fresh(s).some((x) => x.value === v)
}
const exported = (s) => stored(s) && (store(s).made ?? 0) > 0 && store(s).sent >= store(s).made && app(s, EXPORT).schedules[0]?.last?.ok === true && rowsOf(s.msgraph, 'salesorder').length >= store(s).made

function graph(now) {
  const m = emptyMsgraph(now)
  const t0 = at(1, 2) - 180 * DAY
  // the secret was made for 6 months and expired at 02:00 this night
  newRegistration(m, { name: EXPORT, appId: APP_ID, t: t0, secrets: [{ desc: 'mule-prod', start: t0, end: at(1, 2) }] })
  m.dv.tables.salesorder.keys.push({ name: 'brightmart_weborderid_key', cols: ['brightmart_weborderid'], status: 'Active', t: t0 })
  m.dv.roles['Brightmart Order Writer'] = { system: false, privs: { salesorder: ['Create', 'Read', 'Write'] } }
  m.dv.users.push({ id: guidOf(`user:${APP_ID}`), appId: APP_ID, name: EXPORT, roles: ['Brightmart Order Writer'], t: t0 })
  return m
}

const lab = {
  id: 'p-graph-secret-expired',
  group: 'HR, ITSM and CRM',
  title: 'The Entra client secret expired at night',
  minutes: 20,
  scenario: `${EXPORT} sends Brightmart's web orders to Dynamics 365 every 5 minutes. It signs in to Microsoft Entra ID with a client secret of its app registration. Since 02:00 every run fails and no web order reached Dynamics; the sales team works from the order lists of yesterday. Nobody got a warning. Get the orders flowing again, without downtime next time, and make sure the next expiry is seen weeks ahead.`,
  start() {
    const s = newPlatform({
      clock: at(1, 7),
      msgraph: graph(at(1, 7)),
      apps: [
        newApp(EXPORT, {
          props: { 'azure.tenantId': TENANT_ID, 'azure.clientId': APP_ID, 'dataverse.url': ORG_URL },
          secrets: { 'azure.clientSecret': '' },
          // lab-made: the orders that waited since 02:00
          store: { made: 60, sent: 0 },
        }),
      ],
      mail: [
        {
          t: at(1, 8, 55),
          to: OPS,
          subject: 'No web orders in Dynamics since the night',
          body: `Hello. Dynamics shows no web order after 01:58. The shop took about 80 orders since then. Please fix it soon, and this time set a warning on the app registration that reaches ${ALERT_TO} at least 30 days before a secret expires. Brightmart CRM team`,
          source: 'Brightmart CRM team',
        },
      ],
    })
    s.apps[0].secrets['azure.clientSecret'] = s.msgraph.apps[0].secrets[0].value
    return until(s, ARRIVE)
  },
  steps: [
    sawLogs(EXPORT),
    ask(
      'Read the AADSTS code',
      'The token call fails with AADSTS7000222. What does it say, and how is it different from AADSTS7000215?',
      [
        'Both mean the password of a user expired; reset it in the Microsoft 365 admin center',
        'AADSTS7000222: the secret value is right but its end date has passed. AADSTS7000215: the value matches no secret of the app, often because the secret ID was sent instead of the value',
        'AADSTS7000222 means admin consent was revoked',
        'AADSTS7000222 is throttling of the token endpoint; wait and retry',
      ],
      1,
      'Entra ID knows the secret, so it can tell that it expired. A wrong value gives 7000215 and its text says to send the client secret value, not the client secret ID. Neither is fixed by retries: the app needs a valid credential. Consent problems are AADSTS65001 and come later, at the permissions.',
    ),
    {
      title: 'Find the expired secret',
      how: `Dynamics and SharePoint from the console menu, App registrations tab. Open ${EXPORT} and its Certificates & secrets. The secret mule-prod shows Expired with the end date of this night.`,
      done: (s) => Boolean(s.seen[`msgraph:app:${APP_ID}`]),
    },
    {
      title: 'Add a new client secret',
      how: 'Same page, New client secret. A description such as mule-prod-2027 and an expiry of 180 days (the default Entra ID recommends). Press Add and copy the Value at once: Entra ID shows it only now. The Secret ID next to it is not the secret.',
      done: (s) => fresh(s).length > 0,
    },
    {
      title: 'Store it as a protected property',
      how: `Runtime Manager, ${EXPORT}, Settings, Properties. Set azure.clientSecret to the new value and keep it protected (secure), never a plain property or a value in the code. Apply Changes. If the logs now show AADSTS7000215, you pasted the Secret ID.`,
      done: stored,
    },
    ask(
      'Rotate without downtime',
      'Next time the team wants to rotate the secret before it expires. In what order?',
      [
        'Delete the old secret first so nobody uses it, then add the new one',
        'Add the new secret while the old one still works, put it in every app that uses the registration, check they get tokens, then delete the old secret',
        'Change the expiry date of the old secret',
        'Make a new app registration each time',
      ],
      1,
      'An app registration holds several secrets at once, and each one works until its own end date. That overlap is what makes rotation safe. The end date of a secret cannot be changed. A certificate credential or a managed identity removes the shared secret, and a secret in a vault can be rotated in one place.',
    ),
    {
      title: 'See the waiting orders arrive',
      how: `Move the clock 10 minutes. The logs of ${EXPORT} show Exported web orders to Dataverse, and the Dataverse tab, table Sales Order, holds them. The app sends up to 40 a run, so the backlog takes two runs.`,
      done: exported,
    },
    {
      title: 'Delete the expired secret',
      how: `App registrations, ${EXPORT}, Certificates & secrets. Delete mule-prod. An expired secret is of no use and only hides which credential is live.`,
      done: (s) => stored(s) && (reg(s)?.secrets ?? []).every((x) => x.end > s.clock),
    },
    {
      title: 'Warn before the next expiry',
      how: `App registrations, ${EXPORT}, Expiry alerts. Days before expiry 30, Send to ${ALERT_TO}, Save. Lab-made: in a real tenant this is a scheduled script, an Azure Monitor alert or a Logic App that reads the passwordCredentials of the app.`,
      done: (s) => (reg(s)?.notify?.days ?? 0) >= 30 && String(reg(s)?.notify?.to ?? '').toLowerCase().includes(ALERT_TO),
    },
  ],
  why: `A client secret has an end date, and when it passes the token call fails with AADSTS7000222 and every call to Dataverse stops. Retries cannot fix it. Add a new secret, copy its value (shown once, and not the Secret ID, which gives AADSTS7000215), store it as a protected property or in a vault, restart the app and watch the backlog drain. Rotate with overlap: new secret first, then every app, then delete the old one. Put a warning on the expiry weeks ahead, and prefer a certificate or a managed identity where you can. In the lab the expiry alert is a setting of the app registration screen.`,
  docs: 'https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes',
  solve(start) {
    let s = mark(start, `logs:${EXPORT}`)
    s = mark(s, `msgraph:app:${APP_ID}`)
    const r = addSecret(s, APP_ID, { desc: 'mule-prod-2027', days: 180 })
    s = r.state
    s = change(s, EXPORT, { secrets: { ...app(s, EXPORT).secrets, 'azure.clientSecret': r.result.value } })
    s = advance(s, 11 * MINUTE)
    s = removeSecret(s, APP_ID, reg(s).secrets.find((x) => x.end <= s.clock).id).state
    return setNotify(s, APP_ID, { days: 30, to: ALERT_TO }).state
  },
  answers: { 1: 1, 5: 1 },
}

export const LABS = [lab]
