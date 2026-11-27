// The guided lab hl7-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, deployApp, finishDeploys, mark, MINUTE, newPlatform } from '../platform.js'
import { app, ask } from '../platform-kit.js'
import { createInterface, LIS_HOST, LIS_PORT, MULE_HOST, newHl7, newInterface, newLis, PATIENTS, sendTest, startInterface, TEST_MRN } from '../platform-hl7.js'
import { ackModeOf, INTAKE, INTAKE_JAR, KEYSTORE_PASSWORD } from './hl7-setup.pkg.js'

const IFACE = 'BVH_ADT_LIS'
const PORT = 6680
const ONCALL = 'integration-oncall@bayview.example'
const EVENTS = ['A01', 'A03', 'A04', 'A08']
const word = (v) => String(v ?? '').trim()
const intake = (s) => app(s, INTAKE)
const props = (s) => intake(s)?.props ?? {}
const secrets = (s) => intake(s)?.secrets ?? {}
const running = (s) => intake(s)?.status === 'Running'
// the new outbound interface of Epic: to the Mule listener, over TLS, with the four events of the request and no more
const iface = (s) => (s.hl7?.interfaces ?? []).find((i) => i.type === 'ADT' && word(i.host).toLowerCase() === MULE_HOST && Number(i.port) === PORT && i.tls)
const ifaceOk = (s) => [...(iface(s)?.events ?? [])].sort().join() === EVENTS.join()
const secretOk = (s) => Boolean(intake(s)) && secrets(s)['mllp.tls.keystorePassword'] === KEYSTORE_PASSWORD && props(s)['mllp.tls.keystorePassword'] === undefined
const propsOk = (s) => {
  const p = props(s)
  return Boolean(intake(s)) && word(p['mllp.port']) === String(PORT) && word(p['mllp.tls.enabled']).toLowerCase() === 'true' && word(p['lis.host']).toLowerCase() === LIS_HOST && word(p['lis.port']) === String(LIS_PORT) && ackModeOf(p) === 'AFTER_PROCESSING'
}
const epicLog = (s) => (s.hl7?.log ?? []).filter((e) => e.leg === iface(s)?.id)
const testOk = (s) => epicLog(s).some((e) => e.type === 'ADT^A04' && e.mrn === TEST_MRN && e.ack === 'AA') && Boolean(s.hl7?.lis?.patients?.[TEST_MRN])
const badOk = (s) => epicLog(s).some((e) => e.type === 'ADT^A04' && e.ack === 'AE' && /\|101\^/.test(e.ackRaw)) && (s.hl7?.errors ?? []).some((x) => x.app === INTAKE)

