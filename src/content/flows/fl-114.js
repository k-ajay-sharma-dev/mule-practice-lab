import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-114',
  category: 'flows',
  title: 'Customer Signup API: Hand the Welcome Email to a Second Flow with a VM Queue',
  level: 'BEGINNER',
  tags: ['vm', 'async', 'decoupling', 'http', 'email', 'database'],
  estMinutes: 12,
  flowChecks: [
    { label: 'An HTTP Listener receives the signup', rule: { type: 'source', component: 'http-listener' } },
    { label: 'The design has two flows: the API flow and the email flow', rule: { type: 'flows', kind: 'flow', min: 2 } },
    {
      label: 'The customer is saved with Database Insert before the VM Publish',
      rule: { type: 'before', first: 'db-insert', then: 'vm-publish', firstWhere: { sql: 'customers' } },
    },
    { label: 'The API flow publishes to the VM queue welcome-emails', rule: { type: 'exists', component: 'vm-publish', where: { queueName: 'welcome-emails' } } },
    {
      label: 'A VM Listener in the second flow reads the same queue the API publishes to',
      rule: { type: 'linked', from: { component: 'vm-publish', key: 'queueName' }, to: { component: 'vm-listener', key: 'queueName' } },
    },
    {
      label: 'The email is sent in the VM Listener flow, not in the API flow',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'vm-listener', then: 'email-send' },
          { type: 'absent', component: 'email-send', inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    { label: 'The API response is built after the VM Publish', rule: { type: 'before', first: 'vm-publish', then: 'transform', outside: true } },
  ],
  referenceFlow: design(
    flow('customer-signup-api', source('http-listener', { path: '/signups', allowedMethods: 'POST' }), [
      step('db-insert', { database: 'PostgreSQL', sql: 'INSERT INTO customers (email, first_name, country) VALUES (:email, :firstName, :country)' }),
      step('vm-publish', { queueName: 'welcome-emails' }),
      step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ email: payload.email, status: "REGISTERED" }' }),
    ]),
    flow('send-welcome-email', source('vm-listener', { queueName: 'welcome-emails' }), [
      step('logger', { level: 'INFO', message: '#["Sending welcome email to " ++ payload.email]' }),
      step('email-send', { toAddresses: '#[payload.email]', subject: 'Welcome to Northwind Outdoor', content: '#["Hello " ++ payload.firstName]', contentType: 'text/plain' }),
    ]),
  ),
  description: `
An outdoor clothing shop has a signup form. The form calls \`POST /signups\` with this body:

\`\`\`json
{ "email": "maya@example.com", "firstName": "Maya", "country": "NZ" }
\`\`\`

Today one flow saves the customer and then sends a welcome email through the mail server. The mail server often takes **4 to 6 seconds**, so the form feels slow, and when the mail server is down the signup fails even though the customer was saved.

A **VM queue** is a queue inside the Mule app. One flow puts a message on it with **VM Publish**, and another flow picks it up with a **VM Listener**. The first flow does not wait for the second one.

**Requirements**
- Save the customer in the \`customers\` table.
- Put the signup on a VM queue called \`welcome-emails\`.
- A second flow reads that queue and sends the email.
- Answer the form with the email and the status \`REGISTERED\`.

**Design the two flows.** Why does the form now answer in well under a second?
`,
  answerTemplate: `## The API flow

## The VM queue

## The email flow

## What the caller waits for
`,
  keyPoints: [
    'VM Publish puts the message on the queue and the API flow carries on. It does not wait for the email.',
    'The VM Listener in the second flow starts once for each message on the queue.',
    'The queue name in VM Publish and in VM Listener must be the same, and the queue is declared in the VM config.',
    'Save first, then publish, so an email is never sent for a customer that was not saved.',
    'A slow or broken mail server no longer slows down or breaks the signup.',
    'VM queues live inside one Mule app, or inside a shared domain on a customer-hosted runtime. They are not a way to talk between apps on CloudHub.',
  ],
  solution: `
**Flow 1: customer-signup-api**
1. **HTTP Listener**, path \`/signups\`, method \`POST\`.
2. **Database Insert** into \`customers\`.
3. **VM Publish** to the queue \`welcome-emails\`. The payload is still the signup body, so the email flow gets the email and first name.
4. **Transform Message** that returns \`{ email, status: "REGISTERED" }\`.

**Flow 2: send-welcome-email**
1. **VM Listener** on \`welcome-emails\`.
2. **Logger** with the email address.
3. **Email Send** to \`payload.email\`.

The API flow ends as soon as the message is on the queue. The email flow runs on its own, so the time the mail server takes is no longer part of the answer to the form.

Declare the queue in the **VM config**. Choose a **persistent** queue type if a signup must not lose its email when the app restarts. A transient queue keeps messages in memory only.
`,
  followUps: [
    {
      q: 'The mail server is down for ten minutes. What happens to the emails?',
      a: 'The email flow fails for those messages. Add error handling in the email flow, such as Until Successful around Email Send, or a second queue for failed emails. The signup itself is not affected.',
    },
    {
      q: 'Why not use VM Publish Consume?',
      a: 'Publish Consume waits for a reply from the other flow. That would bring the slow email back into the response time.',
    },
    {
      q: 'Can a second Mule app read the welcome-emails queue?',
      a: 'Only if both apps share a domain on the same customer-hosted runtime. CloudHub does not support shared domains. Use Anypoint MQ or JMS to pass messages between apps.',
    },
    {
      q: 'Why save the customer before the VM Publish?',
      a: 'If the insert fails, nothing is published and no welcome email goes out for a customer that does not exist.',
    },
  ],
}
