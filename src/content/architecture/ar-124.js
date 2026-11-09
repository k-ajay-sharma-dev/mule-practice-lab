import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-124',
  category: 'architecture',
  title: 'Why a Mobile App Must Not Call a System API Directly',
  level: 'BEGINNER',
  tags: ['api-led', 'layers', 'experience-api', 'system-api', 'mobile'],
  estMinutes: 10,
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
        exp: ['experience-api', 'exp-staff-mobile-api'],
        prc: ['process-api', 'prc-leave-balance-api'],
        sys: ['system-api', 'sys-hr-api'],
        hr: ['saas', 'HR system'],
      },
      ['mob -> exp', 'exp -> prc', 'prc -> sys', 'sys -> hr'],
    ),
  },
  description: `
Staff at a hospital group want to see their leave balance in a mobile app. The data sits in a cloud HR system, which already has a **System API**, an API that talks to one backend system.

A developer suggests a shortcut: call the System API straight from the app. It would save two APIs: an **Experience API**, which shapes data for one kind of client, and a **Process API**, which holds the business rules. A rule decides how much leave each person can see, and that rule belongs in the Process API.

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
