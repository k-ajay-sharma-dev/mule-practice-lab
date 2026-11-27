// The guided lab b2b-edi-850. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, OPS, until } from '../platform-kit.js'
import { addCode, codesOf, fill, flowOf, issuesOf, raiseIssue, requestResendFailed, setFlow, setUnitMap, txOf } from '../platform-b2b.js'
import { NAME, PM_FLOW } from './b2b-edi-850.pkg.js'

const PARTNER = 'northwind'
const line = (qty, uom, price, part, item, desc, migrated = false) => ({ qty, uom, price, part, item, desc, migrated })
const MUG = (q) => line(q, 'EA', '12.50', 'NW-1001', 'H-100', 'Brightmart mug 350 ml', true)
const CUPS = (q) => line(q, 'CA', '48.00', 'NW-2040', 'H-200', 'Paper cups case of 50')
const TEA = (q) => line(q, 'BX', '19.90', 'NW-3300', 'H-300', 'Tea bags box of 100')
const LIDS = (q) => line(q, 'PK', '6.40', 'NW-2045', 'H-210', 'Cup lids pack of 100')

function b2b(now) {
  const b = fill({ created: now })
  // the new ERP of Northwind went live last night: it counts SE01 without SE, and pads the unit of migrated items
  b.quirks = { [PARTNER]: { se01: true, pad: true } }
  b.feeds = [{ partner: PARTNER, prefix: 'NW-', first: 45120, every: 12, at: now + 10 * MINUTE, n: 0, orders: [[MUG(24), CUPS(6), TEA(10)], [MUG(12), LIDS(8), CUPS(4)], [CUPS(10), TEA(20), MUG(36)]] }]
  return b
}

const flow = (s) => flowOf(s.b2b, PM_FLOW)
const failedRefs = (s) => [...new Set(txOf(s.b2b).filter((t) => t.dir === 'in' && t.type === '850' && t.status === 'Failed').map((t) => t.ref))]
const orders = (s) => app(s, NAME)?.store?.orders ?? {}
const raised = (s, key) => issuesOf(s.b2b).some((x) => x.partner === PARTNER && x.key === key)

