// The guided lab hl7-sequence. See platform-labs.js for the shape of a lab.
import { advance, at, finishDeploys, MINUTE, mark, newApp, newPlatform, startApp, stopApp } from '../platform.js'
import { app, ask, change, until } from '../platform-kit.js'
import { adtMessage, comp, dtm, FACILITY, feedItem, newHl7, newInterface, newLis, PATIENTS, resend, searchLog, startInterface, stopInterface } from '../platform-hl7.js'
import { concurrencyOf, FEED, modeOf } from './hl7-sequence.pkg.js'

const IFACE = 'BVH_ADT_OUT'
const ONCALL = 'integration-oncall@bayview.example'
const props0 = { 'mllp.host': '0.0.0.0', 'mllp.port': '6670', 'lis.host': 'lis.bayview.lab', 'lis.port': '6661', 'hl7.ackMode': 'ON_RECEIPT', 'processing.maxConcurrency': '4' }
const feedApp = (s) => app(s, FEED)
const running = (s) => feedApp(s)?.status === 'Running'
const ordered = (s) => running(s) && (concurrencyOf(feedApp(s).props) === 1 || modeOf(feedApp(s).props) === 'AFTER_PROCESSING')
const VISITS = ['V30007', 'V30003', 'V30012']
const encOf = (s, visit) => (s.hl7?.lis?.encounters ?? []).findLast((e) => e.visit === visit)
const repaired = (s) => VISITS.every((v) => encOf(s, v)?.status === 'Discharged')

const ward = (room) => ['4W', room, 'A', FACILITY]
const clinic = ['OPCLIN', '', '', FACILITY]
const street = (n) => comp(`${n} Pier Row`, '', 'Bayview', 'CA', '94000')
const pt = (mrn) => ({ ids: [{ id: mrn }], name: PATIENTS[mrn].name, dob: PATIENTS[mrn].dob, sex: PATIENTS[mrn].sex })
// the backlog of 06:00 to 06:45, in the order Epic sent it. An update before a discharge of the same visit is the risk.
const BACKLOG = [
  ['A04', '880236', { cls: 'O', loc: clinic, visit: 'V60001' }],
  ['A08', '880107', { cls: 'I', loc: ward('412'), visit: 'V30007', address: street(12), phone: '(555)0104471', admit: at(0, 9) }],
  ['A03', '880107', { cls: 'I', loc: ward('412'), visit: 'V30007', admit: at(0, 9), discharge: true }],
  ['A04', '880271', { cls: 'O', loc: clinic, visit: 'V60003' }],
  ['A01', '880198', { cls: 'I', loc: ward('305'), visit: 'V60002' }],
  ['A08', '880198', { cls: 'I', loc: ward('305'), visit: 'V60002', address: street(40), phone: '(555)0107720' }],
  ['A08', '880021', { cls: 'I', loc: ward('410'), visit: 'V30003', address: street(7), phone: '(555)0101188', admit: at(0, 14) }],
  ['A03', '880021', { cls: 'I', loc: ward('410'), visit: 'V30003', admit: at(0, 14), discharge: true }],
  ['A08', '880236', { cls: 'O', loc: clinic, visit: 'V60001', address: street(21), phone: '(555)0103390' }],
  ['A08', '880153', { cls: 'O', loc: clinic, visit: 'V30012', address: street(3), phone: '(555)0109034', admit: at(1, 2) }],
  ['A03', '880153', { cls: 'O', loc: clinic, visit: 'V30012', admit: at(1, 2), discharge: true }],
  ['A08', '880271', { cls: 'O', loc: clinic, visit: 'V60003', address: street(9), phone: '(555)0106612' }],
  ['A04', '880107', { cls: 'O', loc: clinic, visit: 'V60004' }],
  ['A08', '880107', { cls: 'O', loc: clinic, visit: 'V60004', address: street(12), phone: '(555)0104471' }],
]
const A03_CTL = '10047003'
function feed() {
  const out = BACKLOG.map(([event, mrn, x], i) => {
    const t = at(1, 6, 2) + i * 3 * MINUTE
    return feedItem(t, adtMessage({ event, ctl: String(10047001 + i), t, ...pt(mrn), ...x, admit: dtm(x.admit ?? t), discharge: x.discharge ? dtm(t) : '' }))
  })
  // the rest of the morning: updates of the open outpatient visits, every 3 minutes
  const open = [['880236', 'V60001'], ['880271', 'V60003'], ['880107', 'V60004']]
  for (let k = 0; k < 80; k++) {
    const t = at(1, 7) + k * 3 * MINUTE
    const [mrn, visit] = open[k % open.length]
    out.push(feedItem(t, adtMessage({ event: 'A08', ctl: String(10047101 + k), t, ...pt(mrn), cls: 'O', loc: clinic, visit, admit: dtm(at(1, 6)) })))
  }
  return out
}
const pat = (mrn) => ({ name: PATIENTS[mrn].name.join('^'), dob: PATIENTS[mrn].dob, sex: PATIENTS[mrn].sex, mergedInto: null })
const enc = (visit, mrn, cls, loc, status, admit) => ({ visit, mrn, cls, loc, status, admit: dtm(admit), discharge: '', t: admit })

