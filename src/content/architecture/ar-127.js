import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-127',
  category: 'architecture',
  title: 'Two Channels Sharing One Process API',
  level: 'BEGINNER',
  tags: ['api-led', 'experience-api', 'process-api', 'reuse', 'omnichannel', 'retail'],
  estMinutes: 10,
  diagram: {
    task: 'draw two channels sharing one Process API. Use six boxes: a Web app box, a Mobile app box, two Experience API boxes, one Process API box and one System API box. Connect the Web app to one Experience API and the Mobile app to the other. Connect both Experience APIs to the Process API, and the Process API to the System API.',
    checks: [
      { label: 'The web app and the mobile app each call an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Both Experience APIs call the Process API', rule: { type: 'each', of: 'experience-api', min: 2, edgeTo: 'process-api' } },
      { label: 'One Process API is shared by both channels', rule: { type: 'node', match: 'process-api', min: 1, max: 1 } },
      { label: 'The Process API calls the System API', rule: { type: 'edge', from: 'process-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web store'],
        mob: ['mobile-app', 'Mobile app'],
        ew: ['experience-api', 'exp-web-api'],
        em: ['experience-api', 'exp-mobile-api'],
        prc: ['process-api', 'prc-stock-api'],
        sys: ['system-api', 'sys-inventory-api'],
      },
      ['web -> ew', 'mob -> em', 'ew -> prc', 'em -> prc', 'prc -> sys'],
    ),
  },
  description: `
A grocery chain shows stock levels in its web store and its mobile app. A **channel** is one way customers reach the business, so these are two channels.

The web store shows full product details. The mobile app needs a much smaller response. The stock rule is the same for both: items in other baskets do not count as available.

An **Experience API** shapes data for one kind of client. A **Process API** holds the business rules. A **System API** talks to the backend system.

**Questions:**
- Draw the design.
- What is shared, and what is separate?
`,
  answerTemplate: `## Design

## Shared and separate
`,
  keyPoints: [
    'Each channel gets its own Experience API, because each one needs a different response.',
    'The business rule lives once, in the shared Process API.',
    'A new channel needs a new Experience API, and it reuses the Process API.',
  ],
  solution: `
**Design.**
\`\`\`
 Web store ─► exp-web-api ─────┐
                               ├─► prc-stock-api ─► sys-inventory-api
 Mobile app ─► exp-mobile-api ─┘
\`\`\`

**Shared and separate.** The stock rule is shared, so it sits in \`prc-stock-api\`. If the rule changes, the team changes it once and both channels get the new result. The response shape is separate. Each Experience API returns what its own screen needs.
`,
  followUps: [
    {
      q: 'What if the store later adds an in-store kiosk?',
      a: 'Add a new Experience API for the kiosk and connect it to the same Process API. The stock rule needs no change.',
    },
    {
      q: 'Why not one Experience API for both channels?',
      a: 'That can work if the two channels want the same data. Here they do not, and one shared response would force a change for one channel to touch the other.',
    },
  ],
}
