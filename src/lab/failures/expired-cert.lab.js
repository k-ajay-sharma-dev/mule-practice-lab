// The guided lab expired-cert. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, call, OPS, propsValue, withProp, withSecret } from '../platform-kit.js'

const NAME = 'payments-sapi'
const NEW_STORE = 'bank-2026.jks'
const NEW_PASSWORD = 'Trust-Lab-2026'
const pay = (s) => call(s, NAME, null, '/payments', 'POST', '{"amount":120.5,"currency":"EUR"}')

const insecureOff = (s) => String(propsValue(app(s, NAME), 'tls.insecure') ?? '').trim() !== 'true'
const newTrust = (s) => {
  const a = app(s, NAME)
  return a?.status === 'Running' && propsValue(a, 'tls.truststore') === NEW_STORE && a.secrets['tls.truststore.password'] === NEW_PASSWORD && !a.props['tls.truststore.password']
}
// the last call of the API client came after the last change of the application
const lastCall = (s) => (s.lastCalls ?? []).filter((c) => c.app === NAME).at(-1)

const lab = {
  id: 'p-fail-expired-cert',
  group: 'More production failures',
  title: 'The bank certificate expired',
  minutes: 10,
  scenario: `${NAME} sends payments to the bank at https://api.pay.northbank.lab. Since this morning every payment fails with 500. The bank replaced its server certificate last night. Look in the Inbox: the bank and the integration team both wrote.`,
  start: () =>
    newPlatform({
      clock: at(1, 9),
      apps: [
        newApp(NAME, {
          props: { 'bank.url': 'https://api.pay.northbank.lab', 'tls.truststore': 'bank-2025.jks', 'tls.insecure': 'false' },
          secrets: { 'tls.truststore.password': 'Trust-Lab-2025' },
        }),
      ],
      mail: [
        { t: at(0, 10), to: OPS, subject: 'North Bank: server certificate rotation', body: 'Our server certificate for api.pay.northbank.lab expires on 2 November. On 2 November at 23:00 we switch to a new certificate issued by North Bank Lab Root CA G3. The new chain is attached. Add it to your truststore before the switch.', source: 'North Bank' },
        { t: at(0, 15), to: OPS, subject: 'payments-sapi: new truststore ready', body: `We built ${NEW_STORE} from the new North Bank chain. It is packed in the current release of ${NAME}. To use it set tls.truststore to ${NEW_STORE}, and set tls.truststore.password to the practice password ${NEW_PASSWORD} as a protected property.`, source: 'Integration team' },
      ],
    }),
  steps: [
    { title: 'Call the API', how: `API client, ${NAME}, POST /payments. You get 500.`, done: (s) => (s.lastCalls ?? []).some((c) => c.app === NAME) },
    { title: 'Search the logs', how: `Monitoring, Log Search. Search for log-level: ERROR AND appId: ${NAME}, or for PKIX.`, done: (s) => Object.keys(s.seen).some((k) => k.startsWith('logsearch:') && /payments-sapi|pkix|certification/i.test(k)) },
    ask(
      'Read the error',
      'The block says HTTP:CONNECTIVITY with PKIX path building failed: unable to find valid certification path to requested target. What does it mean?',
      ['The bank is down', 'The TLS handshake failed because no certificate in our truststore signs the chain the bank now sends', 'The truststore password is wrong', 'The bank refused our client ID'],
      1,
      'The connection reached the bank. Java could not build a path from the new certificate to a certificate it trusts, so it ended the handshake. The truststore still holds the old chain.',
    ),
    { title: 'Read the mails', how: 'Open the Inbox from the menu. The bank sent the new chain and the integration team says which file holds it.', done: (s) => Boolean(s.seen.inbox) },
    ask(
      'The quick fix',
      'A teammate wants to set tls.insecure to true, which puts insecure="true" on the trust store. Why not in production?',
      ['It makes calls slower', 'It turns off certificate validation, so any server can pretend to be the bank', 'It only works in Sandbox', 'It needs a restart every day'],
      1,
      'With insecure true Mule stops validating certificates. The payments would go through, and so would a call to a server that pretends to be the bank. MuleSoft says to use it only for prototypes and tests.',
    ),
    {
      title: 'Point to the new truststore',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set tls.truststore to ${NEW_STORE}. Set tls.truststore.password as a protected property. Apply Changes. In a real runtime a wrong path or password stops the application at start; here the call fails.`,
      done: newTrust,
    },
    { title: 'Keep validation on', how: 'tls.insecure stays false. The fix is a truststore that trusts the new chain, not a context that trusts everything.', done: (s) => newTrust(s) && insecureOff(s) },
    { title: 'Call it again', how: 'API client, POST /payments. You get 200 with a payment ID.', done: (s) => newTrust(s) && insecureOff(s) && lastCall(s)?.status === 200 && lastCall(s).t >= app(s, NAME).updated },
  ],
  why: 'A PKIX error is a trust problem and not a network problem. When a partner rotates its certificate, put the new chain in the truststore before the switch date and keep validation on. In this lab the new file is already packed in the application, so a property change is enough; in a real project you add the file to the project and deploy a new version.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/tls-configuration',
  solve(start) {
    let s = pay(start).state
    s = mark(mark(s, 'logsearch'), `logsearch:log-level: ERROR AND appId: ${NAME}`)
    s = mark(s, 'inbox')
    s = withProp(s, NAME, 'tls.truststore', NEW_STORE)
    s = withSecret(s, NAME, 'tls.truststore.password', NEW_PASSWORD)
    return pay(s).state
  },
  answers: { 2: 1, 4: 1 },
}

export const LABS = [lab]
