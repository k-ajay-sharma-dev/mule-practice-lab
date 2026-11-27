// The guided lab sf-jwt-bearer. See platform-labs.js for the shape of a lab.
import { at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, sawLogs, until } from '../platform-kit.js'
import { BASE, INTEGRATION_USER, newOrg, newSalesforce, orgOf, setConnectedApp, userOf } from '../platform-salesforce.js'
import { FLOW, NAME } from './sf-jwt-bearer.pkg.js'

const APP = 'Brightmart MuleSoft Integration'
const NEW_CERT = 'brightmart-mule-jwt-2027'
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const capp = (s) => orgOf(s, 'Production')?.connectedApps.find((a) => a.name === APP)
const audienceOk = (s) => running(s) && String(props(s)['salesforce.audienceUrl'] ?? '').trim().replace(/\/$/, '') === 'https://login.salesforce.com'
const certOk = (s) => capp(s)?.certificate?.name === NEW_CERT
const approvedOk = (s) => {
  const a = capp(s)
  const u = userOf(orgOf(s, 'Production'), INTEGRATION_USER)
  return a?.permittedUsers === 'Admin approved users are pre-authorized' && (a.profiles.includes(u.profile) || u.permsets.some((p) => a.permsets.includes(p)))
}

function salesforce() {
  const old = { name: 'brightmart-mule-jwt-2026', expires: Date.UTC(2026, 9, 31) - BASE }
  const neu = { name: NEW_CERT, expires: Date.UTC(2027, 9, 31) - BASE }
  const prod = newOrg('Production')
  Object.assign(prod.connectedApps[0], { certificate: old, permittedUsers: 'All users may self-authorize', permsets: [], profiles: [] })
  prod.certificates = [old, neu]
  return newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox') } })
}

