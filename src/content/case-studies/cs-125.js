export default {
  id: 'cs-125',
  category: 'case-studies',
  title: 'Online Marketplace Paying 40,000 Sellers Daily Without Paying Anyone Twice',
  level: 'EXPERT',
  tags: ['payments', 'payouts', 'idempotency', 'reconciliation', 'marketplace'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The payout job sent some payments twice after a timeout last month. What stops this for good?',
      options: [
        'Use a stable payout id as idempotency key, and check status before resending',
        'Before a resend, search the provider for a payment to that seller of the same amount today',
        'Raise the HTTP timeout to five minutes, so a slow provider still answers in time',
        'Lock the job with a database flag so only one copy of it runs at a time',
      ],
      answer: 0,
      explain: 'A timeout does not tell you whether the provider made the payment. A stable id lets the provider reject a repeat, and a status check before a resend avoids guessing. A search by seller and amount can miss a payment the provider is still processing. A longer timeout makes timeouts rarer, not impossible. A job lock stops two runs at once, but the doubles came from one run resending.',
    },
    {
      type: 'single',
      prompt: 'How is the daily payout amount for each seller worked out?',
      options: [
        'From the ledger: sales minus fees and refunds, fixed in a record before sending',
        'From the orders table, read again at the moment each payment is sent',
        'From the running total in the seller portal, which updates with each order',
        'From the provider’s balance report for each seller from the day before',
      ],
      answer: 0,
      explain: 'A fixed payout record makes the amount stable and auditable. Reading live order data while sending means the amount can change between steps. The portal total and the provider balance are views built from other data, not the ledger that says what is owed.',
    },
    {
      type: 'multi',
      prompt: 'Which three controls belong in a payout process?',
      options: [
        'A daily reconciliation of payouts against the bank or provider statement',
        'A hold on payouts to sellers whose bank details changed in the last few days',
        'Approval by a second person for payouts above a set amount',
        'A run that stops as soon as any payout fails, so no further payments go out',
        'A resend of a timed-out payout with a new idempotency key, so the provider accepts it',
        'An email to the seller after each bank detail change, with the next run paying the new account',
      ],
      answer: [0, 1, 2],
      explain: 'Reconciliation finds gaps and doubles, a hold after a change of bank details guards against account takeover, and dual approval limits large mistakes. Stopping the run on one failure holds back thousands of sellers for one bad account. A timeout does not mean the payment failed; a resend must reuse the same idempotency key, or the provider pays twice, as happened with the 600 payments. An email helps the real seller notice, but paying the new account in the next run gives a fraudster the money before anyone reads it.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The provider allows 50 payout requests a second, and 40,000 payouts must go out each morning. How do you send them?',
      options: [
        'From a queue, with a consumer paced below 50 a second and backoff on throttling',
        'In 8 parallel batches of 5,000, retrying any request the provider throttles',
        'One by one, with a five second pause between payouts to stay safe',
        'From a queue read by 10 consumers on each of 2 replicas, with no pacing',
      ],
      answer: 0,
      explain: 'A consumer paced at about 45 a second stays under the limit and sends 40,000 payouts in about 15 minutes. Parallel batches or consumers without a pace are throttled, retries add to the load, and five second pauses take more than two days.',
    },
    {
      type: 'match',
      prompt: 'Match each payout state to what it means.',
      pairs: [
        ['Calculated', 'Amount frozen from the ledger, nothing sent'],
        ['Sent', 'Request accepted by the provider, waiting for the result'],
        ['Paid', 'Provider confirmed the money left'],
        ['Failed', 'Provider rejected it, needs action before any resend'],
      ],
      explain: 'Clear states let the job resume safely after a crash and let support answer sellers.',
    },
    {
      type: 'order',
      prompt: 'Order the daily payout run.',
      items: [
        'Freeze payout records from the ledger',
        'Apply holds and approvals',
        'Send payouts from a paced queue with idempotency keys',
        'Record provider results against each payout',
        'Reconcile against the provider statement and raise exceptions',
      ],
      explain: 'Amounts are fixed before sending, controls run before money moves, and reconciliation closes the loop.',
    },
  ],
  description: `
**Context.** An online marketplace has **40,000 active sellers** and pays them daily through a payment provider's payout API.

**What went wrong last month**
- A network timeout made the payout job resend 600 payments that had already been made. Recovering the money took weeks.
- Two sellers were paid to bank accounts that a fraudster had changed the day before.
- Finance could not say for two days whether every seller was paid the right amount.

**Facts**
- Sales, fees and refunds are in a ledger database.
- The provider's payout API accepts an idempotency key, allows 50 requests a second, and sends results by webhook.
- The current job reads orders and sends payouts in one step, from a script on a server.

**Opinions**
- CFO: "Paying twice is worse than paying late."
- Head of seller support: "Sellers must see the status of their payout."
- Risk team: "Bank detail changes are our biggest fraud risk."

**Your task.** Design the payout process from ledger to reconciliation.
`,
  answerTemplate: `## Decision

## Calculating payouts

## Sending safely

## Controls

## Reconciliation and status

## Risks
`,
  keyPoints: [
    'Freeze each payout as a record from the ledger before sending anything.',
    'Send each payout with a stable idempotency key, and check status after a timeout instead of resending.',
    'Pace sending from a queue under the provider limit, with backoff on throttling.',
    'Hold payouts after a recent bank detail change, and require approval above a threshold.',
    'Record webhook results per payout, so the job can resume and support can see status.',
    'Reconcile against the provider statement every day and raise exceptions.',
  ],
  solution: `
**Decision.** Split the process into calculated, controlled and paced steps, with a state for every payout.

**Calculating.** Each morning, a job reads the ledger and creates payout records: seller, period, amount, bank account, and a stable payout id. The amounts are frozen.

**Controls.** Payouts to sellers whose bank details changed in the last few days are held for review. Payouts above a threshold need a second approval.

**Sending.** Approved payouts go on a queue. A consumer sends them at under 50 a second with the payout id as the idempotency key. After a timeout it asks the provider for the status of that id instead of resending blindly.

**Results and status.** Provider webhooks update each payout to Paid or Failed. Sellers see the status in their portal. Failed payouts need action before any resend.

**Reconciliation.** Each day, compare payouts with the provider statement: amounts, counts and any missing or extra payments. Differences go to finance as exceptions.

**Risks.** Webhooks lost or late, ledger corrections after payouts are frozen, and the review queue growing faster than the risk team can clear it.
`,
  followUps: [
    { q: 'Why is a timeout not a failure?', a: 'The provider may have made the payment and the answer was lost. Only a status check or the provider’s own result tells you.' },
    { q: 'What if a webhook never arrives?', a: 'A check after a set time asks the provider for the status of each payout still in Sent.' },
    { q: 'How do you correct a payout amount after it is frozen?', a: 'Do not edit it. Add an adjustment to the next period in the ledger, so the audit trail stays clear.' },
    { q: 'How do you restart a run that crashed halfway?', a: 'The states show what was sent. Resume from Calculated and Approved records, and check the status of any left in Sent.' },
  ],
}
