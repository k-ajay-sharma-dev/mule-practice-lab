export default {
  id: 'inc-066',
  category: 'incidents',
  title: 'Retailer Rejects Multi-Order EDI 856 ASNs After a Mapping Refactor',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'retail', 'edi', 'x12', 'asn', 'dataweave'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '16:00:02.110 INFO  [deploy] edi-outbound v2.7.0 started (856 mapping refactored to use per-order reduce)', relevant: true, why: 'Rejections begin with this release, which rewrote how the 856 hierarchy is built.' },
      { text: '16:20:11.300 INFO  [asn] Sent 856 ISA=000041220 shipment=SH-77120 orders=1 cartons=8', relevant: false },
      { text: '16:21:40.004 INFO  [asn] Sent 856 ISA=000041221 shipment=SH-77121 orders=3 cartons=22', relevant: false },
      { text: '16:35:02.900 INFO  [997] ISA=000041220 AK5*A (accepted)', relevant: true, why: 'Single-order shipments are still accepted, so the problem depends on the number of orders.' },
      { text: '16:35:03.120 WARN  [997] ISA=000041221 AK3*HL*12 ... AK5*R (rejected) - HL01 not unique / HL02 parent not found', relevant: true, why: 'The retailer rejects the transaction because of the HL segments: IDs repeat and parent links break.' },
      { text: '16:40:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '16:42:10.500 INFO  [debug] SH-77121 HL segments: HL*1**S HL*2*1*O HL*3*2*P HL*4*3*I HL*2*1*O HL*3*2*P', relevant: true, why: 'HL01 restarts at 2 for the second order: the counter is reset per order instead of running through the whole transaction.' },
      { text: '16:43:00.000 INFO  [carrier] Pickup confirmed for SH-77122', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are only multi-order ASNs rejected?',
        options: [
          'The refactored mapping restarts the HL01 counter for each order, so HL IDs repeat and HL02 parent references point to the wrong levels',
          'The retailer changed its EDI version',
          'The ISA control number is duplicated',
          'Cartons are missing SSCC labels',
        ],
        answer: 0,
        explain: 'With one order the per-order counter happens to produce a valid sequence; with several orders HL*2, HL*3 repeat, which violates the rule that HL01 is unique within the transaction.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Roll back to v2.6.x, then regenerate and resend the rejected ASNs before the trucks arrive at the retailer DCs',
          'Ask the retailer to accept the ASNs manually forever',
          'Send each order as its own shipment from now on',
          'Ignore it; the retailer will receive the goods anyway',
        ],
        answer: 0,
        explain: 'The retailer needs a valid ASN before the goods arrive, or receiving is slowed and chargebacks follow. Roll back and resend quickly.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Generate HL01 with one counter across the whole transaction and set HL02 from the actual parent\'s HL01',
          'Add mapping tests with multi-order, multi-carton shipments compared to approved sample 856s',
          'Validate outbound EDI against the retailer\'s implementation guide before sending',
          'Alert on 997/999 rejections per partner',
          'Turn off 997 processing to reduce noise',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Fix the hierarchy logic, test with realistic shapes, validate before sending and watch acknowledgements. The 997 is how you found out at all.',
      },
      {
        type: 'order',
        prompt: 'Put the 856 hierarchy levels in their usual top-down order.',
        items: ['Shipment (S)', 'Order (O)', 'Tare / pallet (T)', 'Pack / carton (P)', 'Item (I)'],
        explain: 'A typical "pick and pack" 856 nests Shipment > Order > Tare > Pack > Item; each HL02 points to its parent\'s HL01.',
      },
    ],
  },
  description: `
## Symptoms
- A national retailer's EDI gateway is returning **997 rejections** for our outbound **856 ASNs**. Their DC has started receiving our trucks without ASNs, and the account manager warns of **non-compliance chargebacks**.
- Not every ASN fails: shipments containing **one** purchase order are accepted; shipments with **several** POs are rejected.

## Change / Context
- Release **v2.7.0** of \`edi-outbound\` (yesterday 16:00) refactored the 856 DataWeave mapping for readability: it now builds the hierarchy order by order with a \`reduce\`, using the index inside each order to number HL segments.
- The retailer's guide uses the Shipment / Order / Pack / Item hierarchy (Tare optional).

## Logs
\`\`\`
16:35:03.120 WARN  [997] ISA=000041221 AK3*HL*12 ... AK5*R (rejected)
  - HL01 not unique / HL02 parent not found
16:42:10.500 INFO  [debug] SH-77121 HL segments:
  HL*1**S  HL*2*1*O  HL*3*2*P  HL*4*3*I  HL*2*1*O  HL*3*2*P ...
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
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
    'HL01 must be unique and sequential across the whole 856 transaction; HL02 must reference the parent HL01.',
    'The refactor numbers HL segments per order, so with several orders the IDs repeat and parent references break; single-order ASNs still look valid.',
    'Immediate: roll back, regenerate and resend rejected ASNs (new control numbers) before goods arrive; inform the retailer account team.',
    'Fix: one running counter for the transaction, parent IDs taken from the actual parent node; regression tests with multi-order shipments.',
    'Prevention: validate outbound EDI against the partner guide, monitor 997/999 rejections per partner.',
  ],
  solution: `
**Diagnosis.** In an 856, every HL segment has an ID (**HL01**) that must be unique within the transaction, a parent ID (**HL02**) and a level code (**HL03**: S, O, T, P, I). The new mapping restarts its counter **per order**. For a single-order shipment that still gives 1, 2, 3, 4... and is valid. For a multi-order shipment the second order produces \`HL*2*1*O\` again, so IDs repeat and items point to the wrong parents. The retailer's translator rejects the transaction set (\`AK5*R\`).

**Immediate mitigation.** Roll back to v2.6.x. List the rejected ISA/shipment numbers from the 997 log, regenerate those ASNs with new control numbers and resend them. Check which trucks have already arrived and tell the retailer's account team, which reduces chargeback risk.

**Root cause.** A readability refactor changed the numbering logic, and the tests only covered single-order shipments.

**Permanent fix.**
- Build the hierarchy first as a tree (shipment > orders > packs > items). Then **flatten it in order with one running counter**, assigning each node's HL01 and taking HL02 from its parent's assigned ID.
- Add regression tests with multi-order, multi-carton shipments, compared with 856 samples the retailer has certified.

**Prevention.** Validate outbound documents against the partner's implementation guide (in the EDI module or gateway) before sending; alert on 997/999 rejections per partner; require partner re-certification for mapping changes.
`,
  followUps: [
    { q: 'What do the 997 AK5 and AK9 segments tell you?', a: 'AK5 gives the acceptance status of each transaction set (accepted, rejected, accepted with errors), and AK9 the status of the whole functional group, with counts of received and accepted sets.' },
    { q: 'Why must resent ASNs get new control numbers?', a: 'Partners use ISA/GS/ST control numbers to detect duplicates; reusing them can make the retailer discard the corrected ASN as a duplicate.' },
    { q: 'What is the difference between a 997 and a 999?', a: 'Both are functional acknowledgements; the 999 (implementation acknowledgement) can also report errors against the implementation guide rules, not just the base X12 syntax.' },
  ],
}
