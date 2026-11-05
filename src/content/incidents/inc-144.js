export default {
  id: 'inc-144',
  category: 'incidents',
  title: 'A Disabled Scheduler Comes Back: Payment Run Fires Into an ERP Migration After a Saturday Morning Restart',
  level: 'INTERMEDIATE',
  tags: ['cloudhub-2', 'deployment', 'scheduler', 'restarts', 'operations', 'sap', 'manufacturing'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-09 18:04:22 INFO  [audit] prc-supplier-payments: schedule payment-run-flow disabled, user j.mwangi', relevant: true, why: 'Operations disabled the job for the weekend, so everyone assumed it would stay off.' },
      { text: '2026-10-09 18:04:40 INFO  [runtime] prc-supplier-payments: configuration applied, 2 replicas STARTED', relevant: true, why: 'Disabling a scheduler redeploys the app. This time it stayed disabled.' },
      { text: '2026-10-10 00:41:17 INFO  [runtime] prc-supplier-payments: replica moved to another node, replica restart complete', relevant: true, why: 'A routine restart inside the Friday 10 PM to Saturday 6 AM window for private spaces. This is not an outage.' },
      { text: '2026-10-10 02:00:00 INFO  [prc-supplier-payments] payment-run-flow triggered by scheduler', relevant: true, why: 'The disabled schedule has run. The docs say a disabled scheduler can revert to enabled after a restart.' },
      { text: '2026-10-10 02:00:04 ERROR [prc-supplier-payments] SAP call failed: destination S4P unavailable (system locked for migration)', relevant: true, why: 'The run hits the ERP during its migration, which is the event the team wanted to avoid.' },
      { text: '2026-10-10 02:00:06 WARN  [prc-supplier-payments] 214 payment batches parked for retry', relevant: true, why: 'The size of the clean-up: these must not be replayed without review.' },
      { text: '2026-10-10 02:15:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-10-10 07:30:11 INFO  [exp-supplier-portal] GET /v1/invoices 200 (54 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the payment run?',
        options: [
          'A disabled scheduler can revert to enabled after an application restart, rolling restart or maintenance, and a routine restart happened overnight',
          'An operator enabled the schedule again at 02:00',
          'A cron schedule always runs once more after being disabled, at its next trigger',
          'Disabling a schedule only affects one of the two replicas',
        ],
        answer: 0,
        explain: 'The Managing App Schedules page states this directly and tells you to check the state after a restart. The audit log shows no user action between Friday and the run.',
      },
      {
        type: 'single',
        prompt: 'Is the 00:41 restart itself an incident?',
        options: [
          'No. In private spaces, restarts can occur in a weekly window from Friday 10:00 PM to Saturday 6:00 AM local time, and the docs call them routine maintenance',
          'Yes. CloudHub 2.0 never restarts production apps without notice',
          'Yes. Any restart means the hardware has failed',
          'It cannot happen on an app with two replicas',
        ],
        answer: 0,
        explain: 'Karpenter node downscaling is one documented reason for this window. Monthly patching, rebalancing and crashes are other reasons for restarts. Design for them, and do not treat a console setting as durable through them.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action on Saturday morning?',
        options: [
          'Check the Schedules tab and disable the schedule again, confirm that the state holds, then review the 214 parked batches with finance before any replay',
          'Replay all parked batches as soon as possible',
          'Stop every app in the private space',
          'Change the schedule type from cron to fixed frequency in Runtime Manager',
        ],
        answer: 0,
        explain: 'Stop the recurrence first, then assess. Payments must be replayed only under control. You cannot change the schedule type on a deployed app anyway: it needs an update and redeploy.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Add a business guard to the flow, such as an external maintenance flag that it checks first, so that it does not depend only on the console setting',
          'For a planned outage, consider stopping the app, because stopped apps do not run schedules',
          'Add to the runbook: after any restart in a maintenance period, check the state on the Schedules tab',
          'Make the payment run idempotent, by batch ID',
          'Avoid enabling or disabling schedules close to a cron trigger time',
          'Rely on the toggle, as the docs promise it stays off',
        ],
        answer: [0, 1, 2, 3, 4],
        explain: 'The docs warn against the last option: a disabled scheduler can revert to enabled, so check its state after a restart. Near a cron trigger time, a disable or enable action redeploys the app and a disabled scheduler can run once, which is why such actions are best kept away from trigger times.',
      },
    ],
  },
  description: `
## Symptoms
- Saturday 07:45: the SAP migration lead reports that \`prc-supplier-payments\` called SAP at 02:00, during the migration freeze. The call failed, and 214 payment batches are parked for retry.
- The operations team insists the job was disabled on Friday.

## Change / Context
- \`prc-supplier-payments\` runs in a CloudHub 2.0 **private space** with 2 replicas in cluster mode, and a cron Scheduler at 02:00 each day.
- For the weekend SAP migration, an operator disabled the schedule on the **Schedules** tab on Friday at 18:04.
- The audit log shows no later user change to the schedule.
- Monday's first payment run must be clean, and no duplicate payment may reach the bank.

## Logs
\`\`\`
Fri 18:04:22 INFO  [audit] schedule payment-run-flow disabled, user j.mwangi
Sat 00:41:17 INFO  [runtime] replica moved to another node, replica restart complete
Sat 02:00:00 INFO  [prc-supplier-payments] payment-run-flow triggered by scheduler
Sat 02:00:04 ERROR [prc-supplier-payments] SAP call failed: destination S4P unavailable
Sat 02:00:06 WARN  [prc-supplier-payments] 214 payment batches parked for retry
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'A disabled scheduler can revert to enabled after an application restart, rolling restart or maintenance. Check the Schedules tab after a restart and disable it again if needed.',
    'Even after being disabled, a scheduler can run once: fixed frequency at app start unless startDelay is at least five seconds, and cron near a redeployment.',
    'Enabling or disabling a schedule redeploys the application.',
    'Private spaces have a weekly restart window for node downscaling, from Friday 10:00 PM to Saturday 6:00 AM in the region\'s local time.',
    'Restarts are routine; apps should be idempotent and tolerate them.',
    'A console toggle is not a durable business control. Add a guard the flow checks, or stop the app.',
  ],
  solution: `
