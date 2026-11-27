// The guided lab b2b-997-missing. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { ask, OPS, until } from '../platform-kit.js'
import { certOf, fill, flowOf, importCert, mdnOk, newCert, partnerOf, resendFailed, setEndpoint, setFlow, txOf } from '../platform-b2b.js'
import { NAME } from './b2b-997-missing.pkg.js'

const PARTNER = 'bayline'
const NEW_CERT = 'bayline-enc-2026'
const PM_FLOW = 'bayline-856-out'

function b2b(now) {
  const b = fill({ created: now })
  // Bayline rotated its encryption key on Wednesday 4 November: it decrypts only with the new one now
  b.partnerKeys = { [PARTNER]: NEW_CERT }
  b.offered = [{ ...newCert(NEW_CERT, PARTNER, 'Encryption', 'as2.bayline-logistics.example', at(2), at(367)), note: 'Sent by Bayline Logistics by mail on 4 Nov 2026' }]
  return b
}

const asns = (s) => txOf(s.b2b).filter((t) => t.dir === 'out' && t.type === '856')
const flow = (s) => flowOf(s.b2b, PM_FLOW)
const endpoint = (s) => partnerOf(s.b2b, PARTNER)?.as2
const lost = (s) => asns(s).filter((t) => !t.orig && t.as2?.mdn && !mdnOk(t.as2.mdn))
const recovered = (s, t) => asns(s).some((x) => x.orig === t.id && mdnOk(x.as2?.mdn))

