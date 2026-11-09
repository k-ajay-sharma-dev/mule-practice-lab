import { design, flow, source, step, subFlow } from '../../flow/dsl.js'

export default {
  id: 'fl-103',
  category: 'flows',
  title: 'Leave Request: Keep the Payload with a Flow Reference Target',
  level: 'BEGINNER',
  tags: ['sub-flow', 'flow-ref', 'reuse', 'hr'],
  estMinutes: 10,
  flowChecks: [
    { label: 'The manager lookup lives in a sub-flow', rule: { type: 'flows', kind: 'sub-flow', min: 1 } },
    { label: 'Every Flow Reference points to an existing flow or sub-flow', rule: { type: 'refs' } },
    {
      label: 'A Flow Reference calls get-manager and stores its result in the target variable manager',
      rule: { type: 'exists', component: 'flow-ref', where: { name: 'get-manager', target: 'manager' } },
    },
    {
      label: 'The manager lookup call lives in the sub-flow, not in the main flow',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request' },
          { type: 'absent', component: 'http-request', inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    {
      label: 'The sub-flow calls GET /employees/{employeeId}/manager',
      rule: { type: 'exists', component: 'http-request', where: { method: 'GET', path: '/manager' } },
    },
    { label: 'The response is built after the Flow Reference', rule: { type: 'before', first: 'flow-ref', then: 'transform' } },
    {
      label: 'The response puts the manager email from vars.manager in approver',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'transform', where: { script: 'vars.manager' } },
          { type: 'exists', component: 'transform', where: { script: 'approver' } },
          { type: 'exists', component: 'transform', where: { script: 'email' } },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow('submit-leave-request', source('http-listener', { path: '/leave-requests', allowedMethods: 'POST' }), [
      step('logger', { level: 'INFO', message: '#["Leave request from " ++ payload.employeeId]' }),
      step('flow-ref', { name: 'get-manager', target: 'manager' }),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{ employeeId: payload.employeeId, days: payload.days, approver: vars.manager.email }',
      }),
    ]),
    subFlow('get-manager', [
      step('logger', { level: 'INFO', message: 'Looking up the manager' }),
      step('http-request', { method: 'GET', path: '/employees/{employeeId}/manager' }),
    ]),
  ),
  description: `
An HR team is building a leave request API. Each request must name the person who approves it, and that is the employee's manager.

The HR portal sends \`POST /leave-requests\` with this body:

\`\`\`json
{ "employeeId": "E1042", "days": 3 }
\`\`\`

The manager comes from the HR system: \`GET /employees/{employeeId}/manager\` answers with:

\`\`\`json
{ "name": "Lena Berg", "email": "lena.berg@example.com" }
\`\`\`

Other HR flows will need the same lookup soon, so it belongs in a **sub-flow**: a named list of steps with no trigger of its own. A **Flow Reference** is the step that calls it.

The catch is that the lookup replaces the payload, and the leave request is still needed afterwards. A Flow Reference has an optional **target** setting. When you name a variable there, the result goes into that variable and the original payload stays as it was.

**Requirements**
- Put the lookup in a sub-flow called \`get-manager\`.
- Call it with a Flow Reference whose target is \`manager\`.
- Answer with the \`employeeId\`, the \`days\` and an \`approver\` field holding the manager's email.

**Design the flow and the sub-flow.**
`,
  answerTemplate: `## Main flow

## The sub-flow

## What the target setting changes

## Building the response
`,
  keyPoints: [
    'The lookup sits in one sub-flow, so other flows can reuse it with a Flow Reference.',
    'The sub-flow can read the caller\'s payload, so it knows the employeeId.',
    'With target set to manager, the result of the sub-flow is stored in vars.manager.',
    'The caller\'s payload stays unchanged, so the leave request is still there after the call.',
    'The Transform Message combines payload and vars.manager into the response.',
  ],
  solution: `
**Main flow \`submit-leave-request\`**
1. **HTTP Listener**, path \`/leave-requests\`, allowed method \`POST\`.
2. **Logger** with the employee ID.
3. **Flow Reference** to \`get-manager\`, target \`manager\`.
4. **Transform Message** with this script:

\`\`\`
%dw 2.0
output application/json
---
{ employeeId: payload.employeeId, days: payload.days, approver: vars.manager.email }
\`\`\`

**Sub-flow \`get-manager\`**
1. **Logger**: \`Looking up the manager\`.
2. **HTTP Request**, \`GET /employees/{employeeId}/manager\`, with the URI parameter \`employeeId\` set from \`payload.employeeId\`.

Without a target, the sub-flow's result would replace the payload. Then \`payload.days\` would be gone at step 4.
`,
  followUps: [
    {
      q: 'A variable is set inside the sub-flow. Can the main flow read it after a Flow Reference with a target?',
      a: 'No. With a target, the original message stays unchanged, and changes the referenced flow made to the payload or variables are reverted. Only the target variable comes back.',
    },
    {
      q: 'What would you do without the target setting?',
      a: 'Save the payload in a variable before the call and restore it afterwards. It works, but it takes more steps, and forgetting the restore loses the request.',
    },
    {
      q: 'What happens to the target variable if the lookup fails?',
      a: 'It is not set. The error goes to the error handling of the calling flow, because a sub-flow has no error handler of its own.',
    },
  ],
}
