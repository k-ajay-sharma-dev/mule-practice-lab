// The guided lab sf-login. See platform-labs.js for the shape of a lab.
import { at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until, withSecret } from '../platform-kit.js'
import { addIpRange, DEFAULT_IP, inRanges, INTEGRATION_USER, newOrg, newSalesforce, orgOf, setPassword, unlockUser, userOf } from '../platform-salesforce.js'
import { FLOW, NAME } from './sf-login.pkg.js'

const PROFILE = 'Brightmart Integration User'
const NEW_PASSWORD = 'Hrb-Int-Prod-27'
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const user = (s) => userOf(orgOf(s, 'Production'), INTEGRATION_USER)
const tokenOk = (s) => running(s) && props(s)['salesforce.securityToken'] === user(s)?.token
const unlocked = (s) => (user(s)?.lockedUntil ?? 0) <= s.clock
const rangeOk = (s) => inRanges(DEFAULT_IP, orgOf(s, 'Production')?.profiles?.[PROFILE]?.loginIpRanges)

function salesforce() {
  const prod = newOrg('Production', { passwordPolicy: { maxInvalid: 10, lockoutMinutes: 0 } })
  return newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox') } })
}

const lab = {
  id: 'p-sf-login',
  group: 'Salesforce and SAP',
  title: 'New password, still INVALID_LOGIN',
  minutes: 20,
  scenario: `${NAME} pushes order statuses to the Brightmart org every 5 minutes as ${INTEGRATION_USER}. The password of that user expired, so at 08:00 the Salesforce admin set a new one and sent it to the integration team, who put it in the secure property salesforce.password at 08:05. It is 09:00. Since the change every run fails with INVALID_LOGIN, and now the admin says the user is locked out.`,
  start() {
    let s = newPlatform({
      clock: at(1, 7),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': INTEGRATION_USER },
          secrets: { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
          store: {},
        }),
      ],
      salesforce: salesforce(),
    })
    s = until(s, at(1, 8))
    s = setPassword(s, 'Production', INTEGRATION_USER, NEW_PASSWORD)
    s = until(s, at(1, 8, 5))
    s = withSecret(s, NAME, 'salesforce.password', NEW_PASSWORD)
    s = until(s, at(1, 9))
    s.mail.push({ t: at(1, 8, 55), to: OPS, subject: 'mule.integration is locked out', body: `Salesforce locked ${INTEGRATION_USER} after too many failed logins. Our lockout policy is Forever, so I must unlock it in Users. Please fix the app first, or it locks the user again after ten more tries. Amira, Salesforce admin`, source: 'Amira Lund' })
    return s
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Until 08:05 the app worked with its open session. After the change each run fails with SALESFORCE:CONNECTIVITY and INVALID_LOGIN: Invalid username, password, security token; or user locked out.` },
    {
      title: 'Read the reason in Login History',
      how: 'Salesforce, Login History. The logins of the user show Invalid Password from 08:05, then Password Lockout. The API says only INVALID_LOGIN; Login History says why.',
      done: (s) => Boolean(s.seen['sf:login-history']),
    },
    ask(
      'Why the new password fails',
      'The password in the app is right. Why does the login still fail?',
      ['Salesforce needs a day before a new password works', 'Changing the password also resets the security token. From an IP outside the trusted ranges the API wants the password followed by the token, and the app still sends the old token', 'The app must use test.salesforce.com', 'The password must be Base64 encoded'],
      1,
      'For a login with username and password from outside the trusted networks, Salesforce wants the password with the security token after it. A password change or reset creates a new token and mails it to the user. The app still sent the old one, which reads as a wrong password, and after ten tries the user was locked out.',
    ),
    {
      title: 'Put the new security token in the app',
      how: `Open the mail Your new Salesforce security token in the console inbox. Runtime Manager, ${NAME}, Settings, Properties: set the secure property salesforce.securityToken to the new token. Apply Changes.`,
      done: tokenOk,
    },
    {
      title: 'Unlock the user',
      how: `Salesforce, Users. On ${INTEGRATION_USER} click Unlock. The lockout policy is Forever, so the user stays locked until an admin unlocks it.`,
      done: unlocked,
    },
    ask(
      'Logging in to the Sandbox',
      'The team points the UAT copy of the app at the Sandbox of the org. What must change in its connector config?',
      ['Nothing, the same URL and user work for every org', 'The authorization URL goes to test.salesforce.com (or the sandbox My Domain), and the username gets the sandbox suffix, here mule.integration@brightmart.example.uat, with the password and token of the sandbox user', 'Only the API version', 'The username stays, only the token changes'],
      1,
      'A sandbox is a separate org with its own users, copied from production with the sandbox name added to each username. Logins go to test.salesforce.com or the My Domain of the sandbox. Sending a sandbox username to login.salesforce.com gives INVALID_LOGIN, and the production org has no Login History line for it, because the user does not exist there.',
    ),
    {
      title: 'Allow the app IP on the profile',
      how: `Salesforce, Profiles, ${PROFILE}, Login IP Ranges. Add a range that holds the outbound IP of the app, ${DEFAULT_IP}, for example from ${DEFAULT_IP} to ${DEFAULT_IP}. Logins of this profile from anywhere else are then refused, and from this range the API needs no token.`,
      done: rangeOk,
    },
    ask(
      'Profile range or trusted range',
      'What is the difference between Login IP Ranges on a profile and Trusted IP Ranges in Network Access?',
      ['None, they are two names for one setting', 'Login IP Ranges restrict: a user of the profile can log in only from those addresses, and gets Restricted IP elsewhere. Trusted IP Ranges do not restrict, they only let users skip the security token and device activation from those addresses', 'Trusted IP Ranges apply only to the Sandbox', 'Login IP Ranges only work with OAuth'],
      1,
      'Network Access lists the networks the company trusts for every user: no token, no activation, but logins from elsewhere still work with a token. Login IP Ranges on a profile are a hard limit for the users of that profile. For an integration user that runs from known addresses, the profile range is the stronger control; the JWT bearer flow removes the password and token altogether.',
    ),
    {
      title: 'Watch the next runs',
      how: 'Move the clock 15 minutes. Login History has a Success for the user, the runs push the order status again with no error, and the user stays unlocked.',
      done: (s) => {
        if (!tokenOk(s) || !unlocked(s)) return false
        const a = app(s, NAME)
        const last = a.schedules.find((x) => x.flow === FLOW)?.last
        const ok = (orgOf(s, 'Production').loginHistory ?? []).some((l) => l.username === INTEGRATION_USER && l.status === 'Success' && l.t > a.updated)
        return s.clock >= a.updated + 10 * MINUTE && ok && Boolean(last?.ok) && last.t > a.updated
      },
    },
  ],
  why: 'A Salesforce login with username and password from an untrusted IP needs the security token after the password, and a password change resets that token. The API answers every failure with the same INVALID_LOGIN; Login History gives the reason, such as Invalid Password, Password Lockout or Restricted IP. Repeated failures lock the user, so fix the config before an admin unlocks it. A sandbox has its own login URL and usernames. Login IP Ranges on the profile limit where the user can log in from, while Trusted IP Ranges only spare the token. In the lab the app IP is fixed and only the last 40 logins are kept.',
  docs: 'https://help.salesforce.com/s/articleView?id=sf.user_security_token.htm&type=5',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), 'sf:login-history')
    const token = user(s).token
    s = change(s, NAME, { secrets: { ...app(s, NAME).secrets, 'salesforce.securityToken': token } })
    s = unlockUser(s, 'Production', INTEGRATION_USER)
    s = addIpRange(s, 'Production', PROFILE, DEFAULT_IP, DEFAULT_IP).state
    return until(s, s.clock + 15 * MINUTE)
  },
  answers: { 2: 1, 5: 1, 7: 1 },
}

export const LABS = [lab]