const lab = {
  id: 'p-b2b-997-missing',
  group: 'B2B and EDI',
  title: 'Ship notices sent, never received',
  minutes: 25,
  scenario:
    'Every 15 minutes a truck leaves the Brightmart warehouse, and brightmart-asn-dispatch sends Bayline Logistics an 856 ship notice through Partner Manager over AS2. The app logs each one as sent. It is Tuesday 09:00. Bayline writes that they have no ship notices from Brightmart and cannot plan the trucks at their hub. Tracking keeps today\'s transmissions.',
  start() {
    const now = at(8, 6)
    const s = newPlatform({
      clock: now,
      apps: [newApp(NAME, { store: {} })],
      b2b: b2b(now),
      mail: [
        { t: at(2, 10), to: 'edi-team@brightmart.example', subject: 'Bayline AS2 certificate rotation on 4 November', body: 'Hello trading partners, we replaced our AS2 encryption certificate today. The new certificate bayline-enc-2026 is attached and waits in your Partner Manager under Certificates sent by partners. Please encrypt with it from now on: our old key is no longer in use. Bayline EDI support', source: 'Bayline Logistics' },
        { t: at(8, 8, 45), to: OPS, subject: 'No ship notices from Brightmart', body: 'We have no 856 from Brightmart this week and no 997 went back to you, because nothing arrived that we could read. Our hub cannot plan your trucks without them. Bayline hub operations', source: 'Bayline Logistics' },
      ],
    })
    return until(s, at(8, 9))
  },
  steps: [
    { title: 'Open the tracking of Partner Manager', how: 'Partner Manager from the console menu, Tracking. Pick Bayline Logistics in Partner: every 856 since 06:00 is Failed, and none has a 997.', done: (s) => Boolean(s.seen['b2b:tracking']) },
    { title: 'Read the MDN and the raw EDI', how: 'Open one of the failed 856s. Its Summary shows the MDN that Bayline returned, with the disposition and no Received-Content-MIC. Then open the tab Raw EDI to see the interchange that was sent.', done: (s) => Boolean(s.seen['b2b:raw']) },
    ask(
      'MDN or 997',
      'The app logs every ASN as sent. What does the MDN tell you that the 997 cannot?',
      [
        'Nothing: the MDN and the 997 are the same receipt in two formats',
        'The MDN is the AS2 receipt: the partner got the message, could decrypt it and verify the signature, and the MIC proves the content. The 997 is the X12 receipt that comes after it parses the EDI. A negative MDN means the partner has no document, so a 997 can never come',
        'The MDN confirms the shipment and the 997 confirms the invoice',
        'An MDN comes only when the 997 is rejected',
      ],
      1,
      'AS2 is the transport and the MDN is its signed receipt, synchronous in the HTTP response or asynchronous to a URL. "processed/error: decryption-failed" means the partner could not open the message. The 997 belongs to X12 and can only be sent for a document the partner could read. HTTP 200 on the POST says neither.',
    ),
    { title: 'Look at the certificates', how: 'Certificates. Compare the encryption certificate the Bayline endpoint uses with the one under Certificates sent by partners, and read the dates.', done: (s) => Boolean(s.seen['b2b:certs']) },
    {
      title: 'Encrypt with the new Bayline certificate',
      how: `Certificates, under Certificates sent by partners press Import on ${NEW_CERT}. Then Partners, Bayline Logistics, AS2 endpoint: pick ${NEW_CERT} in Encryption certificate and press Save endpoint.`,
      done: (s) => endpoint(s)?.encCert === NEW_CERT && Boolean(certOf(s.b2b, NEW_CERT)),
    },
    ask(
      'Certificate rotation',
      'How should a certificate rotation with a trading partner go, so this does not happen again?',
      [
        'Wait until the old certificate expires and change it on that day',
        'Agree a date, get the new public certificate before it, import it and switch on that date. Where the partner can, it accepts both keys for a while. Watch the expiry dates and the partner mail, because a missed switch fails quietly in an MDN',
        'Ask the partner for its private key, so both sides can decrypt',
        'Turn encryption off while the certificates change',
      ],
      1,
      'You encrypt with the partner\'s public certificate and the partner decrypts with its private key, which never leaves it. When the partner rotates, every message encrypted for the old certificate is unreadable on its side. An overlap where it accepts both keys, a date agreed in advance and alerts on negative MDNs turn a silent loss into a planned change.',
    ),
    {
      title: 'Resend the failed ship notices',
      how: 'Tracking, pick Bayline Logistics in Partner and press Resend all failed. They go out again with the same control numbers, which Bayline never processed. Move the clock 5 minutes and check their MDNs and 997s.',
      done: (s) => lost(s).length > 0 && lost(s).every((t) => recovered(s, t)),
    },
    {
      title: 'Alert on a negative MDN and a missing 997',
      how: `Message flows, Ship notice 856 to Bayline, Alerts. Tick Alert on a negative MDN, put 30 in 997 expected within (minutes), put ${OPS} in Alert recipients and press Save alerts.`,
      done: (s) => Boolean(flow(s)?.alerts?.negativeMdn && flow(s)?.alerts?.to?.trim()) && Number(flow(s)?.ackWindowMin) > 0 && Number(flow(s)?.ackWindowMin) <= 240,
    },
    {
      title: 'Watch the next ship notices',
      how: 'Move the clock 30 minutes after the certificate change. Each new 856 gets a processed MDN and then a 997 with AK9 A, and none fails.',
      done: (s) => {
        const since = endpoint(s)?.encSince
        if (since === undefined || endpoint(s)?.encCert !== NEW_CERT || s.clock < since + 30 * MINUTE) return false
        const fresh = asns(s).filter((t) => !t.orig && t.t > since)
        const young = (t) => s.clock - t.t < 10 * MINUTE
        return fresh.some((t) => t.ack?.code === 'A') && fresh.every((t) => t.status !== 'Failed' && (young(t) || (mdnOk(t.as2?.mdn) && t.ack?.code === 'A')))
      },
    },
  ],
  why: 'AS2 gives two receipts. The MDN says the partner got the message, decrypted it and verified the signature, and its MIC proves the content. The 997 says the EDI inside passed the X12 checks. Bayline rotated its encryption certificate, Brightmart kept encrypting for the old one, and every MDN said "processed/error: decryption-failed". The app took HTTP 200 as done, so nobody knew. The fix is to import the new public certificate, put it on the endpoint, resend what failed, and alert on a negative MDN and on a 997 that does not come within the agreed window. In the lab the partner decrypts only with its current key, its MDN comes one minute after a send, and its 997 four minutes after.',
  docs: 'https://docs.mulesoft.com/partner-manager/latest/',
  solve(start) {
    let s = mark(mark(mark(start, 'b2b:tracking'), 'b2b:raw'), 'b2b:certs')
    s = setEndpoint(importCert(s, NEW_CERT), PARTNER, { encCert: NEW_CERT })
    s = resendFailed(s, PARTNER)
    s = setFlow(s, PM_FLOW, { ackWindowMin: 30, alerts: { negativeMdn: true, to: OPS } })
    return advance(s, 31 * MINUTE)
  },
  answers: { 2: 1, 5: 1 },
}

export const LABS = [lab]
