// The guided lab access-connected-app. See platform-labs.js for the shape of a lab.
import { at, mark, newPlatform } from '../platform.js'
import { ask, OPS } from '../platform-kit.js'
import { accessOf, addScopes, createConnectedApp, leastScopes, newAccess, pipelineMissing, revokeOldSecret, rotateSecret, runPipeline, setPipelineAuth, setUserEnabled, user } from '../platform-access.js'

const PROJECT = 'orders-sync-papi'
const MARCO = 'm.reyes'
const ci = (s) => accessOf(s).ci
// a connected app that acts on its own behalf and holds what the pipeline needs, and no more
const goodApps = (s) => accessOf(s).apps.filter((x) => x.type === 'client_credentials' && pipelineMissing(s, x.clientId).length === 0 && leastScopes(x))
const used = (s) => {
  const auth = ci(s)?.auth
  return auth?.type === 'connected-app' ? goodApps(s).find((x) => x.clientId === auth.clientId) : null
}
const passed = (s, after = -1) => (ci(s)?.runs ?? []).some((r) => r.status === 'Succeeded' && r.by.startsWith('connected app') && r.n > after)

const lab = {
  id: 'p-access-connected-app',
  group: 'Governance and access',
  title: 'The pipeline logged in as someone who left',
  minutes: 20,
  scenario: `The CI pipeline of ${PROJECT} publishes to Exchange and deploys to Sandbox and Production in the Ecommerce business group. It logs in with the Anypoint username and password of Marco Reyes. Marco left Harbor on Friday and his account was disabled. Since then every run fails with 401. Move the pipeline to a login that belongs to no person.`,
  start() {
    const clock = at(1, 9)
    const access = newAccess(at(0, 9), {
      users: [...newAccess().users, user(MARCO, 'Marco Reyes', { bg: 'ecom', password: 'lab-pass-mr' })],
      ci: { name: `${PROJECT} pipeline`, project: PROJECT, auth: { type: 'user', username: MARCO, password: 'lab-pass-mr' }, runs: [] },
    })
    let s = newPlatform({ clock: at(0, 22), access })
    s = runPipeline(s)
    s = setUserEnabled({ ...s, clock: at(0, 23) }, MARCO, false)
    s = runPipeline({ ...s, clock: at(1, 8, 15) })
    s.mail.push({
      t: at(1, 8, 20),
      to: OPS,
      subject: `${PROJECT} pipeline is red`,
      body: 'Hi, the morning run of the orders sync pipeline failed with 401 Unauthorized, and nothing reaches Production. Nobody changed the pipeline. Can you look? Ana, release manager',
      source: 'Ana Moreau, Release',
    })
    return { ...s, clock }
  },
  steps: [
    { title: 'Read the mail from release', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Read the failed run', how: 'Access Management, CI pipeline (lab tool). Open the last run and read the login line and the error.', done: (s) => Boolean(s.seen['access:ci']) },
    ask(
      'Why the pipeline gets 401',
      'The run logs in as m.reyes and gets 401 Unauthorized. Why?',
      [
        'The token endpoint is down',
        'The pipeline used the personal account of Marco. When he left, his account was disabled, so his username and password no longer log in, and everything tied to him stops',
        'Production needs a second factor',
        'The project has the wrong version',
      ],
      1,
      'A personal login in automation breaks the day the person leaves, changes the password or turns on multi factor authentication. It also means every deploy in the audit log looks like Marco did it.',
    ),
    {
      title: 'Create a connected app for the pipeline',
      how: 'Access Management, Connected Apps, Create app. Name it orders-sync-ci, choose App acts on its own behalf (client credentials) and press Save. Open it and press Add Scopes: Exchange Contributor for business group Ecommerce, and View Environment, Runtime Manager: Read Applications, Runtime Manager: Create Applications and Runtime Manager: Manage Applications for Ecommerce, environments Sandbox and Production. Press Add Scopes in the dialog.',
      done: (s) => Boolean(s.seen['access:connected-apps']) && goodApps(s).length > 0,
    },
    {
      title: 'Give the pipeline the client ID and secret',
      how: 'Copy the Client ID and Client Secret from the connected app. In CI pipeline (lab tool) choose Connected app, paste both and press Save.',
      done: (s) => Boolean(used(s)) && used(s).secrets.includes(ci(s).auth.clientSecret),
    },
    { title: 'Run the pipeline', how: 'CI pipeline (lab tool), Run pipeline. The log shows the token request, then BUILD SUCCESS.', done: (s) => Boolean(used(s)) && passed(s) },
    {
      title: 'Rotate the secret',
      how: 'You pasted the first secret into the ticket while you set this up, so it must change. In the connected app press Rotate Secret, put the new secret into the pipeline and Save, Run pipeline, then press Revoke Old Secret.',
      done: (s) => {
        const app = used(s)
        return Boolean(app) && app.rotated > 0 && app.secrets.length === 1 && ci(s).auth.clientSecret === app.secrets[0] && passed(s, app.rotatedAt)
      },
    },
    ask(
      'A connected app, not a user',
      'Why is a connected app with client credentials the right login for a pipeline?',
      [
        'It never needs a secret',
        'It belongs to no person, so it survives people leaving. It holds only the scopes it needs, in the business groups and environments you choose, it shows up by name in the audit log, and its secret can be rotated without touching anyone',
        'It is the only login that can reach Production',
        'It gives Organization Administrator rights to the pipeline',
      ],
      1,
      'Client credentials is the OAuth 2.0 grant for a machine acting for itself. The pipeline posts the client ID and secret to the token endpoint and gets a bearer token. The Mule Maven plugin takes them as connectedAppClientId, connectedAppClientSecret and connectedAppGrantType client_credentials.',
    ),
    ask(
      'Where the secret lives',
      'Where should the pipeline keep the client secret?',
      [
        'In pom.xml in the repository, next to the other plugin settings',
        'In the secret store of the CI system as a masked variable, referenced from settings.xml or the pom as a property, so it never lands in Git or in the build log',
        'In the README of the project',
        'In a comment in the Mule configuration',
      ],
      1,
      'Anything in the repository stays in its history. A masked secret of the CI system can be rotated in one place, which is what you did here.',
    ),
  ],
  why: 'Automation must not log in as a person. In Anypoint Access Management create a connected app of the type App acts on its own behalf (client credentials), give it only the scopes it needs, per business group and environment, and give the pipeline its client ID and secret from a secret store. The pipeline gets a token from https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token with grant_type client_credentials. Rotate the secret when it may have leaked or on a schedule: put the new secret in place, then revoke the old one. In the lab the CI pipeline is a lab tool and the list of scopes it needs is lab-made.',
  docs: 'https://docs.mulesoft.com/access-management/connected-apps-overview',
  solve(start) {
    let s = mark(mark(start, 'inbox'), 'access:ci')
    s = mark(s, 'access:connected-apps')
    const made = createConnectedApp(s, { name: 'orders-sync-ci', type: 'client_credentials' })
    s = addScopes(made.state, made.clientId, [
      { scope: 'Exchange Contributor', bg: 'ecom' },
      ...['Sandbox', 'Production'].flatMap((env) => ['View Environment', 'Runtime Manager: Read Applications', 'Runtime Manager: Create Applications', 'Runtime Manager: Manage Applications'].map((scope) => ({ scope, bg: 'ecom', env }))),
    ])
    const secret = () => accessOf(s).apps.find((x) => x.clientId === made.clientId).secrets[0]
    s = runPipeline(setPipelineAuth(s, { type: 'connected-app', clientId: made.clientId, clientSecret: secret() }))
    s = rotateSecret(s, made.clientId)
    s = runPipeline(setPipelineAuth(s, { type: 'connected-app', clientId: made.clientId, clientSecret: secret() }))
    return revokeOldSecret(s, made.clientId)
  },
  answers: { 2: 1, 7: 1, 8: 1 },
}

export const LABS = [lab]
