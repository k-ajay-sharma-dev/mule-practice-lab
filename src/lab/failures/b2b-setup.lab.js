// The guided lab b2b-setup. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, OPS, until } from '../platform-kit.js'
import { certOf, createFlow, createPartner, deployFlow, fill, flowStatus, flowsOf, importCert, mdnOk, newCert, partnerOf, requestTest, setEndpoint, setFlow, txOf } from '../platform-b2b.js'
import { NAME } from './b2b-setup.pkg.js'

const ID = 'bayside-foods'
const SIGN = 'bayside-sign-2026'
const ENC = 'bayside-enc-2026'
const AS2 = 'BAYSIDE-AS2'
const URL = 'https://as2.bayside-foods.example/as2'
const line = (qty, uom, price, part, item, desc) => ({ qty, uom, price, part, item, desc })

function b2b(now) {
  const b = fill({ created: now })
  b.offered = [
    { ...newCert(SIGN, ID, 'Signing', 'as2.bayside-foods.example', at(-20), at(345)), note: 'Sent by Bayside Foods with the onboarding sheet' },
    { ...newCert(ENC, ID, 'Encryption', 'as2.bayside-foods.example', at(-20), at(345)), note: 'Sent by Bayside Foods with the onboarding sheet' },
  ]
  // lab made: what Bayside Foods really uses. Its test 850 is built from this, whatever Brightmart typed in.
  b.prospects = {
    [ID]: { id: ID, name: 'Bayside Foods', isaQual: '01', isaId: '987654321', gsId: 'BAYSIDE', as2Id: AS2, signCert: SIGN, test: { po: 'BF-10001', vendor: 'BF-VENDOR-12', lines: [line(48, 'EA', '2.10', 'BF-501', 'H-400', 'Oat biscuits 200 g'), line(5, 'CA', '36.00', 'BF-620', 'H-410', 'Sparkling water case of 24')] } },
  }
  return b
}

const partner = (s) => partnerOf(s.b2b, ID)
const ep = (s) => partner(s)?.as2
const flow = (s) => flowsOf(s.b2b).find((f) => f.partner === ID && f.dir === 'inbound' && f.type === '850')

