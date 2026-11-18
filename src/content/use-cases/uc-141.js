import { diagram } from '../../arch/dsl.js'

const bookings = { type: 'saas', label: 'booking' }
const partners = { name: 'partner bookings', from: 'partner', rps: 60, to: bookings, kind: 'write' }

export default {
  id: 'uc-141',
  category: 'use-cases',
  title: 'Restaurant Bookings From Partner Sites: Each Partner Has a Client ID, One Experience API Serves Them All, and the Booking System Sits Behind a System API',
  level: 'BEGINNER',
  tags: ['partners', 'api-gateway', 'client-id', 'experience-api', 'system-api', 'hospitality'],
  estMinutes: 20,
  diagram: {
    task: 'draw the partner sites calling an API gateway that checks client IDs, then a partner bookings Experience API, which reaches the table booking system through a System API.',
    checks: [
      { label: 'Partner sites come in through the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Bookings reach the booking system through a System API', rule: { type: 'path', from: 'experience-api', via: 'system-api', to: bookings } },
      { label: 'The booking system is reached only through a System API', rule: { type: 'only-via', target: bookings, from: 'system-api' } },
    ],
    reference: diagram(
      {
        ptn: ['partner', 'Partner booking sites'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id' }],
        exp: ['experience-api', 'exp-partner-bookings', { vCores: '0.2' }],
        sys: ['system-api', 'sys-table-bookings', { vCores: '0.2' }],
        tbs: ['saas', 'Table booking system'],
      },
      ['ptn -> gw', 'gw -> exp', 'exp -> sys', 'sys -> tbs'],
    ),
    simulation: {
      systems: [{ match: 'saas', latencyMs: 200, maxRps: 150 }],
      tests: [
        {
          name: 'Friday evening',
          about: 'The partner sites send 60 bookings and availability checks a second. Each one is answered quickly.',
          traffic: [partners],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400 }] },
        },
        {
          name: 'A caller with no client ID',
          about: 'A site that never signed up calls the API with no credentials. The gateway refuses it, and nothing reaches the booking system.',
          traffic: [{ ...partners, name: 'unknown site', rps: 10, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'unknown site', minRefused: 0.99 }], notReached: [{ flow: 'unknown site', node: bookings }] },
        },
      ],
    },
  },
  description: `
A group of 30 restaurants takes bookings on its own website, through a **table booking system** it rents as a SaaS product. Now restaurant guide sites and a hotel concierge app want to offer the group's tables on their own pages. These **partner booking sites** will check free tables and make bookings.

Each partner signs a contract and is given its own credentials. The group wants to know which partner made each booking, to pay them a fee.

**Numbers**
- About **60 calls a second** from all partners on a Friday evening.
- The booking system answers in about 200 ms.

**Questions:**
- Draw the design.
- How does the group know which partner is calling, and keep out sites that never signed up?
- Why one Experience API for all partners, and a System API for the booking system?
`,
  answerTemplate: `## Design

## Knowing the partner

## The API layers
`,
  keyPoints: [
    'Partners come in through an API gateway with a client ID enforcement policy. Each partner has its own client ID and secret, so every call says who made it.',
    'A call without valid credentials is refused at the gateway and never reaches Mule or the booking system.',
    'One Experience API shaped for partners serves all of them. A new partner is a new client ID, not new code.',
    'The System API hides the booking system\'s own API, so a change of booking product changes one API.',
    'The client ID travels with the booking, so finance can count bookings per partner.',
  ],
  solution: `
**Design**
\`\`\`
Partner booking sites ─► API gateway (client ID) ─► exp-partner-bookings ─► sys-table-bookings ─► Table booking system
\`\`\`

**Knowing the partner.** Each partner registers an application in Exchange and gets a client ID and secret. The client ID enforcement policy checks them on every call. The Experience API stores the client ID on each booking it makes.

**The API layers.** \`exp-partner-bookings\` offers a small, stable API for partners: find tables, book, cancel. \`sys-table-bookings\` turns those calls into the booking system's own API and holds its credentials.

**Sizing.** 60 calls a second is more than the smallest size takes in this model, so each API gets 0.2 vCore.
`,
  followUps: [
    {
      q: 'One partner sends far more calls than the others. What would you add?',
      a: 'A rate limit per client, through an SLA based policy with tiers in the partner contracts, so one partner cannot use up the booking system\'s capacity.',
    },
    {
      q: 'Is a client ID enough security for bookings?',
      a: 'It identifies the partner, but the secret travels with every call. For partners that handle customer data, OAuth 2.0 client credentials with short lived tokens is a stronger choice.',
    },
  ],
}
