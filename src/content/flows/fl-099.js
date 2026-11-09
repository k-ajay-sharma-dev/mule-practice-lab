import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-099',
  category: 'flows',
  title: 'Order Sync Heartbeat: Log a Line Every 5 Minutes',
  level: 'BEGINNER',
  tags: ['scheduler', 'logging', 'monitoring', 'retail'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'A Scheduler starts the flow every 5 minutes on a fixed frequency',
      rule: { type: 'source', component: 'scheduler', where: { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' } },
    },
    {
      label: 'The service name order-sync is kept in a variable called serviceName',
      rule: { type: 'exists', component: 'set-variable', where: { variableName: 'serviceName', value: 'order-sync' } },
    },
    { label: 'The heartbeat message is built before it is logged', rule: { type: 'before', first: ['transform', 'set-payload'], then: 'logger' } },
    {
      label: 'The message holds the service name from the variable, the status ALIVE and the current time',
      rule: {
        type: 'any',
        rules: [
          {
            type: 'all',
            rules: [
              { type: 'exists', component: 'transform', where: { script: 'vars.serviceName' } },
              { type: 'exists', component: 'transform', where: { script: 'ALIVE' } },
              { type: 'exists', component: 'transform', where: { script: 'now()' } },
            ],
          },
          {
            type: 'all',
            rules: [
              { type: 'exists', component: 'set-payload', where: { value: 'vars.serviceName' } },
              { type: 'exists', component: 'set-payload', where: { value: 'ALIVE' } },
              { type: 'exists', component: 'set-payload', where: { value: 'now()' } },
            ],
          },
        ],
      },
    },
    {
      label: 'The built message is what gets logged, at INFO level',
      rule: { type: 'exists', component: 'logger', where: { level: 'INFO', message: 'payload' } },
    },
  ],
  referenceFlow: design(
    flow('order-sync-heartbeat', source('scheduler', { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' }), [
      step('set-variable', { variableName: 'serviceName', value: 'order-sync' }),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{ service: vars.serviceName, status: "ALIVE", time: now() }',
      }),
      step('logger', { level: 'INFO', message: '#[payload]' }),
    ]),
  ),
  description: `
A retailer runs an application called \`order-sync\`. Last month it stopped without anyone noticing for two hours.

The operations team now wants a **heartbeat**: a small log line written on a regular schedule. If the lines stop appearing, the team knows something is wrong.

A **Scheduler** is the component that starts a flow on a timer. No outside system has to call it.

**Requirements**
- Run every 5 minutes. Use a fixed frequency of \`5\` with the time unit \`MINUTES\`.
- Keep the service name \`order-sync\` in a variable called \`serviceName\`.
- Build a small JSON message with the service name, the status \`ALIVE\` and the current time.
- Write that message to the log at INFO level.

**Design the flow.**
`,
  answerTemplate: `## Trigger

## Building the heartbeat message

## Logging

## How the team uses it
`,
  keyPoints: [
    'A Scheduler is the right source because nothing calls this flow from outside.',
    'Fixed frequency suits "every 5 minutes". A cron expression suits a specific time of day.',
    'A Scheduler brings no business data, so the flow builds its own message.',
    'Transform Message builds the JSON, reading vars.serviceName and calling now() for the time.',
    'The value of a heartbeat is its absence: a missing line is the signal that something stopped.',
  ],
  solution: `
1. **Scheduler**, strategy \`fixed-frequency\`, frequency \`5\`, time unit \`MINUTES\`.
2. **Set Variable** \`serviceName\` with the value \`order-sync\`.
3. **Transform Message** with this script:

\`\`\`
%dw 2.0
output application/json
---
{ service: vars.serviceName, status: "ALIVE", time: now() }
\`\`\`

4. **Logger** at INFO level with the message \`#[payload]\`.

The flow has no response step, because no caller is waiting for an answer. The log line is the whole result.
`,
  followUps: [
    {
      q: 'When would you use a cron expression instead of a fixed frequency?',
      a: 'When the run must happen at a specific time or on specific days, for example 02:00 every weekday. A heartbeat only needs a steady rhythm, so fixed frequency fits.',
    },
    {
      q: 'The application runs on a cluster of several Mule instances. How many heartbeats do you see every 5 minutes?',
      a: 'One. In a cluster or a multi-worker CloudHub deployment, the Scheduler runs only on the primary node.',
    },
    {
      q: 'Who notices when the heartbeat stops?',
      a: 'Nobody, unless something watches the log. A monitoring tool needs an alert that fires when no heartbeat line has arrived for a set time.',
    },
  ],
}