**Diagnosis.** The operator did disable the schedule, and the audit log shows no later user change. A routine replica restart took place at 00:41, inside the documented window. The schedule ran at its normal time. The docs say that a disabled scheduler can revert to enabled after a restart.

**Immediate mitigation.**
- Open the **Schedules** tab, disable the schedule again and confirm its state.
- Do not release the 214 parked batches. Review them with finance, and confirm that nothing reached the bank.
- Tell the migration lead what SAP received.
- Since more restarts are possible, add a second control until the migration ends, or stop the app if nothing else depends on it.

**Root cause.** The team treated a runtime toggle as a durable control. The documented behaviour is that this state can be lost on a restart, and restarts are routine in a private space.

**Permanent fix.**
- Add a guard at the start of the flow that reads an external maintenance flag, so the decision survives restarts.
- Make the payment run idempotent by batch ID.
- For long planned outages, stop the app if the rest of its work allows it.

**Prevention.**
- Update the runbook to check schedule state after any restart during a freeze.
- Avoid disable and enable actions close to the cron trigger time, and confirm the state afterwards.
- Alert when a protected job starts during a freeze.
`,
  followUps: [
    { q: 'How is a fixed-frequency scheduler different here?', a: 'A disabled fixed-frequency scheduler can trigger once when the app starts. Set startDelay to at least five seconds to prevent that. startDelay has no effect on cron schedulers.' },
    { q: 'If a schedule is missed because the app was down, does it run at startup?', a: 'Not on CloudHub 2.0. It runs at its next scheduled time.' },
    { q: 'Could the DR flag idea from the CloudHub 2.0 DR page help?', a: 'The same principle applies. That page describes externalizing a DR flag and enabling or disabling scheduler flows in the runtime plane, without depending on the control plane.' },
  ],
}