const lab = {
  id: 'p-sf-jwt-bearer',
  group: 'Salesforce and SAP',
  title: 'The JWT bearer flow works in the Sandbox only',
  minutes: 20,
  scenario: `${NAME} reads customer Accounts for the credit check. Last week the team moved it from username and password to the OAuth JWT bearer flow, with a new keystore ${NEW_CERT}.jks, and tested it in the Sandbox. It is Tuesday 09:00 and the app went to Production at 08:00. Every run fails while getting the access token. The connected app ${APP} in Production was set up two years ago by someone who has left.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.auth': 'jwt', 'salesforce.url': 'https://login.salesforce.com', 'salesforce.audienceUrl': 'https://test.salesforce.com', 'salesforce.consumerKey': '3MVG9lab.BrightmartMule.Prod', 'salesforce.keyStore': `${NEW_CERT}.jks`, 'salesforce.principal': INTEGRATION_USER },
          secrets: { 'salesforce.keyStorePassword': 'lab-keystore' },
          store: {},
        }),
      ],
      salesforce: salesforce(),
    })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Each run fails with SALESFORCE:CONNECTIVITY: Failed to get access token, HTTP 400 invalid_grant.` },
    {
      title: 'Read the failed logins',
      how: 'Salesforce, Login History. The logins of type Remote Access 2.0, subtype OAuth JWT Bearer, show why each token request failed. Change one thing at a time and look again: the reason moves to the next check.',
      done: (s) => Boolean(s.seen['sf:login-history']),
    },
    ask(
      'How Salesforce checks the JWT',
      'In the JWT bearer flow, what does Salesforce check before it gives the app an access token?',
      ['The password and the security token of the user', 'The signature, with the certificate uploaded to the connected app; iss, the consumer key of that app; aud, the login URL of the org (login.salesforce.com or test.salesforce.com); sub, a user who is pre-authorized for the app; and that the JWT has not expired', 'Only that the consumer secret is right', 'That the app runs on a trusted IP'],
      1,
      'The app signs the JWT with its private key. Salesforce verifies the signature with the certificate of the connected app named by iss, checks that aud is its own login URL, and that the user in sub may use the app without approving it, since there is no login page. No password or token is sent.',
    ),
    {
      title: 'Fix the audience',
      how: `Runtime Manager, ${NAME}, Settings, Properties. The config was copied from the Sandbox: set salesforce.audienceUrl to https://login.salesforce.com, the login URL of Production. Apply Changes.`,
      done: audienceOk,
    },
    {
      title: 'Upload the new certificate',
      how: `Salesforce, App Manager, ${APP}. Use digital signatures shows brightmart-mule-jwt-2026, which expired on 31 October and does not match the new key anyway. In Upload a certificate choose ${NEW_CERT}.crt, the public half of the new keystore.`,
      done: certOk,
    },
    ask(
      'No one to approve',
      "The next error is invalid_grant: user hasn't approved this consumer. Why?",
      ['The user typed the wrong password', 'Permitted Users is All users may self-authorize, which needs the user to approve the app once on a login page. The JWT bearer flow has no login page, so the user must be pre-authorized by an admin through a profile or permission set', 'The consumer key is wrong', 'The certificate is still the old one'],
      1,
      "With All users may self-authorize each user approves the app in a browser the first time. A server to server JWT login never shows that page, so it fails with user hasn't approved this consumer. Set Admin approved users are pre-authorized and add the profile or a permission set of the integration user to the app.",
    ),
    {
      title: 'Pre-authorize the integration user',
      how: `On ${APP}, OAuth Policies: set Permitted Users to Admin approved users are pre-authorized. In Permission Sets tick Brightmart Mule Integration, the permission set of ${INTEGRATION_USER}.`,
      done: approvedOk,
    },
    ask(
      'Why JWT at all',
      'Why move an integration from username, password and token to the JWT bearer flow?',
      ['It is faster for each query', 'No password or token is stored in the app, so a password change or expiry cannot break it, and access is controlled in the connected app: certificate, pre-authorized users, scopes and IP policy. The certificate must still be renewed before it expires', 'It needs no connected app', 'It avoids the API request limit'],
      1,
      'Password logins break on every password change and token reset, and the password sits in the app. With JWT the app holds a private key, the org holds the certificate, and an admin decides which users the app may act as. Put a reminder on the certificate expiry date, because an expired certificate stops the flow.',
    ),
    {
      title: 'Watch the next runs',
      how: 'Move the clock 10 minutes. Login History has a Success with subtype OAuth JWT Bearer, and the runs read the accounts with no error.',
      done: (s) => {
        if (!audienceOk(s) || !certOk(s) || !approvedOk(s)) return false
        const a = app(s, NAME)
        const fixed = Math.max(a.updated, ...(orgOf(s, 'Production').loginHistory ?? []).filter((l) => l.status !== 'Success').map((l) => l.t))
        const ok = (orgOf(s, 'Production').loginHistory ?? []).some((l) => l.loginSubtype === 'OAuth JWT Bearer' && l.status === 'Success' && l.t >= fixed)
        const last = a.schedules.find((x) => x.flow === FLOW)?.last
        return s.clock >= a.updated + 5 * MINUTE && ok && Boolean(last?.ok) && last.t >= fixed
      },
    },
  ],
  why: 'The OAuth JWT bearer flow logs an integration in without a password: the app signs a JWT with its private key, and Salesforce checks it against the certificate of the connected app, the consumer key in iss, the login URL in aud and a pre-authorized user in sub. A config copied from the Sandbox keeps test.salesforce.com as the audience. A new keystore needs its certificate uploaded to the connected app, and an expired one fails the check. The flow has no login page, so Permitted Users must be Admin approved users are pre-authorized with the profile or permission set of the user. In the lab the keystore file name stands for the key it holds and no real signing happens.',
  docs: 'https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_jwt_flow.htm&type=5',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), 'sf:login-history')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'salesforce.audienceUrl': 'https://login.salesforce.com' } })
    s = setConnectedApp(s, 'Production', APP, { certificate: NEW_CERT, permittedUsers: 'Admin approved users are pre-authorized', permsets: ['Brightmart_Mule_Integration'] })
    return until(s, s.clock + 11 * MINUTE)
  },
  answers: { 2: 1, 5: 1, 7: 1 },
}

export const LABS = [lab]