const lab = {
  id: 'p-b2b-edi-850',
  group: 'B2B and EDI',
  title: 'Purchase orders rejected since the new ERP',
  minutes: 25,
  scenario:
    'Northwind Supplies sends Brightmart its purchase orders as X12 850 over AS2, and Partner Manager turns each one into an order through the flow Northwind 850 to Order API. Northwind moved to a new ERP last night. It is Tuesday 09:00 and the order desk has no Northwind order today. Northwind writes that every 850 since 07:00 came back with a 997 that says R. Nobody at Brightmart saw those 997s.',
  start() {
    const now = at(1, 7)
    const s = newPlatform({
      clock: now,
      apps: [newApp(NAME, { props: { 'b2b.flow': PM_FLOW }, store: {} })],
      b2b: b2b(now),
      mail: [
        { t: at(1, 8, 40), to: OPS, subject: 'Your 997s reject all our 850s', body: 'Hello Brightmart, since our new ERP went live this morning every purchase order we send comes back with a 997 that has AK9 R. We did not change anything in the EDI setup. Can you tell us what is wrong? Northwind EDI team', source: 'Northwind Supplies' },
        { t: at(1, 8, 50), to: OPS, subject: 'No Northwind orders today', body: 'The order system has not one Northwind order since yesterday. They say they sent about ten. Brightmart order desk', source: 'Brightmart order desk' },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Open the tracking of Partner Manager', how: 'Partner Manager from the console menu, Tracking. Pick Northwind Supplies in Partner: every 850 since 07:10 is Failed, and a 997 went back for each one.', done: (s) => Boolean(s.seen['b2b:tracking']) },
    { title: 'Read the raw EDI', how: 'In Tracking, open one of the failed 850s and its tab Raw EDI. Count the segments from ST to SE and compare with SE01. Read the PO1 segments. Then search for the interchange number of its 997 and read AK3, AK4 and AK5.', done: (s) => Boolean(s.seen['b2b:raw']) },
    ask(
      'What the 997s reject',
      'What do the 997s tell Northwind?',
      [
        'The AS2 certificate of Northwind expired, so Brightmart could not decrypt the messages',
        'SE01 says 14 segments but the set has 15 (AK5 code 4), and PO103 holds "EA " with a trailing space (AK4 code 5, too long) or BX, a code that is not in the list Brightmart has for Northwind (AK4 code 7)',
        'Each interchange reuses an ISA control number, so Brightmart rejects it as a duplicate',
        'The order intake app is stopped, so Partner Manager rejects the orders',
      ],
      1,
      'SE01 counts every segment of the set, ST and SE included. The new ERP leaves SE out. AK3 names the segment and its position, AK4 the element, its reference number and the error code, and copies the bad value. A duplicate ISA13 would give a TA1, and a decryption problem would show in the MDN, not in a 997.',
    ),
    ask(
      'What a 997 says',
      'Northwind asks whether a 997 with AK9 A means Brightmart accepted the order. What does a 997 say, and what does it not say?',
      [
        'Yes. A 997 with A means the order is accepted and will be fulfilled',
        'It says the functional group arrived and passed or failed the X12 syntax checks: envelopes, counts, mandatory elements and code values. It says nothing about the business: price, stock or whether Brightmart takes the order. That answer is the 855',
        'It says the AS2 message was decrypted and its signature was valid',
        'It says the order was created in the order system',
      ],
      1,
      'A 997 is a functional acknowledgment of syntax. The AS2 MDN says the message arrived and could be read. The 855 purchase order acknowledgment is the business answer: accepted, accepted with changes or rejected. A partner that treats a 997 A as an order confirmation is wrong, and a team that never reads the 997 R it sends misses every broken document.',
    ),
    {
      title: 'Raise the partner side problems with Northwind',
      how: 'Partners, Northwind Supplies. Under Raise an issue pick a problem and press Send to partner. Raise the two that are Northwind\'s to fix and read the replies in the Inbox. A code that is valid X12 is not one of them.',
      done: (s) => raised(s, 'se01-count') && raised(s, 'uom-padding'),
    },
    {
      title: 'Accept BX and map it, with validation on',
      how: 'Document types, X12 850. Under Partner code lists pick Northwind Supplies, type BX in Code and press Add code. Then Message flows, Northwind 850 to Order API: under Unit mapping put BX in X12 code, pick BOX in Order API unit and press Add mapping. Leave Validate X12 ticked.',
      done: (s) => (codesOf(s.b2b, PARTNER, '850|PO103') ?? []).includes('BX') && Boolean(flow(s)?.unitMap?.BX) && flow(s)?.validate === true,
    },
    {
      title: 'Alert on a rejected 997',
      how: `Message flows, Northwind 850 to Order API, Alerts. Tick Alert when a 997 rejects a document, put ${OPS} in Alert recipients and press Save alerts.`,
      done: (s) => Boolean(flow(s)?.alerts?.rejected997 && flow(s)?.alerts?.to?.trim()),
    },
    ask(
      'Why not turn validation off',
      'A colleague suggests to untick Validate X12 for Northwind until their ERP is fixed. Why is that wrong?',
      [
        'It is right: the orders would flow again, and Northwind can fix their data later',
        'Validation is how Partner Manager tells the partner in a 997 that a document is broken. Without it a wrong count or a padded code goes on into the mapping or the order system, fails there or makes a wrong order, and the partner hears nothing',
        'Partner Manager cannot turn validation off',
        'Without validation no 997 goes out at all',
      ],
      1,
      'Validation at the edge is the contract with the partner. The fix is to agree what is valid: the partner corrects what breaks the standard or the guide, and Brightmart accepts what is valid X12 and makes business sense, such as a new unit code, with a mapping for it. Turning checks off moves the failure to a place where nobody tells the partner.',
    ),
    {
      title: 'Get the lost orders again',
      how: 'Tracking, pick Northwind Supplies in Partner and press Request resend of all failed. Move the clock 5 minutes: Northwind sends each PO again with new control numbers, and the order intake creates the orders. If a resend fails, read its errors, fix the cause and request it again.',
      done: (s) => flow(s)?.validate === true && failedRefs(s).length > 0 && failedRefs(s).every((r) => orders(s)[r]),
    },
  ],
  why: 'X12 validation in Partner Manager checks the envelopes, the segment count in SE01, mandatory elements and code values, and returns a 997 that names each error with AK3, AK4 and AK5. A 997 is about syntax only: the business answer is the 855. Northwind\'s new ERP broke the count and padded unit codes, and also sent BX, a valid X12 code that Brightmart had not listed. The fix is agreement: the partner corrects its side, Brightmart adds the valid code and a mapping for it, validation stays on, and an alert makes a rejected 997 visible. In the lab the partner fixes its ERP when you raise the issue, a resend comes three minutes after you request it, and the target app takes its orders from the flow instead of receiving an HTTP call.',
  docs: 'https://docs.mulesoft.com/partner-manager/latest/',
  solve(start) {
    let s = mark(mark(start, 'b2b:tracking'), 'b2b:raw')
    s = raiseIssue(raiseIssue(s, PARTNER, 'se01-count'), PARTNER, 'uom-padding')
    s = setUnitMap(addCode(s, PARTNER, '850|PO103', 'BX'), PM_FLOW, 'BX', 'BOX')
    s = setFlow(s, PM_FLOW, { alerts: { rejected997: true, to: OPS } })
    s = requestResendFailed(s, PARTNER)
    return advance(s, 6 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 7: 1 },
}

export const LABS = [lab]
