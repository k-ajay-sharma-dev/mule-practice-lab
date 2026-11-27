// The guided lab sec-mtls. See platform-labs.js for the shape of a lab.
import { advance, at, internalOf, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, call, change, OPS, propsValue, sawLogs, until } from '../platform-kit.js'
import { PARTNERS, STORES } from './sec-mtls.pkg.js'

const PAPI = 'b2b-orders-papi'
const SAPI = 'b2b-orders-sapi'
const value = (s, name, key) => String(propsValue(app(s, name), key) ?? '').trim()
const running = (s, name) => app(s, name)?.status === 'Running'
// a password set as a protected property, and not as a plain one
const secret = (s, name, key, file) => app(s, name)?.secrets[key] === STORES[file].password && !app(s, name).props[key]

const partnerTrust = (s) => running(s, PAPI) && value(s, PAPI, 'tls.truststore') === 'partners-2026.jks' && secret(s, PAPI, 'tls.truststore.password', 'partners-2026.jks')
const clientKey = (s) =>
  running(s, PAPI) && value(s, PAPI, 'sapi.tls.keystore') === 'orders-papi-client.jks' && value(s, PAPI, 'sapi.tls.keyAlias') === 'orders-papi-client' && secret(s, PAPI, 'sapi.tls.keystore.password', 'orders-papi-client.jks')
const sapiMutual = (s) => running(s, SAPI) && value(s, SAPI, 'tls.truststore') === 'internal-ca.jks' && secret(s, SAPI, 'tls.truststore.password', 'internal-ca.jks')
// calls of one partner since a time
const since = (s, partner, t) => s.events.filter((e) => e.k === 'in' && e.app === PAPI && e.env === 'Sandbox' && e.c === partner.name && e.t > t)
const updated = (s, ...names) => Math.max(...names.map((n) => app(s, n)?.updated ?? Infinity))

const MAIL_BAYLINE = {
  t: at(1, 8, 20),
  to: OPS,
  subject: 'Bayline Logistics: our calls to your order API fail',
  body: 'Hello Brightmart, since our go live this morning every call to b2b-orders-papi ends during the TLS handshake. We send our client certificate CN=bayline-orders. It is issued by Bayline Issuing CA G2, which is issued by Bayline Root CA. The chain is attached. Bayline integration team',
  source: 'Bayline Logistics',
}
const MAIL_TEAM = {
  t: at(1, 8, 45),
  to: OPS,
  subject: 'b2b-orders-papi and b2b-orders-sapi: stores for mutual TLS',
  body: [
    'The current release of both applications already holds these files:',
    'partners-2026.jks: brightmart-partner-ca and bayline-root-ca. Practice password Partners-Lab-26.',
    'orders-papi-client.jks: the key orders-papi-client, issued by Brightmart Internal CA, and the old key orders-papi-client-2025, issued by a CA we retired. Practice password Papi-Client-26.',
    'internal-ca.jks: brightmart-internal-ca. Practice password Internal-Lab-26.',
    'Reminder from the platform security standard: from this week every call from a Process API to a System API is mutual TLS. b2b-orders-sapi still accepts any client.',
    'Integration team',
  ].join('\n\n'),
  source: 'Integration team',
}

