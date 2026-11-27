// The guided lab hl7-nack. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, until } from '../platform-kit.js'
import { adtMessage, dtm, FACILITY, feedItem, newHl7, newInterface, newLis, PATIENTS, resend, searchLog } from '../platform-hl7.js'
import { ROUTER } from './hl7-nack.pkg.js'

const IFACE = 'BVH_ADT_OUT'
const ONCALL = 'integration-oncall@bayview.example'
const MERGE_CTL = '10045106'
const CHANGE = at(1, 6)
const props0 = { 'mllp.host': '0.0.0.0', 'mllp.port': '6670', 'lis.host': 'lis.bayview.lab', 'lis.port': '6661', 'mrn.identifierType': '', 'mrn.assigningAuthority': '' }
const router = (s) => app(s, ROUTER)
const props = (s) => router(s)?.props ?? {}
const word = (v) => String(v ?? '').trim()
const fixed = (s) => router(s)?.status === 'Running' && word(props(s)['mrn.identifierType']).toUpperCase() === 'MR' && word(props(s)['mrn.assigningAuthority']).toUpperCase() === FACILITY
const epicLog = (s) => (s.hl7?.log ?? []).filter((e) => e.leg === IFACE)
const merged = (s) => s.hl7?.lis?.patients?.['880044']?.mergedInto === '880021'
const allAccepted = (s) => {
  const log = epicLog(s)
  const ae = new Set(log.filter((e) => e.ack === 'AE').map((e) => e.ctl))
  return ae.size > 0 && [...ae].every((c) => log.some((e) => e.ctl === c && e.ack === 'AA'))
}

// Epic sends PID-3 with the Bayview MRN and the Epic enterprise ID. From 06:00 the enterprise ID comes first.
const idsAt = (mrn, t) => {
  const mr = { id: mrn, authority: FACILITY, type: 'MR' }
  const pi = { id: PATIENTS[mrn].epi, authority: 'EPI', type: 'PI' }
  return t < CHANGE ? [mr, pi] : [pi, mr]
}
const person = (mrn, t) => ({ ids: idsAt(mrn, t), name: PATIENTS[mrn].name, dob: PATIENTS[mrn].dob, sex: PATIENTS[mrn].sex })
const ward = ['4W', '412', 'A', FACILITY]
function feed() {
  const items = [
    [at(1, 5, 10), (t, ctl) => adtMessage({ event: 'A04', ctl, t, ...person('880236', t), cls: 'O', loc: ['OPCLIN', '', '', FACILITY], visit: 'V40101', admit: dtm(t) })],
    [at(1, 5, 40), (t, ctl) => adtMessage({ event: 'A08', ctl, t, ...person('880107', t), cls: 'I', loc: ward, visit: 'V30007', admit: dtm(at(0, 9)) })],
    [at(1, 6, 20), (t, ctl) => adtMessage({ event: 'A01', ctl, t, ...person('880198', t), cls: 'I', loc: ['3E', '305', 'B', FACILITY], attending: ['D2204', 'HALVERSEN', 'MAE'], visit: 'V40102', admit: dtm(t) })],
    [at(1, 6, 50), (t, ctl) => adtMessage({ event: 'A08', ctl, t, ...person('880021', t), cls: 'I', loc: ['4W', '410', 'B', FACILITY], visit: 'V30003', admit: dtm(at(0, 14)) })],
    [at(1, 7, 15), (t, ctl) => adtMessage({ event: 'A03', ctl, t, ...person('880107', t), cls: 'I', loc: ward, visit: 'V30007', admit: dtm(at(0, 9)), discharge: dtm(t) })],
    [at(1, 7, 40), (t, ctl) => adtMessage({ event: 'A40', ctl, t, ...person('880021', t), prior: idsAt('880044', t) })],
    [at(1, 8, 5), (t, ctl) => adtMessage({ event: 'A08', ctl, t, ...person('880153', t), cls: 'O', loc: ['OPCLIN', '', '', FACILITY], visit: 'V30012', admit: dtm(at(1, 2)) })],
    [at(1, 8, 45), (t, ctl) => adtMessage({ event: 'A04', ctl, t, ...person('880271', t), cls: 'O', loc: ['OPCLIN', '', '', FACILITY], visit: 'V40103', admit: dtm(t) })],
    [at(1, 9, 10), (t, ctl) => adtMessage({ event: 'A08', ctl, t, ...person('880236', t), cls: 'O', loc: ['OPCLIN', '', '', FACILITY], visit: 'V40101', admit: dtm(at(1, 5, 10)) })],
    [at(1, 9, 40), (t, ctl) => adtMessage({ event: 'A04', ctl, t, ...person('880198', t), cls: 'O', loc: ['OPCLIN', '', '', FACILITY], visit: 'V40104', admit: dtm(t) })],
  ]
  return items.map(([t, make], i) => feedItem(t, make(t, String(10045101 + i))))
}
const pat = (mrn) => ({ name: PATIENTS[mrn].name.join('^'), dob: PATIENTS[mrn].dob, sex: PATIENTS[mrn].sex, mergedInto: null })
const enc = (visit, mrn, cls, loc, status, admit, discharge = '') => ({ visit, mrn, cls, loc, status, admit: dtm(admit), discharge: discharge && dtm(discharge), t: admit })

