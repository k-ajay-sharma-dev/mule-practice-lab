import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-134',
  category: 'architecture',
  title: 'A Load Balancer in Front of Two Copies of an API',
  level: 'BEGINNER',
  tags: ['load-balancer', 'high-availability', 'scaling', 'cloudhub-2'],
  estMinutes: 10,
  diagram: {
    task: 'draw two copies of one API behind a load balancer. Use five boxes: a Web app, a Load balancer, two Experience API boxes for the two copies, and a Process API. Draw a line from the Web app to the Load balancer, a line from the Load balancer to each Experience API, and a line from each Experience API to the Process API. Draw no line from the Web app to an Experience API.',
    checks: [
      { label: 'The website calls the load balancer', rule: { type: 'each', of: 'web-app', edgeTo: 'load-balancer' } },
      { label: 'The load balancer reaches two copies of the API', rule: { type: 'each', of: 'experience-api', min: 2, edgeFrom: 'load-balancer' } },
      { label: 'The copies are reached only through the load balancer', rule: { type: 'only-via', target: 'experience-api', from: 'load-balancer' } },
      { label: 'Both copies call the same Process API', rule: { type: 'each', of: 'experience-api', min: 2, edgeTo: 'process-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Shop website'],
        lb: ['load-balancer', 'Load balancer'],
        c1: ['experience-api', 'Checkout API copy 1'],
        c2: ['experience-api', 'Checkout API copy 2'],
        prc: ['process-api', 'Order Process API'],
      },
      ['web -> lb', 'lb -> c1', 'lb -> c2', 'c1 -> prc', 'c2 -> prc'],
    ),
  },
  description: `
A retailer runs one copy of its checkout API. During sales it gets overloaded, and if it stops, nobody can pay.

The team runs two copies of the same API behind a **load balancer**. A load balancer receives every request and passes each one to a healthy copy, so the work is shared.

**Questions:**
- Draw the design.
- What happens when one copy stops?
`,
  answerTemplate: `## Design

## When one copy stops
`,
  keyPoints: [
    'Clients know one address, the load balancer. They never call a copy directly.',
    'Two copies share the load, so the API handles more requests.',
    'If one copy stops, requests go to the other. This is high availability.',
    'Any copy may get any request, so a copy should not hold a customer\'s data only in its own memory.',
  ],
  solution: `
**Design.**
\`\`\`
                              ┌─► Checkout API copy 1 ─┐
 Shop website ─► Load balancer┤                        ├─► Order Process API
                              └─► Checkout API copy 2 ─┘
\`\`\`
Both boxes are the same application. The diagram draws it twice to show two running copies.

**When one copy stops.** The load balancer stops sending it requests, and the other copy takes them all. Customers can still pay, though it may run slower until the copy returns.
`,
  followUps: [
    {
      q: 'What are these copies called in CloudHub 2.0?',
      a: 'Replicas. You choose how many replicas an application runs, and the platform shares requests across them.',
    },
    {
      q: 'Why must the website not call a copy directly?',
      a: 'If that copy stops, the website fails even though the other copy is healthy. All the load would also land on one copy.',
    },
  ],
}
