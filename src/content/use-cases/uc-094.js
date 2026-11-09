import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-094',
  category: 'use-cases',
  title: 'Workday New-Hire Provisioning to Active Directory and Payroll',
  level: 'INTERMEDIATE',
  tags: ['workday', 'provisioning', 'pub-sub', 'anypoint-mq', 'pii', 'dlq', 'hr'],
  estMinutes: 30,
  diagram: {
    task: 'draw how a completed hire in Workday reaches Active Directory and the ADP payroll API: the poller, the topic, one Process API per target, their System APIs, the write-back to Workday and the dead-letter queue.',
    checks: [
      { label: 'A scheduled job picks up completed hires from Workday', rule: { type: 'path', from: 'batch-job', to: 'saas' } },
      { label: 'Each hire is published once to a topic', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'topic', kind: 'async' } },
      { label: 'AD and payroll provisioning each receive the hire from the topic', rule: { type: 'each', of: 'topic', edgeTo: 'process-api', count: 2, kind: 'async' } },
      { label: 'Active Directory is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The payroll provider is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Provisioning steps do not call each other in a chain', rule: { type: 'no-edge', from: 'process-api', to: 'process-api' } },
      { label: 'The new username and email are written back to Workday', rule: { type: 'path', from: 'process-api', to: 'saas' } },
      { label: 'Hires that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['topic', 'queue', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Hire poller (every 15 min)'],
        swd: ['system-api', 'sys-workday-api'],
        wd: ['saas', 'Workday HCM'],
        topic: ['topic', 'worker-hired (Anypoint MQ exchange)'],
        pad: ['process-api', 'prc-ad-provisioning'],
        ppay: ['process-api', 'prc-payroll-enrolment'],
        sad: ['system-api', 'sys-active-directory-api (on-prem)'],
        ad: ['legacy', 'Active Directory'],
        sadp: ['system-api', 'sys-adp-payroll-api'],
        adp: ['external-api', 'ADP payroll API'],
        dlq: ['dlq', 'provisioning-dlq'],
        mail: ['notification', 'Alert to IT and HR operations'],
      },
      [
        'job -> swd', 'swd -> wd', 'job ~> topic', 'topic ~> pad', 'topic ~> ppay', 'pad -> sad', 'sad -> ad',
        'ppay -> sadp', 'sadp -> adp', 'pad -> swd', 'pad ~> dlq', 'ppay ~> dlq', 'pad -> mail',
      ],
    ),
  },
  description: `
A logistics company hires about **120 people a week** across 9 sites. **Workday HCM** is the source of truth for workers. New hires must have a working login and be in payroll on their first day; today IT finds out from a spreadsheet and half of new hires wait two days for a laptop login.

Targets:
- **Active Directory** on-premises: user account in the right OU (by site and department), groups by job profile, email address created through the Exchange hybrid sync. AD is only reachable from the data centre.
- **ADP Workforce Now** payroll: employee record with pay group, tax data and bank details, by REST API.

Facts:
- A hire is created in Workday 2 to 30 days before the start date. Data can still change (start date moves, hire is rescinded).
- Accounts must be created **3 business days before** the start date, disabled until the start date.
- The username and email created in AD must be stored back in Workday, because other systems read them from there.
- AD provisioning must not wait for payroll, and a payroll error must not block the login.
- Bank details and national IDs are sensitive and must never be logged.

**Questions:**
1. How do you detect hires and changes in Workday?
2. How do you deliver one hire to two independent targets?
3. How do you handle rescinds, rehires and retries?
4. Where does each Mule application run, given that AD is on-premises?
`,
  answerTemplate: `## Detecting hires

## Fan-out to targets

## Changes, rehires and errors

## Deployment and security
`,
  keyPoints: [
    'A poller calls Workday Get_Workers (or a RaaS report) with an updated-since window and selects hires whose provisioning date is reached.',
    'Each hire is published once to an Anypoint MQ exchange; the AD and payroll Process APIs each have their own bound queue, so one failing target does not block the other.',
    'Provisioning is idempotent by Workday employee id: create if missing, update if present, disable on rescind.',
    'sys-active-directory-api runs on a Runtime Fabric or hybrid runtime next to AD; the cloud apps reach it over a private connection.',
    'Username and email are written back to Workday; failures after retries go to a DLQ with an alert, and sensitive fields are masked in logs.',
  ],
  solution: `
\`\`\`
Workday <-- sys-workday-api <-- Hire poller --> (worker-hired exchange)
                                                  |--> [ad queue]      --> prc-ad-provisioning   --> sys-active-directory-api --> AD
                                                  |                                \\--> sys-workday-api (username, email)
                                                  \\--> [payroll queue] --> prc-payroll-enrolment --> sys-adp-payroll-api --> ADP
\`\`\`

**Detecting hires.** Every 15 minutes the poller asks **sys-workday-api** for workers changed since the last run (Get_Workers with a transaction log window). It picks hires whose start date is within 3 business days, plus changes and rescinds for workers already provisioned. The window end is stored as the next watermark.

**Fan-out.** Each event (\`HIRE\`, \`CHANGE\`, \`RESCIND\`) is published once to the \`worker-hired\` exchange. Two queues are bound to it: one for AD, one for payroll. Each Process API consumes its own queue at its own speed. If ADP is down, the payroll queue grows while logins are still created.

**Active Directory.** **prc-ad-provisioning** builds the username (first initial plus surname, with a number if taken), picks the OU and groups from a mapping table, and creates the account disabled with an activation date. It then writes the username and email back through **sys-workday-api**. **sys-active-directory-api** uses the LDAP connector and runs on Runtime Fabric in the data centre, because AD is not reachable from CloudHub.

**Payroll.** **prc-payroll-enrolment** maps the worker to the ADP employee object, including pay group and bank details, and calls **sys-adp-payroll-api**. The bank account is masked in every log line.

**Idempotency and changes.** Both targets use the Workday employee id as the key. A retried message finds the existing account and updates it. A rescind disables the AD account and terminates the pending ADP record. A rehire reactivates the old account instead of creating a second one.

**Errors.** Business errors (missing cost centre) go straight to the DLQ with an alert to HR operations. Connection errors are redelivered with back-off; after 5 attempts they go to the DLQ.
`,
  followUps: [
    { q: 'Why one queue per target instead of one queue that both apps read?', a: 'Consumers on one queue compete, so each message would reach only one target. Separate queues bound to an exchange give every target its own copy and its own retry.' },
    { q: 'How do you protect bank details in transit and in logs?', a: 'TLS on every hop and encrypted queues. Logging uses a masking function, and payload logging is switched off in production.' },
    { q: 'What happens if the start date moves after the account was created?', a: 'The change event updates the activation date in AD and the hire date in ADP. Both use the employee id, so nothing is duplicated.' },
  ],
}
