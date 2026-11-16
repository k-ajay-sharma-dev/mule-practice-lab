import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-124',
  category: 'architecture',
  title: 'Why a Mobile App Must Not Call a System API Directly',
  level: 'BEGINNER',
  tags: ['api-led', 'layers', 'experience-api', 'system-api', 'mobile'],
  estMinutes: 20,
  diagram: {
    task: 'draw the design without the shortcut. Use five boxes: a Mobile app box, an Experience API box, a Process API box, a System API box and a SaaS application box for the HR system. Connect them in that order, with one line between each pair. Do not draw a line from the Mobile app to the System API.',
    checks: [
      { label: 'The mobile app calls the Experience API', rule: { type: 'edge', from: 'mobile-app', to: 'experience-api' } },
      { label: 'The mobile app never calls the System API directly', rule: { type: 'no-edge', from: 'mobile-app', to: 'system-api' } },
      { label: 'The request reaches the System API through the Process API', rule: { type: 'path', from: 'mobile-app', to: 'system-api', via: 'process-api' } },
      { label: 'Only the Process API calls the System API', rule: { type: 'only-via', target: 'system-api', from: 'process-api' } },
      { label: 'The System API connects to the HR system', rule: { type: 'edge', from: 'system-api', to: 'saas' } },
      { label: 'The leave balance request is a sync call at every step down to the HR system', rule: { type: 'path', from: 'mobile-app', to: 'saas', kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Staff mobile app'],
        exp: ['experience-api', 'exp-staff-mobile-api', { auth: 'jwt' }],
        prc: ['process-api', 'prc-leave-balance-api'],
        sys: ['system-api', 'sys-hr-api', { rateLimit: 22 }],
        hr: ['saas', 'HR system'],
      },
      ['mob -> exp', 'exp -> prc', 'prc -> sys', 'sys -> hr'],
    ),
    simulation: {
      systems: [{ match: 'saas', latencyMs: 300, maxRps: 25 }],
      tests: [
        {
          name: 'Monday morning',
          about: 'Staff check their leave 15 times a second, and 45 times a second for two minutes when the rota is published. The HR system must never get more than the 25 a second its vendor allows.',
          traffic: [{ name: 'staff', from: 'mobile-app', rps: 15, to: 'saas', spikes: [{ at: 4, forMin: 2, rps: 45 }] }],
          expect: { answers: [{ minSuccess: 0.7, maxMs: 800 }], peakRps: [{ node: 'saas', max: 25 }] },
        },
        {
          name: 'Calls without a staff token',
          about: 'Staff send 15 requests a second with their token. An old test build sends 10 a second with none. The Experience API refuses it, and staff get every answer.',
          traffic: [
            { name: 'staff', from: 'mobile-app', rps: 15, to: 'saas' },
            { name: 'old build', from: 'mobile-app', rps: 10, auth: 'none', to: 'saas' },
          ],
          expect: { answers: [{ flow: 'staff', minSuccess: 0.99 }, { flow: 'old build', minRefused: 0.99 }], notReached: [{ flow: 'old build', node: 'saas' }] },
        },
      ],
    },
  },
  description: `
Staff at a hospital group want to see their leave balance in a mobile app. The data sits in a cloud HR system, which already has a **System API**, an API that talks to one backend system.

A developer suggests a shortcut: call the System API straight from the app. It would save two APIs: an **Experience API**, which shapes data for one kind of client, and a **Process API**, which holds the business rules. A rule decides how much leave each person can see, and that rule belongs in the Process API.

Some numbers for the design:
- Staff check their leave about 15 times a second. When a new rota is published, that rises to 45 a second for a couple of minutes.
- The HR system answers in about 300 ms. Its vendor allows at most 25 API calls a second.
- Staff sign in, and the app sends a token (a JWT) with each request. An old test build that sends no token is still installed on some phones.

**Questions:**
- Draw the design without the shortcut.
- Give two reasons to reject the shortcut.
`,
  answerTemplate: `## Design

## Why not the shortcut
`,
  keyPoints: [
    'Nothing technical stops the call. This is a design rule of API-led connectivity.',
    'With the shortcut, business rules move into the app or get skipped.',
    'Installed apps stay on phones, so a System API change can break old versions.',
    'The Experience API gives the app a stable contract that suits it.',
    'The Experience API is where the app comes in, so JWT Validation there refuses callers without a token. A rate limit of 22 a second on the System API keeps the HR system under its vendor quota.',
  ],
  solution: `
**Design.**
\`\`\`
 Staff mobile app ─► exp-staff-mobile-api ─► prc-leave-balance-api ─► sys-hr-api ─► HR system
\`\`\`

**Why not the shortcut.**
- **The rule has no home.** The leave rule would have to live in the app, or be skipped. Every other channel would then need its own copy.
- **The app is tied to the backend.** If the HR system changes and the System API changes with it, every installed copy of the app can break. People do not all update at once.
- **The app gets the wrong data.** A System API returns what the backend holds, not what a small screen needs.

The shortcut does save work today. The cost arrives later, each time something changes.

**Policies.** JWT Validation on the Experience API refuses a request without a staff token, so the old test build never reaches the HR system. The System API is the one door to the HR system, so a Rate Limiting policy of 22 a second there keeps every caller, now and later, under the vendor quota of 25. When a rota is published, the extra requests get HTTP status 429 and the app tries again a moment later.
`,
  followUps: [
    {
      q: 'Is a direct call ever acceptable?',
      a: 'Sometimes. A small internal tool with one user group may not need all the layers. Make the choice on purpose, and record why.',
    },
    {
      q: 'What can the team do so the app does not hit the System API by accident?',
      a: 'Keep the System API on an internal network path, and require credentials that only the Process API holds.',
    },
  ],
}
