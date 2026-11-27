// The guided lab hl7-duplicates. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, until } from '../platform-kit.js'
import { adtMessage, dtm, FACILITY, feedItem, newHl7, newInterface, newLis, PATIENTS } from '../platform-hl7.js'
import { keyOf, SYNC } from './hl7-duplicates.pkg.js'

const IFACE = 'BVH_ADT_OUT'
const ONCALL = 'integration-oncall@bayview.example'
const SLOW = [
  { from: at(1, 7), to: at(1, 7, 40), min: 18000, max: 42000 },
  { from: at(1, 8, 40), to: at(1, 9), min: 18000, max: 42000 },
]
const props0 = { 'mllp.host': '0.0.0.0', 'mllp.port': '6670', 'lis.host': 'lis.bayview.lab', 'lis.port': '6661', 'idempotency.key': '' }
const sync = (s) => app(s, SYNC)
const running = (s) => sync(s)?.status === 'Running'
const keyed = (s) => running(s) && keyOf(sync(s).props) === 'MSH-10'
const encounters = (s) => s.hl7?.lis?.encounters ?? []
// an encounter row for a visit that already had one: a duplicate admission or registration
const dupRows = (s, from = 0) => encounters(s).filter((e, i, all) => e.t >= from && all.slice(0, i).some((o) => o.visit === e.visit && o.mrn === e.mrn))

const MRNS = ['880107', '880153', '880198', '880236', '880271', '880021']
// Epic sends a registration or an admission and later an update of the same visit, every 4 minutes
function feed() {
  const out = []
  for (let k = 0; k < 52; k++) {
    const t = at(1, 6, 30) + k * 4 * MINUTE
    const mrn = MRNS[Math.floor(k / 2) % MRNS.length]
    const p = PATIENTS[mrn]
    const visit = `V5${String(1000 + Math.floor(k / 2)).slice(1)}`
    const inpatient = Math.floor(k / 2) % 3 === 0
    const first = k % 2 === 0
    const event = first ? (inpatient ? 'A01' : 'A04') : 'A08'
    const ward = inpatient ? ['4W', String(400 + (k % 20)), 'A', FACILITY] : ['OPCLIN', '', '', FACILITY]
    out.push(feedItem(t, adtMessage({ event, ctl: String(10046001 + k), t, ids: [{ id: mrn }], name: p.name, dob: p.dob, sex: p.sex, cls: inpatient ? 'I' : 'O', loc: ward, visit, admit: dtm(first ? t : t - 4 * MINUTE) })))
  }
  return out
}

