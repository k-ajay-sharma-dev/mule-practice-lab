import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-123',
  category: 'architecture',
  title: 'A Mobile App Down Through All Three API Layers',
  level: 'BEGINNER',
  tags: ['api-led', 'layers', 'experience-api', 'process-api', 'system-api', 'mobile'],
  estMinutes: 15,
  diagram: {
    task: 'draw one request going down all three layers. Use five boxes: a Mobile app box, an Experience API box, a Process API box, a System API box and a Legacy / mainframe box. Connect them in that order, with one line between each pair.',
    checks: [
      { label: 'The mobile app calls the Experience API', rule: { type: 'edge', from: 'mobile-app', to: 'experience-api' } },
      { label: 'The Experience API calls the Process API', rule: { type: 'edge', from: 'experience-api', to: 'process-api' } },
      { label: 'The Process API calls the System API', rule: { type: 'edge', from: 'process-api', to: 'system-api' } },
      { label: 'The System API connects to the mainframe', rule: { type: 'edge', from: 'system-api', to: 'legacy' } },
      { label: 'The Experience API does not skip the Process layer', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The mobile app calls only the Experience API', rule: { type: 'no-edge', from: 'mobile-app', to: ['process-api', 'system-api', 'legacy'] } },
      { label: 'The mainframe is reached only through the System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The balance request is a sync call at every step down to the mainframe', rule: { type: 'path', from: 'mobile-app', to: 'legacy', kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Banking app'],
        exp: ['experience-api', 'exp-mobile-banking-api'],
        prc: ['process-api', 'prc-account-summary-api'],
        sys: ['system-api', 'sys-core-banking-api', { rateLimit: 28 }],
        core: ['legacy', 'Core banking mainframe'],
      },
      ['mob -> exp', 'exp -> prc', 'prc -> sys', 'sys -> core'],
    ),
    simulation: {
      systems: [{ match: 'legacy', latencyMs: 400, maxRps: 30 }],
      tests: [
        {
          name: 'A normal day',
          about: 'The app asks for 20 balances a second for ten minutes. Every request goes down the three layers to the mainframe and back in under a second.',
          traffic: [{ name: 'balances', from: 'mobile-app', rps: 20, to: 'legacy' }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], peakRps: [{ node: 'legacy', min: 15 }] },
        },
        {
          name: 'Payday morning',
          about: 'For three minutes on payday the app sends 45 balance requests a second. The mainframe must never get more than its 30 a second, and the extra requests are turned away.',
          traffic: [{ name: 'balances', from: 'mobile-app', rps: 20, to: 'legacy', spikes: [{ at: 3, forMin: 3, rps: 45 }] }],
          expect: { answers: [{ minSuccess: 0.7 }], peakRps: [{ node: 'legacy', max: 30 }] },
        },
      ],
    },
  },
  description: `
A bank wants its mobile app to show account balances. The balances live on a **mainframe**, an older central computer that runs the core banking system.

The bank uses three API layers:
- **Experience API:** shapes data for one kind of client, here the app.
- **Process API:** holds the business rules.
- **System API:** talks to the backend system.

Some numbers for the design:
- On a normal day the app asks for about 20 balances a second. The mainframe answers in about 400 ms, and a balance must show in under a second.
- On payday mornings the app sends up to 45 requests a second for a few minutes.
- The mainframe team allows at most 30 requests a second. More than that slows down the branches and the ATMs.

**Questions:**
- Draw the path of one balance request.
- In one sentence each, what does each layer do here?
`,
  answerTemplate: `## Request path

## What each layer does
`,
  keyPoints: [
    'A request goes down the layers in order: Experience, then Process, then System.',
    'The Experience API shapes data for one kind of client.',
    'The Process API holds the business rules.',
    'The System API hides the backend system from the layers above it.',
    'A rate limit a little under what the mainframe allows, such as 28 a second on the System API, protects it on payday. The extra requests get 429 and the app can try again.',
  ],
  solution: `
**Request path.**
\`\`\`
 Banking app ─► exp-mobile-banking-api ─► prc-account-summary-api ─► sys-core-banking-api ─► Core banking mainframe
\`\`\`

**What each layer does.**
| Layer | Job here |
|---|---|
| Experience | Returns only the fields the small phone screen needs |
| Process | Applies the rules, such as which accounts this customer may see |
| System | Talks to the mainframe and turns its data into a clean format |

The response travels back up the same path.

**Protecting the mainframe.** The mainframe allows 30 requests a second. A Rate Limiting policy of 28 a second on the System API keeps it under that limit with a small margin. On a normal day the app sends 20 a second and nothing is turned away. On payday the requests over the limit get HTTP status 429, and the mainframe keeps serving the branches. The three APIs carry 45 a second at most, so 0.1 vCore each is enough.
`,
  followUps: [
    {
      q: 'Why not put the rules in the Experience API?',
      a: 'A web banking site would then need the same rules again. In the Process API, every channel shares them.',
    },
    {
      q: 'Does every request need all three layers?',
      a: 'No. API-led connectivity is a guide, not a law. A team can skip a layer when it adds no value, but it should make that choice on purpose and record the reason.',
    },
  ],
}