const lab = {
  id: 'p-hl7-sequence',
  group: 'Epic and healthcare',
  title: 'Discharged patients still in a bed',
  minutes: 30,
  scenario: `${FEED} takes ADT from Epic over MLLP and keeps the encounters of the Bayview LIS up to date. It was stopped for maintenance from 06:00 to 06:45, and Epic kept the messages of that time in its queue. It is 08:25. The LIS shows three patients as still in house whom Epic discharged during the maintenance, and the lab prints ward collection labels for them. Find out why, fix it, and repair the three visits.`,
  start() {
    const clock = at(1, 5, 50)
    const hl7 = newHl7(clock, {
      interfaces: [newInterface({ id: IFACE, name: 'ADT to MuleSoft', events: ['A01', 'A03', 'A04', 'A08'], port: 6670, feed: feed() })],
      lis: newLis({
        patients: Object.fromEntries(['880107', '880021', '880153'].map((m) => [m, pat(m)])),
        encounters: [enc('V30007', '880107', 'I', '4W 412 A', 'Admitted', at(0, 9)), enc('V30003', '880021', 'I', '4W 410 A', 'Admitted', at(0, 14)), enc('V30012', '880153', 'O', 'OPCLIN', 'Registered', at(1, 2))],
      }),
    })
    let s = newPlatform({ clock, apps: [newApp(FEED, { props: { ...props0 }, store: {} })], hl7 })
    s = stopApp(until(s, at(1, 6)), FEED)
    s = finishDeploys(startApp(until(s, at(1, 6, 45)), FEED))
    s = until(s, at(1, 8, 20))
    s.mail.push({
      t: at(1, 8, 20),
      to: ONCALL,
      subject: 'Discharged patients still in house in the LIS',
      body: 'Hello. TIDEWELL ELLIS (880107, visit V30007), QUAYSIDE ROWAN (880021, V30003) and MARLOW JUNO (880153, V30012) were discharged in Epic between 06:00 and 06:45. The LIS still has their visits open, so the phlebotomy round got ward labels for them. Epic shows the discharges as sent and ACKed. Please fix the feed and the three visits. Bayview LIS team',
      source: 'Bayview LIS team',
    })
    return until(s, at(1, 8, 25))
  },
  steps: [
    { title: 'Read the mail of the LIS team', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'See the open visits in the LIS',
      how: 'HL7 interfaces from the console menu, tab Bayview LIS. In Encounters, V30007, V30003 and V30012 are Admitted or Registered and have no discharge time.',
      done: (s) => Boolean(s.seen['hl7:lis']),
    },
    {
      title: 'Compare the order on both legs',
      how: `Tab Message log. Search V30007 and open the A03 ${A03_CTL}. In the list, Epic sent the A08 before the A03 on ${IFACE}, and on the LIS leg the A03 went first and the A08 after it. Look at the A08 in Parsed: PV1 has PV1-44 Admit Date/Time but no PV1-45 Discharge Date/Time, while the A03 has both.`,
      done: (s) => Boolean(s.seen[`hl7-msg:${A03_CTL}`]),
    },
    ask(
      'Why the order changed',
      `Epic sends one message at a time over one MLLP connection and waits for each ACK. How did the A08 reach the LIS after the A03?`,
      [
        'Epic sent them in the wrong order',
        `${FEED} ACKs each message on receipt, so after the maintenance Epic sent the whole backlog in seconds. The flow then works on processing.maxConcurrency 4 messages at once, and the A03 finished before the longer A08. The A08 carries the visit as it was before the discharge, so it opened the visit again`,
        'The LIS sorts messages by MSH-7',
        'The MLLP connection reordered the frames',
      ],
      1,
      'HL7 v2 ADT is a stream of state changes per patient, so order matters. MLLP keeps the order on the wire because the sender waits for each ACK, but anything after the ACK that runs in parallel can change it. The backlog after an outage is when it shows.',
    ),
    {
      title: 'Keep the order',
      how: `Runtime Manager, ${FEED}, Settings, Properties. Set processing.maxConcurrency to 1, or set hl7.ackMode to AFTER_PROCESSING so the flow sends to the LIS before it ACKs Epic. Apply Changes.`,
      done: ordered,
    },
    {
      title: 'Resend the three discharges',
      how: 'Message log. Search each visit, V30007, V30003 and V30012, open its A03 from Epic and press Resend. Move the clock a minute. In Bayview LIS the three visits are Discharged.',
      done: (s) => ordered(s) && repaired(s),
    },
    {
      title: 'Prove the order holds after a backlog',
      how: `Tab Interfaces, press ${IFACE} to open it, then Stop. Move the clock 15 minutes while Epic queues the updates, then Start. Move the clock 2 minutes. The logs of ${FEED} show the backlog in one poll, and it reached the LIS in the order Epic sent it.`,
      done: (s) => {
        const a = feedApp(s)
        return ordered(s) && (a?.store?.bursts ?? []).some((b) => b.t > a.updated && b.n >= 4 && b.inOrder)
      },
    },
    ask(
      'What ACK on receipt hides',
      `With ACK on receipt, an A08 that the LIS answers with AE was already ACKed AA to Epic. Where does that error show?`,
      [
        'In the error list of Epic, as for any NACK',
        `Only in ${FEED}: its log and whatever it does with the error. Epic saw AA, so it will not show it or send it again. An app that ACKs early must keep the message durably, retry or park failures in an error store, and alert, or it loses them`,
        'The LIS sends a second ACK later',
        'Nowhere, because AE cannot happen after AA',
      ],
      1,
      'ACK on receipt (like a commit ACK in enhanced mode) moves the responsibility from the sender to the receiver. It is fast and fine for a durable hand off, such as a persistent queue with an ordered consumer, but the app then owns ordering, retries and errors.',
    ),
  ],
  why: 'MLLP keeps messages in order on the wire, because Epic sends the next one only after the ACK. An app that ACKs on receipt and then processes in parallel can still apply them out of order, and a backlog after an outage makes it likely. For ADT that means an old A08 overwriting an A03. Keep order per patient: one consumer, or ACK after processing, or a queue with ordering by MRN. Repair what went wrong by resending the affected messages in order. In the lab a message takes time in proportion to its length when several are in work at once, and the LIS applies an A08 as the whole state of the visit.',
  docs: 'https://docs.mulesoft.com/mllp-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = mark(s, 'hl7:lis')
    s = mark(s, `hl7-msg:${A03_CTL}`)
    s = change(s, FEED, { props: { ...feedApp(s).props, 'processing.maxConcurrency': '1' } })
    const a03 = VISITS.map((v) => searchLog(s.hl7, { text: v, leg: IFACE }).find((e) => e.type === 'ADT^A03')?.id)
    s = resend(s, a03).state
    s = advance(s, 2 * MINUTE)
    s = stopInterface(s, IFACE).state
    s = advance(s, 15 * MINUTE)
    s = startInterface(s, IFACE).state
    return advance(s, 2 * MINUTE)
  },
  answers: { 3: 1, 7: 1 },
}

export const LABS = [lab]