const lab = {
  id: 'p-hl7-nack',
  group: 'Epic and healthcare',
  title: 'A patient merge that never reached the LIS',
  minutes: 30,
  scenario: `At Bayview Health, Epic sends ADT over MLLP to ${ROUTER}, which forwards each message to the Bayview LIS and answers Epic with the ACK of the LIS. At 07:40 registration merged two charts of one patient in Epic, MRN 880044 into 880021. It is 08:30 and the LIS still shows both charts, so a blood sample went to the old one. Find out what happened to the merge, fix the router, and get the LIS up to date.`,
  start() {
    const clock = at(1, 4, 50)
    const hl7 = newHl7(clock, {
      interfaces: [newInterface({ id: IFACE, name: 'ADT to MuleSoft', events: ['A01', 'A03', 'A04', 'A08', 'A40'], port: 6670, feed: feed() })],
      lis: newLis({
        patients: Object.fromEntries(['880021', '880044', '880107', '880153'].map((m) => [m, pat(m)])),
        encounters: [enc('V30009', '880044', 'O', 'OPCLIN', 'Discharged', at(0, 10), at(0, 11)), enc('V30003', '880021', 'I', '4W 410 B', 'Admitted', at(0, 14)), enc('V30007', '880107', 'I', '4W 412 A', 'Admitted', at(0, 9)), enc('V30012', '880153', 'O', 'OPCLIN', 'Registered', at(1, 2))],
      }),
    })
    let s = newPlatform({ clock, apps: [newApp(ROUTER, { props: { ...props0 }, store: {} })], hl7 })
    s = until(s, at(1, 8, 25))
    s.mail.push({
      t: at(1, 8, 25),
      to: ONCALL,
      subject: 'Merged patient still has two charts in the LIS',
      body: 'Hello. Registration merged MRN 880044 into 880021 (QUAYSIDE, ROWAN) in Epic at 07:40. The LIS still has both charts, and a blood sample drawn at 08:10 was put on 880044. The LIS gets the merge through the MuleSoft ADT router. Epic Bridges was upgraded at 06:00 this morning, if that matters. Can you check? Bayview LIS team',
      source: 'Bayview LIS team',
    })
    return until(s, at(1, 8, 30))
  },
  steps: [
    { title: 'Read the mail of the LIS team', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Find the merge in the message log',
      how: `HL7 interfaces from the console menu, Message log. Enter 880044 in Search by MRN or control ID and open the ADT^A40 that ${IFACE} sent at 07:40. Read its ACK: MSA-1 and the ERR segment.`,
      done: (s) => Boolean(s.seen[`hl7-msg:${MERGE_CTL}`]),
    },
    {
      title: 'Compare PID-3 before and after 06:00',
      how: 'In the message, switch to Parsed and open PID-3 Patient Identifier List. Then open an ADT from before 06:00 that got AA and compare the order of the two repetitions, and their components 4 Assigning Authority and 5 Identifier Type Code.',
      done: (s) => Boolean(s.seen['hl7:parsed']) && epicLog(s).some((e) => e.ack === 'AA' && s.seen[`hl7-msg:${e.ctl}`]),
    },
    ask(
      'Why the LIS answered AE',
      'The ERR segment says 204 Unknown key identifier at PID^1^3. What happened?',
      [
        'The patient 880021 was deleted from the LIS',
        'Since the upgrade Epic sends the Epic enterprise ID as the first repetition of PID-3 and the Bayview MRN second. The router passes PID-3 on as it is, and the LIS reads only the first repetition, so it looks up E4410021 of authority EPI and finds no such patient',
        'The MLLP connection to the LIS was down',
        'The A40 used version 2.3, which the LIS does not support',
      ],
      1,
      'PID-3 is a repeating CX field: ID^check digit^scheme^assigning authority^identifier type, repetitions split by ~. Never trust the position of a repetition. Select the identifier by its type code (MR) and assigning authority (BVH). An AE with ERR-3 204 means the key of the message is not known to the receiver.',
    ),
    {
      title: 'Select the MRN by type and authority',
      how: `Runtime Manager, ${ROUTER}, Settings, Properties. Set mrn.identifierType to MR and mrn.assigningAuthority to ${FACILITY}. Apply Changes. The router now keeps only that repetition in PID-3 and in MRG-1.`,
      done: fixed,
    },
    {
      title: 'Resend the merge',
      how: `HL7 interfaces, Message log, open the A40 ${MERGE_CTL} and press Resend. Epic puts the same message, with the same MSH-10, in the queue of ${IFACE}. Move the clock a minute, then open the Bayview LIS tab: 880044 shows Merged into 880021.`,
      done: (s) => fixed(s) && merged(s) && Boolean(s.seen['hl7:lis']),
    },
    {
      title: 'Resend every other message that got AE',
      how: 'Message log, set ACK to AE, tick the messages and press Resend selected. Move the clock a minute. Each control ID that got AE now also has an entry with AA. Without this the LIS misses the admission, the discharge and the updates of the morning.',
      done: (s) => fixed(s) && allAccepted(s),
    },
    ask(
      'Why Epic did not try again',
      'Epic got AE for the merge at 07:40 and went on with the next message. Is that right?',
      [
        'No, a sender must resend every NACK until it gets AA',
        'Yes. In original mode AE means the receiver read the message and found an error in its content. Sent again unchanged, it fails the same way, so Epic logs it and goes on. AR is for a reject unrelated to the content, which a sender may try again. Someone has to fix the cause and resend, which is why the AE needs an alert',
        'Yes, because AE means the message was accepted with a warning',
        'No, the router should have answered AA so Epic does not stop',
      ],
      1,
      'Answering AA for a failed message would hide it in both systems. The router passes the AE back, so Epic shows it in its error list, and the app logs it as an error. Neither reached a person here, which is the real gap.',
    ),
    {
      title: 'Alert on NACKs',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${ROUTER}. Metric Message Error Count, Above 0 for each of the last 1 consecutive minutes, recipient ${ONCALL}. The router counts each AE and AR as an error.`,
      done: (s) => s.monAlerts.some((a) => a.enabled && a.name_ === ROUTER && a.resource === 'Application' && a.metric === 'Message Error Count' && ['Above', 'Above or equal to'].includes(a.operator) && Number(a.threshold) <= 1 && String(a.recipients ?? '').includes(ONCALL)),
    },
  ],
  why: 'An AE in original mode is a content error the receiver will not accept as sent, so the sender logs it and moves on: a missed merge stays missed until someone resends it. Here an Epic upgrade swapped the order of the PID-3 repetitions, the router passed the list on, and the LIS, which reads the first repetition, looked up an Epic enterprise ID. Pick identifiers from a CX list by identifier type code and assigning authority, never by position, check the ERR segment (ERR-2 location, ERR-3 code of table 0357) to find the cause, fix it, resend the failed control IDs, and alert on every NACK. In the lab the LIS reads only the first repetition and keeps the same MSH-10 from Epic.',
  docs: 'https://docs.mulesoft.com/hl7-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = mark(s, `hl7-msg:${MERGE_CTL}`)
    s = mark(s, 'hl7:parsed')
    const ok = epicLog(s).find((e) => e.ack === 'AA')
    s = mark(s, `hl7-msg:${ok.ctl}`)
    s = change(s, ROUTER, { props: { ...router(s).props, 'mrn.identifierType': 'MR', 'mrn.assigningAuthority': FACILITY } })
    const merge = searchLog(s.hl7, { text: MERGE_CTL, leg: IFACE })[0]
    s = resend(s, merge.id).state
    s = advance(s, 2 * MINUTE)
    s = mark(s, 'hl7:lis')
    const failed = searchLog(s.hl7, { leg: IFACE, ack: 'AE' }).filter((e) => !epicLog(s).some((x) => x.ctl === e.ctl && x.ack === 'AA'))
    const once = [...new Map(failed.map((e) => [e.ctl, e.id])).values()]
    s = resend(s, once).state
    s = advance(s, 2 * MINUTE)
    return addMonAlert(s, { title: 'ADT router NACKs', resource: 'Application', name_: ROUTER, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ONCALL })
  },
  answers: { 3: 1, 7: 1 },
}

export const LABS = [lab]
