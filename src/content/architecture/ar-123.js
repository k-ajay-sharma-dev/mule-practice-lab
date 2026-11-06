import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-123',
  category: 'architecture',
  title: 'A Mobile App Down Through All Three API Layers',
  level: 'BEGINNER',
  tags: ['api-led', 'layers', 'experience-api', 'process-api', 'system-api', 'mobile'],
  estMinutes: 10,
  diagram: {
    task: 'draw one request going down all three layers. Use five boxes: a Mobile app box, an Experience API box, a Process API box, a System API box and a Legacy / mainframe box. Connect them in that order, with one line between each pair.',
    checks: [
      { label: 'The mobile app calls the Experience API', rule: { type: 'edge', from: 'mobile-app', to: 'experience-api' } },
      { label: 'The Experience API calls the Process API', rule: { type: 'edge', from: 'experience-api', to: 'process-api' } },
      { label: 'The Process API calls the System API', rule: { type: 'edge', from: 'process-api', to: 'system-api' } },
      { label: 'The System API connects to the mainframe', rule: { type: 'edge', from: 'system-api', to: 'legacy' } },
      { label: 'The Experience API does not skip the Process layer', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Banking app'],
        exp: ['experience-api', 'exp-mobile-banking-api'],
        prc: ['process-api', 'prc-account-summary-api'],
        sys: ['system-api', 'sys-core-banking-api'],
        core: ['legacy', 'Core banking mainframe'],
      },
      ['mob -> exp', 'exp -> prc', 'prc -> sys', 'sys -> core'],
    ),
  },
  description: `
A bank wants its mobile app to show account balances. The balances live on a **mainframe**, an older central computer that runs the core banking system.

The bank uses three API layers:
- **Experience API:** shapes data for one kind of client, here the app.
- **Process API:** holds the business rules.
- **System API:** talks to the backend system.

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
