import { diagram } from '../../arch/dsl.js'

const web = { name: 'status page', from: 'web-app', rps: 30, to: 'saas' }
const app = { name: 'app banner', from: 'mobile-app', rps: 20, to: 'saas' }
const outage = (f, rps) => ({ ...f, spikes: [{ at: 5, forMin: 40, rps }] })

export default {
  id: 'ar-152',
  category: 'architecture',
  title: 'A Public Status Page During a Big Outage: 60 Times the Usual Traffic, a Cache in Front, and an Incident Tool That Must Stay Usable',
  level: 'ADVANCED',
  tags: ['cache', 'spike', 'api-gateway', 'scaling', 'experience-api', 'telecom'],
  estMinutes: 35,
  diagram: {
    task: 'draw the read path for service status: the public status page and the mobile app go through an API gateway to a status Experience API, which reads a cache first and otherwise calls the incident tool through a System API.',
    checks: [
      { label: 'The status page and the app both come in through the API gateway', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: 'api-gateway', count: 1 } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The Experience API reads a cache', rule: { type: 'edge', from: 'experience-api', to: 'cache' } },
      { label: 'The incident tool is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'No public channel calls the incident tool directly', rule: { type: 'no-edge', from: ['web-app', 'mobile-app'], to: 'saas' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Public status page'],
        app: ['mobile-app', 'Customer app status banner'],
        gw: ['api-gateway', 'API gateway'],
        exp: ['experience-api', 'exp-service-status', { replicas: 4, vCores: '2' }],
        c: ['cache', 'Status cache', { ttlSec: 30 }],
        sys: ['system-api', 'sys-incident-tool'],
        tool: ['saas', 'Incident management tool'],
      },
      ['web -> gw', 'app -> gw', 'gw -> exp', 'exp -> c', 'exp -> sys', 'sys -> tool'],
    ),
    simulation: {
      systems: [{ match: 'saas', latencyMs: 400, maxRps: 40 }],
      cache: { hitRatio: 0.99, atTtlSec: 30 },
      tests: [
        {
          name: 'A normal evening',
          about: 'About 50 status reads a second. Every one is answered quickly.',
          traffic: [web, app],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }] },
        },
        {
          name: 'A national outage',
          about: 'The network is down in one region and 3,000 people a second open the status page or the app. Everyone gets an answer, and the incident tool sees only a trickle of reads.',
          traffic: [outage(web, 2200), outage(app, 800)],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], peakRps: [{ node: 'saas', max: 40 }] },
        },
        {
          name: 'The incident tool stops answering',
          about: 'Engineers are rebuilding the incident tool during the outage and it is down for 15 minutes. The page keeps showing the last known status from the cache.',
          traffic: [outage(web, 2200), outage(app, 800)],
          incidents: [{ down: 'saas', at: 10, forMin: 15 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.98 }] },
        },
      ],
    },
  },
  description: `
A mobile network shows the state of its service on a **public status page** and in a banner in its **customer app**. Both read the current incidents from the **incident management tool** the engineers use, a SaaS product that allows about **40 API calls a second**.

On a normal evening about **50 people a second** look. During last spring's outage it was more than **3,000 a second**. The status page called the incident tool for every visitor, the tool hit its limit, and the engineers fixing the outage could not update incidents in their own tool. The status page showed errors, and the call centre was flooded.

The communications team says a status that is up to **30 seconds old** is fine.

**Questions:**
- Draw the read path so that a spike of 3,000 a second never reaches the incident tool.
- How fresh is the answer, and why is that acceptable?
- What do visitors see if the incident tool is down?
- How do you size the Experience API for the spike?
`,
  answerTemplate: `## Design

## The cache and its time to live

## When the incident tool is down

## Sizing for the spike
`,
  keyPoints: [
    'Every visitor asks the same question, so a cache answers almost all of them. Only a few reads a second go to the incident tool.',
    'Set the time to live to what the business accepts, here 30 seconds. A longer time to live means fewer calls to the tool, a shorter one means a fresher page.',
    'Keep the incident tool behind a System API and never let a public channel reach it, so engineers keep their own tool during an outage.',
    'Size the Experience API for the spike, not the evening. In this model 3,000 reads a second needs several vCores spread over several replicas.',
    'Put the public traffic through a gateway, where you can add a rate limit per client and protect against abuse.',
    'If the tool is down, answering from the cache with the time of the last update is better than an error.',
  ],
  solution: `
**Design**
\`\`\`
Public status page ─┐
Customer app ───────┴─► API gateway ─► exp-service-status ─► sys-incident-tool ─► Incident tool
                                              └─► Status cache (time to live 30 s)
\`\`\`

**The cache and its time to live.** The status is the same for everyone in a region, so the cache key is the region. With a 30 second time to live, each region's entry is refreshed about twice a minute. Entries expire at different moments and new replicas start empty, so some reads still miss. This model counts about 1 read in 100 as a miss: a few dozen calls a second at the peak, inside what the tool allows, instead of 3,000.

**When the incident tool is down.** Visitors get the cached status. Keep the last known answer with the time it was read, and show that time on the page, so nobody mistakes an old status for a new one.

**Sizing for the spike.** In this model one vCore serves about 500 reads a second. 3,000 a second needs about 6 vCores of headroom, so four replicas of 2 vCores, which leaves room for a bigger spike. The System API and the tool are untouched by the spike, so they stay small.
`,
  followUps: [
    {
      q: 'Why not put the status page behind a CDN instead?',
      a: 'A CDN in front would take even more load off and is worth adding for the public page. The app banner and partner feeds still go through the API, so the cache in the API layer is needed either way.',
    },
    {
      q: 'What if an incident must show at once, not after 30 seconds?',
      a: 'Have the incident tool send an event on each change, and clear or refresh the cache entry when it arrives. The time to live is then only the fallback.',
    },
  ],
}
