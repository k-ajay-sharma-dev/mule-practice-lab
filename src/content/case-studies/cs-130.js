export default {
  id: 'cs-130',
  category: 'case-studies',
  title: 'Dairy Co-operative Paying 3,000 Farmers for Milk From Tanker, Lab and Weighbridge Data',
  level: 'ADVANCED',
  tags: ['myproject', 'agriculture', 'payments', 'data-quality', 'batch', 'reconciliation'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Each collection has a tanker volume, and later a lab result and a weighbridge weight. How do you build the farmer payment?',
      options: [
        'Join the three by collection ID and pay only from complete, checked records',
        'Pay from the tanker volume alone, because it arrives first',
        'Join the three by farm and date, and pay from whatever has arrived',
        'Pay from the weighbridge weight, split across farms by route order',
      ],
      answer: 0,
      explain: 'Price depends on volume and quality, so a payment needs all parts of the collection. A shared collection ID joins them reliably, while farm and date breaks when a farm is collected twice or data arrives on another day.',
    },
    {
      type: 'single',
      prompt: 'A lab result never arrives for one collection. What should happen?',
      options: [
        'At the cut-off, flag it for review and pay by an agreed rule, such as a recent average',
        'Leave that collection unpaid until the lab result arrives',
        'Pay that collection at the lowest quality band until proven otherwise',
        'Pay the volume at the base price and never correct it later',
      ],
      answer: 0,
      explain: 'A rule agreed with the farmers keeps payments on time and fair, and the flag makes sure someone looks at it.',
    },
    {
      type: 'multi',
      prompt: 'Which three checks belong before a collection is paid?',
      options: [
        'Tanker volumes for a route roughly match the weighbridge weight of the tanker',
        'Lab results are within possible ranges',
        'The farm and collection IDs exist and match',
        'Each farm’s volume is within 5% of its volume on the same day last year',
      ],
      answer: [0, 1, 2],
      explain: 'Volume against weight catches meter faults, ranges catch lab errors, and IDs catch mismatched records. Volume changes with season, herd and weather, so a year on year match would block honest collections.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Tankers upload volumes from areas with poor signal, sometimes twice. How do you handle uploads?',
      options: [
        'Key uploads by collection ID, ignore repeats, accept late ones',
        'Reject uploads that arrive more than an hour late',
        'Add every upload to the farm’s monthly total as it arrives',
        'Keep the first upload per farm and day, and drop the rest',
      ],
      answer: 0,
      explain: 'Keyed by collection ID, a repeat changes nothing and a late upload still counts once. Farm and day as a key drops a second collection on the same day.',
    },
    {
      type: 'match',
      prompt: 'Match each source to what it gives the payment.',
      pairs: [
        ['Tanker meter', 'Volume collected from each farm'],
        ['Lab', 'Fat, protein and cell count for each sample'],
        ['Weighbridge', 'Weight of the full tanker, to check the meters'],
        ['Price rules', 'Price per litre from quality bands'],
      ],
      explain: 'Volume and quality make the amount, the weighbridge checks the volume, and the price rules turn quality into money.',
    },
    {
      type: 'order',
      prompt: 'Order the monthly payment run.',
      items: [
        'Close the month for collections and wait for late lab results up to the cut-off',
        'Run the checks and send failures to the quality team',
        'Calculate each farmer’s statement with the price rules',
        'Publish statements to farmers for review',
        'Send payments to the bank and reconcile',
      ],
      explain: 'Data is complete and checked before money is calculated, and farmers see statements before payment.',
    },
  ],
  description: `
**Context.** A dairy co-operative collects milk from **3,000 farms** every day or two, and pays farmers monthly based on volume and quality.

**Facts gathered so far**
- Tanker drivers record volume per farm on a handheld meter, which uploads when it has signal.
- A lab tests a sample from each collection and sends results a day or two later.
- Tankers are weighed at the plant on a weighbridge.
- Today staff join the data in spreadsheets at month end. Errors cause disputes and late payments.
- Some uploads arrive twice, and some lab results never arrive.

**Opinions**
- Farmer board: "We want to see our numbers every week, not only at month end."
- Finance: "Payments must reconcile to the milk we sold."
- Quality manager: "Bad lab data must never be paid without a check."

**Your task.** Design how collection, lab and weighbridge data become farmer statements and payments.
`,
  answerTemplate: `## Decision

## Joining the data

## Checks

## Missing and late data

## Statements and payment

## Rollout

## Risks
`,
  keyPoints: [
    'A collection ID joins tanker, lab and weighbridge data into one record.',
    'Uploads are stored by collection ID, so repeats are ignored and late ones count once.',
    'Checks on volume against weight, lab ranges and IDs run before payment.',
    'Missing lab results follow an agreed rule and are flagged for review.',
    'Farmers see weekly statements, and payments reconcile to the bank.',
    'Agree the rules for missing data with the farmer board.',
  ],
  solution: `
**Decision.** Build a collection record per pickup from all three sources, check it, and pay from checked records only.

**Joining the data.** Every pickup gets a collection ID on the tanker handheld, printed on the sample label. Tanker uploads, lab results and weighbridge weights are stored by that ID. Repeats are ignored and late data is accepted.

**Checks.** Route volumes against the weighbridge weight, lab values against possible ranges, and IDs against the farm register. Failures go to the quality team.

**Missing and late data.** If a lab result is missing at the cut-off, the collection is paid by a rule agreed with the farmer board, such as the farm's recent average, and corrected later if the result arrives.

**Statements and payment.** Farmers see a weekly view of collections and quality in a portal. At month end, statements are calculated with the price rules, published for review, then paid through the bank, and the payment file is reconciled with the bank statement.

**Rollout.** Run the new statements beside the spreadsheets for two months, compare, then switch.

**Risks.** Sample labels that do not match collections, meter drift, and price rule changes in the middle of a month.
`,
  followUps: [
    { q: 'Why a collection ID instead of farm and date?', a: 'A farm can be collected more than once a day, and data can arrive on a different day. One ID per pickup removes the guessing.' },
    { q: 'How do you correct a payment after a late lab result?', a: 'Add an adjustment to the next statement, with a line that explains it, instead of changing a paid statement.' },
    { q: 'What does the weighbridge check catch?', a: 'A meter on a tanker that reads too high or too low, because the sum of its farm volumes does not match the weight it delivered.' },
    { q: 'How do you measure success?', a: 'Fewer disputes, payments on time every month, and the share of collections paid without manual changes.' },
  ],
}