const lab = {
  id: 'p-hl7-setup',
  group: 'Epic and healthcare',
  title: 'Set up the HL7 ADT feed from Epic to the LIS',
  minutes: 40,
  scenario: `Bayview Health wants the Bayview LIS to get admissions, discharges, registrations and updates from Epic through MuleSoft. The app ${INTAKE} is built and its jar is in Runtime Manager, and the LIS listens on ${LIS_HOST} port ${LIS_PORT}. Nothing else exists: no Epic outbound interface, no deployment, no alert. Set it up end to end, prove a test registration reaches the LIS with AA, prove a bad message is caught, and alert on failures.`,
  start() {
    const clock = at(1, 9)
    return newPlatform({
      clock,
      jars: [{ pkg: INTAKE, jar: INTAKE_JAR }],
      hl7: newHl7(clock, {
        interfaces: [newInterface({ id: 'BVH_ORU_OUT', name: 'Results to MuleSoft', type: 'ORU', events: ['R01'], port: 6671, status: 'Stopped' })],
        lis: newLis({ patients: Object.fromEntries(['880021', '880107'].map((m) => [m, { name: PATIENTS[m].name.join('^'), dob: PATIENTS[m].dob, sex: PATIENTS[m].sex, mergedInto: null }])) }),
      }),
      mail: [
        {
          t: at(1, 8, 40),
          to: ONCALL,
          subject: 'New ADT feed from Epic to the LIS',
          body: `Hello. Please set up the ADT feed to the LIS. Epic side: a new outbound interface ${IFACE}, message type ADT, to the Mule listener ${MULE_HOST} port ${PORT}, MLLP over TLS because the messages carry patient data. The LIS needs only A01, A03, A04 and A08, so send nothing else. Mule side: ${INTAKE} listens on 0.0.0.0 port ${PORT} with TLS, and sends to the LIS at ${LIS_HOST} port ${LIS_PORT}. ACK Epic only after the LIS has taken a message. The keystore password from our vault is ${KEYSTORE_PASSWORD} (lab value). Bad messages go to the error store, and alerts to ${ONCALL}. Test with the ZZTEST patient ${TEST_MRN}. Bayview integration team`,
          source: 'Bayview integration team',
        },
      ],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the Epic outbound interface',
      how: `HL7 interfaces from the console menu, tab Interfaces, New interface. Interface ID ${IFACE}, message type ADT, events A01, A03, A04 and A08 only, destination host ${MULE_HOST}, port ${PORT}, TLS on, ACK timeout 30 s, on AE Continue. Create. It starts Stopped.`,
      done: ifaceOk,
    },
    ask(
      'How much to send',
      'The LIS team says: send every ADT event and every segment, in case we need them later. What do you answer?',
      [
        'Yes, more data cannot hurt',
        'Send only what the LIS needs: the four events, filtered at the Epic interface. Patient data is shared under the minimum necessary rule, and each extra event is more data to protect and more messages that can fail',
        'Send everything and let the Mule app drop what the LIS does not need',
        'Send only A08, because it holds the whole visit',
      ],
      1,
      'Least privilege for a feed is its scope: the events, the segments and the systems that can connect. Filter at the source, and in the listener only accept connections from the Epic interface host.',
    ),
    {
      title: 'Keep the keystore password secret',
      how: `Runtime Manager, Deploy application, name ${INTAKE}, file ${INTAKE_JAR}. Under Properties add mllp.tls.keystorePassword as a protected (secure) property with the value from the mail, never as a plain one.`,
      done: secretOk,
    },
    {
      title: 'Set the listener and LIS properties',
      how: `In the same form: mllp.host 0.0.0.0, mllp.port ${PORT}, mllp.tls.enabled true, lis.host ${LIS_HOST}, lis.port ${LIS_PORT}, hl7.ackMode AFTER_PROCESSING. The port and TLS must match the Epic interface.`,
      done: propsOk,
    },
    {
      title: 'Deploy and read the startup logs',
      how: `Deploy. When ${INTAKE} is Running, open Runtime Manager, Applications, ${INTAKE}, Logs: MLLP listener started on 0.0.0.0:${PORT} with TLS. Move the clock a minute if the line is not there yet.`,
      done: (s) => running(s) && Boolean(s.seen[`logs:${INTAKE}`]),
    },
    {
      title: 'Start the interface and see it connect',
      how: `HL7 interfaces, Interfaces, ${IFACE}, Start. Move the clock a minute. The interface shows Connected, and under MLLP listeners port ${PORT} belongs to ${INTAKE} with TLS.`,
      done: (s) => propsOk(s) && running(s) && iface(s)?.status === 'Running' && Boolean(iface(s)?.connected) && Boolean(s.seen['hl7:interfaces']),
    },
    {
      title: 'Send a test registration',
      how: `On ${IFACE} pick A04 register test patient and press Send test message. Move the clock a minute. The Message log shows the A04 from Epic with ACK AA and the same control ID on the LIS leg, and tab Bayview LIS lists ZZTEST, HARBOR with MRN ${TEST_MRN}.`,
      done: (s) => testOk(s) && Boolean(s.seen['hl7:lis']),
    },
    {
      title: 'Send a bad message',
      how: `On ${IFACE} pick A04 without PID-3 and press Send test message. Move the clock a minute. The ACK is AE with ERR 101 Required field missing at PID^1^3, and tab Error store holds the message with its reason.`,
      done: (s) => badOk(s) && Boolean(s.seen['hl7:errors']),
    },
    {
      title: 'Alert on failed messages',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${INTAKE}. Metric Message Error Count, Above 0 for each of the last 1 consecutive minutes, recipient ${ONCALL}.`,
      done: (s) => s.monAlerts.some((a) => a.enabled && a.name_ === INTAKE && a.resource === 'Application' && a.metric === 'Message Error Count' && ['Above', 'Above or equal to'].includes(a.operator) && Number(a.threshold) <= 1 && String(a.recipients ?? '').includes(ONCALL)),
    },
    ask(
      'When to ACK',
      'Why ACK Epic after the LIS has taken the message, and not as soon as the listener reads it?',
      [
        'ACK on receipt is not allowed by HL7',
        'An ACK tells Epic the message is safe, so Epic drops it from its queue. ACK after processing passes an AE or AR from the LIS back to Epic, and the order holds because Epic waits for each ACK. ACK on receipt is faster, but then the app must store the message durably, keep the order and handle every failure itself',
        'ACK after processing is faster',
        'It makes no difference for MLLP',
      ],
      1,
      'With ACK after processing, keep the work short enough for the ACK timeout of Epic, or Epic resends: make the receiver idempotent on MSH-10 anyway. With ACK on receipt, put the message on a persistent queue with ordered consumers first.',
    ),
  ],
  why: 'An HL7 feed needs both ends. On the Epic side, an outbound interface with the destination host and port of the Mule listener, TLS, an ACK timeout and an event filter that sends only what the receiver needs. On the Mule side, an MLLP listener on the same port with the keystore password as a secure property, Read and Validate of the HL7 EDI connector, the send to the target, and the ACK mode. Then prove it: the interface connects, a test A04 gets AA and shows in the LIS, a bad message gets AE with an ERR segment and lands in the error store, and an alert reaches a person. In the lab the host mule-hl7.bayview.lab reaches the listener of any running app.',
  docs: 'https://docs.mulesoft.com/mllp-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createInterface(s, { id: IFACE, name: 'ADT to LIS through MuleSoft', type: 'ADT', events: EVENTS, host: MULE_HOST, port: String(PORT), tls: true, ackTimeout: '30', onAe: 'Continue' }).state
    const form = {
      name: INTAKE,
      pkg: INTAKE,
      jar: INTAKE_JAR,
      replicas: 1,
      vCores: 0.1,
      props: { 'mllp.host': '0.0.0.0', 'mllp.port': String(PORT), 'mllp.tls.enabled': 'true', 'lis.host': LIS_HOST, 'lis.port': String(LIS_PORT), 'hl7.ackMode': 'AFTER_PROCESSING' },
      secrets: { 'mllp.tls.keystorePassword': KEYSTORE_PASSWORD },
    }
    s = finishDeploys(deployApp(s, form).state)
    s = advance(s, MINUTE)
    s = mark(s, `logs:${INTAKE}`)
    s = startInterface(s, IFACE).state
    s = advance(s, MINUTE)
    s = mark(s, 'hl7:interfaces')
    s = sendTest(s, IFACE, 'A04').state
    s = advance(s, 2 * MINUTE)
    s = mark(s, 'hl7:lis')
    s = sendTest(s, IFACE, 'A04 bad').state
    s = advance(s, 2 * MINUTE)
    s = mark(s, 'hl7:errors')
    return addMonAlert(s, { title: 'ADT intake errors', resource: 'Application', name_: INTAKE, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ONCALL })
  },
  answers: { 2: 1, 10: 1 },
}

export const LABS = [lab]