const lab = {
  id: 'p-hl7-duplicates',
  group: 'Epic and healthcare',
  title: 'Duplicate admissions after MLLP reconnects',
  minutes: 30,
  scenario: `Epic sends ADT over MLLP to ${SYNC}, which writes each admission and registration to the Bayview LIS and ACKs Epic once the LIS has taken it. Between 07:00 and 07:40 a nightly index job made the LIS slow. Since then the LIS shows the same admission two or three times for several patients. It is 08:15. Find out where the copies come from and stop them before the job runs again at 08:40.`,
  start() {
    const clock = at(1, 6, 25)
    const hl7 = newHl7(clock, {
      interfaces: [newInterface({ id: IFACE, name: 'ADT to MuleSoft', events: ['A01', 'A03', 'A04', 'A08'], port: 6670, ackTimeout: 30, feed: feed() })],
      lis: newLis({ patients: Object.fromEntries(MRNS.map((m) => [m, { name: PATIENTS[m].name.join('^'), dob: PATIENTS[m].dob, sex: PATIENTS[m].sex, mergedInto: null }])), slow: SLOW }),
    })
    let s = newPlatform({ clock, apps: [newApp(SYNC, { props: { ...props0 }, store: {} })], hl7 })
    s = until(s, at(1, 8, 10))
    const n = dupRows(s).length
    s.mail.push({
      t: at(1, 8, 10),
      to: ONCALL,
      subject: 'Duplicate admissions in the LIS',
      body: `Hello. The LIS has ${n} extra encounter rows since 07:00: the same visit number admitted or registered more than once. Each copy makes the lab print a second set of specimen labels. Our index job made the LIS slow from 07:00 to 07:40, and it runs again from 08:40 to 09:00 to finish. Please stop the copies before then. Bayview LIS team`,
      source: 'Bayview LIS team',
    })
    return until(s, at(1, 8, 15))
  },
  steps: [
    { title: 'Read the mail of the LIS team', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'See the copies in the LIS',
      how: 'HL7 interfaces from the console menu, tab Bayview LIS. In Encounters the rows marked Duplicate have a visit number that was opened before.',
      done: (s) => Boolean(s.seen['hl7:lis']),
    },
    {
      title: 'Find a message that Epic sent twice',
      how: 'Tab Message log. Set ACK to No ACK in time, or search the control ID of a duplicate visit, and open an entry with Try 2. The first try has the note: ACK came after the timeout and Epic closed the connection.',
      done: (s) => Boolean(s.seen['hl7:retry']),
    },
    {
      title: `Look at the interface ${IFACE}`,
      how: `Tab Interfaces. Read ACK timeouts and Reconnects of ${IFACE}, then press ${IFACE} to open it and read its ACK timeout of 30 s.`,
      done: (s) => Boolean(s.seen['hl7:interfaces']),
    },
    ask(
      'Where the copies come from',
      'Epic counts 30 s for each ACK. During the slow window the LIS took 18 to 42 s per message. What made the copies?',
      [
        'Epic has a bug that sends every message twice',
        `${SYNC} ACKs only after the LIS answers. When that took more than 30 s, Epic gave up on the ACK, closed the connection, reconnected and sent the same message again with the same MSH-10. The first try had already reached the LIS, so the second one opened the visit again`,
        'The LIS writes each encounter twice when it is slow',
        'Two replicas of the app each took the message',
      ],
      1,
      'MLLP gives at least once delivery: a sender that does not get its ACK in time cannot know whether the receiver got the message, so it sends it again. A receiver must expect the same message more than once, and the MSH-10 control ID is the same on every try.',
    ),
    {
      title: 'Make the receiver idempotent on MSH-10',
      how: `Runtime Manager, ${SYNC}, Settings, Properties. Set idempotency.key to MSH-10 and Apply Changes. The idempotent message validator now keeps each control ID in a persistent object store and drops a message it has seen.`,
      done: keyed,
    },
    ask(
      'The key and the answer to a copy',
      'Why MSH-10 and not the visit number PV1-19, and what does the app answer Epic for a copy it drops?',
      [
        'PV1-19, because a visit is the business key. Answer AE so Epic sees the copy',
        'MSH-10 identifies one message, and every try of it has the same one. PV1-19 is the same for the admission and every later update of the visit, so the updates would be dropped. Answer AA: the message was processed, and AE or AR would make Epic log an error or try again for something that is done',
        'MSH-10, and send no ACK for a copy',
        'MSH-7, the time of the message, because it is unique',
      ],
      1,
      'The idempotent message validator of Mule raises MULE:DUPLICATE_MESSAGE for a seen ID. Handle it with an ACK AA. A business key belongs in an upsert in the target, which is a second line of defence; the control ID stops the same message being applied twice.',
    ),
    {
      title: 'Watch the second slow window',
      how: `Move the clock past 09:00. Epic still times out and sends again, and the logs of ${SYNC} show MULE:DUPLICATE_MESSAGE with ACK AA. In Bayview LIS no new Duplicate rows appear after your change.`,
      done: (s) => {
        const a = sync(s)
        if (!keyed(s) || s.clock < at(1, 9)) return false
        const retried = (s.hl7?.log ?? []).some((e) => e.leg === IFACE && e.tries > 1 && e.t > a.updated)
        return retried && (a.store?.dups ?? 0) > 0 && dupRows(s, a.updated).length === 0
      },
    },
    ask(
      'Where the IDs live',
      'The app has 2 replicas in production and is redeployed now and then. Where should the validator keep the control IDs?',
      [
        'In memory: it is the fastest',
        'In a persistent object store shared by the replicas, with a time to live longer than the time Epic keeps sending again. An in memory store is lost on a restart and is per replica, so a resend after a restart or to the other replica gets through',
        'In a file on the replica',
        'Nowhere: the LIS will remove copies',
      ],
      1,
      'A reconnect often follows a restart or a failover, which is when an in memory store is empty. Object Store V2 with persistent true is shared by every replica of a CloudHub app.',
    ),
  ],
  why: 'MLLP is at least once: Epic sends the next message only after an ACK, and when the ACK does not come within its timeout it reconnects and sends the same message again, with the same MSH-10. A receiver that ACKs after slow work will see copies. Make it idempotent on MSH-10 with a persistent, shared store, ACK a copy AA, and keep the ACK fast, for example by storing the message durably and ACKing before the slow call. Watch ACK timeouts and reconnects on the interface. In the lab the validator stores the ID after the LIS accepted the message, and the LIS opens an encounter row for each A01 or A04 it gets.',
  docs: 'https://docs.mulesoft.com/mllp-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = mark(s, 'hl7:lis')
    s = mark(s, 'hl7:retry')
    s = mark(s, 'hl7:interfaces')
    s = change(s, SYNC, { props: { ...sync(s).props, 'idempotency.key': 'MSH-10' } })
    return advance(s, at(1, 9, 5) - s.clock)
  },
  answers: { 4: 1, 6: 1, 8: 1 },
}

export const LABS = [lab]