const lab = {
  id: 'p-b2b-setup',
  group: 'B2B and EDI',
  title: 'Set up a new EDI partner from nothing',
  minutes: 30,
  scenario:
    'Bayside Foods starts to send Brightmart its purchase orders as X12 850 over AS2 next week. Partner Manager knows nothing about them yet. Their onboarding sheet is in the Inbox, and their two certificates wait in Partner Manager. The order API brightmart-b2b-order-api runs and takes orders from any flow that delivers to it. Set up the partner and an inbound flow, take their test 850, and prove it ends as an order.',
  start() {
    const now = at(1, 9)
    const s = newPlatform({
      clock: now,
      apps: [newApp(NAME, { store: {} })],
      b2b: b2b(now),
      mail: [
        {
          t: at(1, 8, 30),
          to: OPS,
          subject: 'Bayside Foods EDI onboarding sheet',
          body: `Hello Brightmart. Our X12 identifiers: ISA qualifier 01 (DUNS), ISA ID 987654321, GS ID BAYSIDE, version 004010. AS2: our AS2 identifier is ${AS2}, our URL ${URL}. We sign with ${SIGN} and you encrypt for us with ${ENC}; both are uploaded to your Partner Manager. We want signed MDNs, synchronous. We expect a 997 for every 850. Contact edi@bayside-foods.example. When you are ready, ask us for a test 850. Bayside Foods EDI`,
          source: 'Bayside Foods',
        },
      ],
    })
    return until(s, at(1, 9, 1))
  },
  steps: [
    {
      title: 'Create the partner with its X12 identifiers',
      how: 'Partner Manager from the console menu, Partners, New partner. Name Bayside Foods, ISA qualifier 01, ISA ID 987654321, GS ID BAYSIDE, the contact from the sheet. Press Create partner.',
      done: (s) => partner(s)?.isaQual === '01' && partner(s)?.isaId === '987654321' && partner(s)?.gsId === 'BAYSIDE',
    },
    { title: 'Import the partner certificates', how: `Certificates. Under Certificates sent by partners press Import on ${SIGN} and on ${ENC}.`, done: (s) => Boolean(certOf(s.b2b, SIGN) && certOf(s.b2b, ENC)) },
    {
      title: 'Set up the AS2 endpoint',
      how: `Partners, Bayside Foods, AS2 endpoint. Partner AS2 identifier ${AS2} (the AS2-From of its messages, and the AS2-To of yours), URL ${URL}, Signing certificate ${SIGN}, Encryption certificate ${ENC}, MDN Synchronous, Signed MDN ticked. Press Save endpoint.`,
      done: (s) => ep(s)?.as2Id === AS2 && ep(s)?.url === URL && ep(s)?.signCert === SIGN && ep(s)?.encCert === ENC && ep(s)?.mdn === 'sync' && ep(s)?.mdnSigned === true,
    },
    ask(
      'Which certificate does what',
      'Bayside Foods sent two public certificates. What does Partner Manager do with each?',
      [
        'Both encrypt what Brightmart sends, one for each direction',
        'Brightmart verifies the signature of each Bayside message with the signing certificate, and encrypts what it sends to Bayside with the encryption certificate. Bayside encrypts for Brightmart with Brightmart\'s own certificate, and each side keeps its private keys',
        'Brightmart signs its messages with the Bayside signing certificate',
        'They are only needed for SFTP',
      ],
      1,
      'AS2 signs with the sender\'s private key and encrypts with the receiver\'s public certificate. So the partner profile holds the partner\'s public signing and encryption certificates, and the host profile holds Brightmart\'s own. A wrong signing certificate gives a negative MDN with authentication-failed, a wrong encryption certificate gives decryption-failed on the partner side.',
    ),
    {
      title: 'Create the inbound 850 flow',
      how: `Message flows, New message flow. Partner Bayside Foods, Direction Inbound, Document type 850, name it, pick ${NAME} in Target, keep Validate X12 ticked. Press Create flow.`,
      done: (s) => Boolean(flow(s)?.validate && flow(s)?.target?.app === NAME),
    },
    { title: 'Send a 997 for each 850', how: 'Open the new flow. Under Settings tick Send 997, then press Save settings.', done: (s) => flow(s)?.ack997 === true },
    {
      title: 'Alert when something goes wrong',
      how: `In the same flow, Alerts: tick Alert when a 997 rejects a document and Alert on a negative MDN, put ${OPS} in Alert recipients and press Save alerts.`,
      done: (s) => Boolean((flow(s)?.alerts?.rejected997 || flow(s)?.alerts?.negativeMdn) && flow(s)?.alerts?.to?.trim()),
    },
    { title: 'Deploy the flow', how: 'In the same flow press Deploy. It deploys only when the partner has an AS2 endpoint with both certificates. The status turns to Running.', done: (s) => Boolean(flow(s)) && flowStatus(flow(s)) === 'Running' },
    ask(
      'What proves it works',
      'The test 850 will come back with a 997 AK9 A. Is the setup done then?',
      [
        'Yes. A 997 with A means the order is in the order system',
        'Not yet. The 997 says only that the X12 passed the checks. It is done when Tracking shows the 850 Acknowledged and delivered, and the order API has the order. The MDN, the 997 and the target each prove one part',
        'Yes, as soon as the MDN says processed',
        'Only when Bayside sends a second test',
      ],
      1,
      'An end to end test follows one document through every hop: AS2 and its MDN, the envelope and validation, the 997 back to the partner, the mapping, and the call to the target. Search Tracking by the interchange number and check each line of its history, then look for the order itself.',
    ),
    {
      title: 'Take the test 850 to an order',
      how: 'Partners, Bayside Foods, press Request test 850. Move the clock 5 minutes. In Tracking the 850 BF-10001 is Acknowledged with a 997 A, and the logs of brightmart-b2b-order-api show the order. If it failed, read its history, fix the setup and request the test again.',
      done: (s) => {
        const tx = txOf(s.b2b).find((t) => t.dir === 'in' && t.partner === ID && t.type === '850' && t.status === 'Acknowledged' && t.ack?.code === 'A' && mdnOk(t.as2?.mdn))
        return Boolean(tx && app(s, NAME)?.store?.orders?.[tx.ref])
      },
    },
  ],
  why: 'Onboarding an EDI partner in Partner Manager follows the layers of the exchange. The partner profile holds its X12 identifiers, ISA qualifier and ID and GS ID, which must match its envelopes. Its AS2 endpoint holds the AS2 identifier that becomes AS2-From and AS2-To, the URL, and its public signing and encryption certificates, with the MDN it wants. An inbound message flow then validates the 850, sends the 997, maps the order and calls the target, and it runs only once deployed. Alerts make a rejected 997 or a negative MDN visible. A test document that ends as an order proves every hop. In the lab the partner sends its test two minutes after you ask, and the order API takes its orders from the flow instead of an HTTP call.',
  docs: 'https://docs.mulesoft.com/partner-manager/latest/',
  solve(start) {
    let s = createPartner(start, { name: 'Bayside Foods', isaQual: '01', isaId: '987654321', gsId: 'BAYSIDE', contact: 'edi@bayside-foods.example' })
    s = importCert(importCert(s, SIGN), ENC)
    s = setEndpoint(s, ID, { as2Id: AS2, url: URL, signCert: SIGN, encCert: ENC, mdn: 'sync', mdnSigned: true })
    s = createFlow(s, { name: 'Bayside 850 to Order API', partner: ID, dir: 'inbound', type: '850', target: NAME, validate: true, ack997: false })
    const id = flow(s).id
    s = setFlow(s, id, { ack997: true })
    s = setFlow(s, id, { alerts: { rejected997: true, negativeMdn: true, to: OPS } })
    s = deployFlow(s, id)
    s = requestTest(s, ID)
    return advance(s, 5 * MINUTE)
  },
  answers: { 3: 1, 8: 1 },
}

export const LABS = [lab]
