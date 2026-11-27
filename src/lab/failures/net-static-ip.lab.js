// The guided lab net-static-ip. See platform-labs.js for the shape of a lab.
import { advance, at, deleteApp, deployApp, finishDeploys, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { egressOf, enableStaticIps, inCidr, newNetwork, newSpace, newVpn, sendMail, spaceOf, staticIpsOf } from '../platform-network.js'
import { FLOW, NAME, PARTNER } from './net-static-ip.pkg.js'

const SPACE = 'harbor-ps'
const CONTACT = 'integration@larkspur-freight.example'
const PROPS = { 'partner.host': PARTNER, 'partner.path': '/v2/bookings' }

const space = (s) => spaceOf(s, SPACE)
const statics = (s) => staticIpsOf(space(s))
const allow = (s) => s.network?.internet?.[PARTNER]?.allow ?? []
const allowed = (s, ip) => allow(s).some((c) => inCidr(ip, c))
const inSpace = (s) => app(s, NAME)?.target === SPACE && app(s, NAME)?.status === 'Running'
const partnerOk = (s) => statics(s).length > 0 && statics(s).every((ip) => allowed(s, ip))
const lastRun = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last

const lab = {
  id: 'p-net-static-ip',
  group: 'Networking',
  title: 'The partner who knows only one address',
  minutes: 20,
  scenario:
    'larkspur-booking-sync posts the freight bookings of Harbor to the booking API of Larkspur Freight every 5 minutes. Larkspur lets in only the addresses on its allowlist, and a month ago Harbor sent them the outbound IP the app had then. It is Tuesday 09:00. At 07:30 a colleague changed a property and pressed Apply Changes. Since then every call gets 403. The app runs in the shared space. The Inbox has the mails.',
  start() {
    const s0 = newPlatform({
      clock: at(1, 6),
      jars: [NAME],
      apps: [newApp(NAME, { props: { ...PROPS, 'bookings.batch': '50' }, store: {}, updated: at(0, 10) })],
      network: newNetwork({
        spaces: [newSpace(SPACE, { vpns: [newVpn('harbor-dc-vpn', { routes: ['10.20.0.0/16', '10.40.0.0/16'] })], dns: [{ domain: 'corp.harbor.lab', servers: ['10.20.0.53'] }] })],
      }),
    })
    // the address of the app a month ago is what Larkspur allowlisted
    const old = egressOf(s0, s0.apps[0])
    s0.network.internet[PARTNER].allow = [`${old}/32`]
    s0.mail.push(
      {
        t: at(0, 10),
        to: OPS,
        subject: 'Larkspur allowlist done',
        body: `Hello Harbor team. As you asked, ${old} is on the allowlist of ${PARTNER}. Calls from any other address get 403. Changes to the allowlist go through ${CONTACT}. Larkspur Freight integration team`,
        source: 'Larkspur Freight',
      },
      {
        t: at(0, 16),
        to: OPS,
        subject: 'Private space harbor-ps: static IPs',
        body: `Reminder from the network team: apps in the shared space call out from addresses that change. For partners that allowlist us, use the private space ${SPACE}. Its static IPs are not enabled yet; enable them on the Network tab and allowlist every address it shows. Network team`,
        source: 'Harbor network team',
      },
    )
    let s = until(s0, at(1, 7, 30))
    s = change(s, NAME, { props: { ...PROPS, 'bookings.batch': '100' } })
    s = until(s, at(1, 8, 40))
    s.mail.push({ t: at(1, 8, 40), to: OPS, subject: 'Bookings missing since 07:30', body: `Hello Harbor team. We have no bookings from you since 07:30. Our gateway refuses your calls with 403 because they come from an address we do not know. Larkspur Freight integration team`, source: 'Larkspur Freight' })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Each run fails with HTTP:FORBIDDEN, and the body names the client IP.` },
    ask(
      'Read the 403',
      'The calls worked until 07:30 and nobody changed the partner settings. The body says the client IP is not on the allowlist. What happened?',
      [
        'Larkspur rotated our API key',
        'Apply Changes started new replicas, and in the shared space the outbound IP of an app is not fixed, so the calls now come from another address',
        'The property bookings.batch is too large for Larkspur',
        'The certificate of Larkspur expired',
      ],
      1,
      'A 403 that names the client IP is an allowlist problem, not a login problem. The only change was the redeploy, and the address in the body differs from the one in the mail of Larkspur.',
    ),
    {
      title: 'Open the private space',
      how: `Private spaces from the console menu, ${SPACE}, tab Network. Static IPs are not enabled yet. Look at the CIDR block and the Applications tab as well: ${NAME} is not in the space.`,
      done: (s) => Boolean(s.seen[`ps:${SPACE}`]),
    },
    {
      title: 'Enable static IPs',
      how: `On the Network tab press Enable static IPs. The state is Pending for about two minutes and then lists the addresses of ${SPACE}.`,
      done: (s) => statics(s).length > 0,
    },
    ask(
      'Why the shared address moves',
      'Why can the outbound IP of an app in the shared space change?',
      [
        'Because Larkspur changes it',
        'The shared space sends traffic out through addresses of the platform that many customers share. A redeploy or a restart can put the replicas on other workers, so the address can change. Fixed outbound addresses come with a private space',
        'Because Apply Changes always releases the app address',
        'It never changes. Larkspur made a mistake',
      ],
      1,
      'In the shared space you do not own the outbound addresses, so you cannot promise one to a partner. A private space with static IPs gives a fixed set of addresses to every app in it.',
    ),
    {
      title: 'Move the app into the private space',
      how: `The deployment target cannot change on Apply Changes in CloudHub 2.0, so redeploy: in Runtime Manager delete ${NAME}, then Deploy application with the same name, target Private Space ${SPACE}, file ${NAME}-1.0.0-mule-application.jar, and the properties partner.host ${PARTNER} and partner.path /v2/bookings. A public endpoint is not needed.`,
      done: inSpace,
    },
    ask(
      'What to send to Larkspur',
      'Which addresses do you ask Larkspur to allowlist?',
      [
        'The address the app has now, the one in the 403 body',
        'Every static IP of the private space, because each replica can call out from any of them',
        'The CIDR block of the space, 10.110.0.0/22',
        '0.0.0.0/0, so this never happens again',
      ],
      1,
      'The static IPs are the public addresses the space uses for outbound calls. The CIDR block is private and never reaches Larkspur. One address is not enough: the next replica or redeploy can use the other one. 0.0.0.0/0 would turn the allowlist off.',
    ),
    {
      title: 'Send the static IPs to Larkspur',
      how: `Private spaces, ${SPACE}, Network, under Static IPs: Mail these addresses. Send them to ${CONTACT}. Larkspur answers in about ten minutes and adds the addresses to its allowlist. Move the clock forward to see the answer in the Inbox.`,
      done: partnerOk,
    },
    {
      title: 'Watch the next run',
      how: 'Move the clock until the next run after Larkspur answered. The run posts the waiting bookings and gets 201 Created.',
      done: (s) => {
        const last = lastRun(s)
        return inSpace(s) && partnerOk(s) && Boolean(last?.ok) && last.t > app(s, NAME).updated && (app(s, NAME).store?.sent ?? 0) > 0
      },
    },
  ],
  why: 'A partner that allowlists your outbound IP needs addresses that do not change. Apps in the shared space of CloudHub 2.0 call out through addresses of the platform, so a redeploy or a restart can change the address and the partner answers 403. Put the app in a private space, enable static IPs, and send every static IP to the partner before you depend on them. The same holds for an Azure storage account or Key Vault with a firewall. In the lab the partner reads your mail through a lab mail tool and the address an app uses is picked from its configuration number.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), `ps:${SPACE}`)
    s = advance(enableStaticIps(s, SPACE), 3 * MINUTE)
    s = deleteApp(s, NAME)
    s = finishDeploys(deployApp(s, { name: NAME, pkg: NAME, jar: `${NAME}-1.0.0-mule-application.jar`, target: SPACE, publicEndpoint: false, replicas: 1, vCores: 0.1, props: { ...PROPS }, secrets: {} }).state)
    s = sendMail(s, CONTACT, `Static IPs of Harbor for ${PARTNER}`, `Please allowlist ${statics(s).join(' and ')}.`)
    return advance(s, 16 * MINUTE)
  },
  answers: { 1: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