const lab = {
  id: 'p-sec-mtls',
  group: 'Security',
  title: 'Mutual TLS for a partner and between APIs',
  minutes: 16,
  scenario: [
    `It is 09:00. Partners of Brightmart call ${PAPI} with a client certificate, and ${PAPI} gets the order from ${SAPI}.`,
    'Coastal Grocers works. Bayline Logistics went live this morning and every one of its calls ends during the TLS handshake.',
    `The platform standard also says the hop from ${PAPI} to ${SAPI} must be mutual TLS, and today it is one way.`,
    'The lab has no TLS model, so the applications play the handshake from their properties: the key store, the trust store, their passwords and the key alias. Each client application in Send as stands for a partner with its certificate.',
  ].join(' '),
  start: () =>
    until(
      newPlatform({
        clock: at(1, 8),
        clients: Object.values(PARTNERS).map(({ cert, ...c }) => c),
        apps: [
          newApp(PAPI, {
            updated: at(0, 14),
            props: { 'tls.keystore': 'orders-papi-server.jks', 'tls.truststore': 'partners-2025.jks', 'sapi.url': internalOf({ name: SAPI, env: 'Sandbox' }), 'sapi.tls.truststore': 'internal-ca.jks', 'sapi.tls.keystore': '', 'sapi.tls.keyAlias': '' },
            secrets: { 'tls.keystore.password': 'Papi-Server-26', 'tls.truststore.password': 'Partners-Lab-25', 'sapi.tls.truststore.password': 'Internal-Lab-26' },
          }),
          newApp(SAPI, { updated: at(0, 14), publicEndpoint: false, props: { 'tls.keystore': 'orders-sapi-server.jks', 'tls.truststore': '' }, secrets: { 'tls.keystore.password': 'Sapi-Server-26' } }),
        ],
        traffic: [
          { app: PAPI, env: 'Sandbox', path: '/orders/O-5521', perMinute: 1, every: 2, client: PARTNERS.COASTAL.name },
          { app: PAPI, env: 'Sandbox', path: '/orders/O-6610', perMinute: 1, every: 5, client: PARTNERS.BAYLINE.name },
        ],
        mail: [MAIL_BAYLINE, MAIL_TEAM],
      }),
      at(1, 9),
    ),
  steps: [
    { title: 'Call as the new partner', how: `API client, ${PAPI}, GET /orders/O-6610, Send as Bayline Logistics. There is no answer at all: the connection ends before HTTP starts.`, done: (s) => (s.lastCalls ?? []).some((c) => c.app === PAPI && c.status === 0) },
    sawLogs(PAPI),
    ask(
      'Read the handshake error',
      'The WARN line for Bayline Logistics says PKIX path building failed. What does it mean on a listener?',
      ['Bayline sent no certificate', 'Bayline sent a certificate, and no certificate in the trust store partners-2025.jks is in its chain', 'The server certificate of b2b-orders-papi expired', 'The partner has no client ID'],
      1,
      'The listener asks for a client certificate and checks it against its trust store. The chain of CN=bayline-orders ends in Bayline Root CA, and partners-2025.jks holds only brightmart-partner-ca. Coastal Grocers works because Brightmart Partner CA issued its certificate.',
    ),
    { title: 'Read the mails', how: 'Open the Inbox from the menu. The partner sends its chain and the integration team names the stores that are packed in the release.', done: (s) => Boolean(s.seen.inbox) },
    ask(
      'Choose what to trust',
      'What goes into the trust store of the listener for Bayline?',
      ['The client certificate CN=bayline-orders itself', 'The CA of the partner, here Bayline Root CA, so every certificate it issues for Bayline is trusted', 'Nothing: set insecure to true on the trust store', 'The private key of the partner'],
      1,
      'Trusting the CA keeps working when the partner renews its certificate. A pinned client certificate breaks at each renewal. insecure true turns validation off, so any certificate gets in. A private key never leaves its owner.',
    ),
    {
      title: 'Trust the partner CA',
      how: `Runtime Manager, ${PAPI}, Settings, Properties. Set tls.truststore to partners-2026.jks and tls.truststore.password to its password as a protected property. Apply Changes. A wrong file or password fails the new replica at start, and the rolling update keeps the old configuration running.`,
      done: partnerTrust,
    },
    {
      title: 'Prove the listener',
      how: 'API client: Send as Bayline Logistics and get 200. Send as No Certificate Tester and get no answer, because a client without a certificate must still fail. Coastal Grocers keeps 200.',
      // counted from the start of the lab, because the later steps change b2b-orders-papi again
      done: (s) => partnerTrust(s) && since(s, PARTNERS.BAYLINE, at(1, 9)).some((e) => e.s === 200) && since(s, PARTNERS.NONE, at(1, 9)).some((e) => e.s === 0),
    },
    {
      title: 'Give the Process API its client certificate',
      how: `${PAPI}, Settings, Properties. For the request to ${SAPI} set sapi.tls.keystore to orders-papi-client.jks, sapi.tls.keyAlias to orders-papi-client, and sapi.tls.keystore.password as a protected property. Apply Changes. The old alias orders-papi-client-2025 is signed by a retired CA.`,
      done: clientKey,
    },
    {
      title: 'Make the System API ask for it',
      how: `Runtime Manager, ${SAPI}, Settings, Properties. Set tls.truststore to internal-ca.jks and tls.truststore.password as a protected property. Apply Changes. With a trust store the listener asks every client for a certificate and checks it.`,
      done: sapiMutual,
    },
    ask(
      'Mind the order',
      `Why give ${PAPI} its key store before ${SAPI} asks for a certificate?`,
      [
        'The order does not matter',
        `A client certificate that nobody asks for does no harm, but a server that asks first refuses every call until the client has one, so the partners get 500 in between`,
        'The System API must restart first',
        'Key stores only load at night',
      ],
      1,
      'Roll out the client side first and the server side second. If the server goes first, each call from the Process API fails the handshake with HTTP:CONNECTIVITY until the client has its certificate.',
    ),
    {
      title: 'Prove the whole path',
      how: `API client: Send GET /orders/O-6610 as Bayline Logistics and get 200. Open the logs of ${SAPI}: the line says mutual TLS with client certificate CN=orders-papi-client.`,
      done: (s) => {
        const t = updated(s, PAPI, SAPI)
        return partnerTrust(s) && clientKey(s) && sapiMutual(s) && Boolean(s.seen[`logs:${SAPI}`]) && since(s, PARTNERS.BAYLINE, t).some((e) => e.s === 200) && (s.lastCalls ?? []).some((c) => c.app === PAPI && c.status === 200 && c.t > t)
      },
    },
  ],
  why: 'In mutual TLS each side has a key store with its own certificate and a trust store with the CAs it accepts. A listener refuses a client whose chain it cannot build to a trusted CA, and the client sees the connection end without any HTTP answer. Add the CA of the partner, not the partner certificate, and never set insecure to true. For the hop between APIs, give the client its key store first and make the server ask second. The lab simplifies: the handshake is played from properties, the key alias is a lab property, a listener with a trust store always asks for a certificate here, and the System API answers 495 or 496 to say that the handshake failed. In a real project you add new store files to the project and deploy a new version.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/tls-configuration',
  solve(start) {
    let s = call(start, PAPI, PARTNERS.BAYLINE, '/orders/O-6610').state
    s = { ...s, seen: { ...s.seen, inbox: s.clock, [`logs:${PAPI}`]: s.clock } }
    const p = app(s, PAPI)
    s = change(s, PAPI, { props: { ...p.props, 'tls.truststore': 'partners-2026.jks' }, secrets: { ...p.secrets, 'tls.truststore.password': 'Partners-Lab-26' } })
    s = call(s, PAPI, PARTNERS.BAYLINE, '/orders/O-6610').state
    s = call(s, PAPI, PARTNERS.NONE, '/orders/O-6610').state
    const q = app(s, PAPI)
    s = change(s, PAPI, { props: { ...q.props, 'sapi.tls.keystore': 'orders-papi-client.jks', 'sapi.tls.keyAlias': 'orders-papi-client' }, secrets: { ...q.secrets, 'sapi.tls.keystore.password': 'Papi-Client-26' } })
    const r = app(s, SAPI)
    s = change(s, SAPI, { props: { ...r.props, 'tls.truststore': 'internal-ca.jks' }, secrets: { ...r.secrets, 'tls.truststore.password': 'Internal-Lab-26' } })
    s = advance(s, 5 * MINUTE)
    s = call(s, PAPI, PARTNERS.BAYLINE, '/orders/O-6610').state
    return { ...s, seen: { ...s.seen, [`logs:${SAPI}`]: s.clock } }
  },
  answers: { 2: 1, 4: 1, 9: 1 },
}

export const LABS = [lab]
