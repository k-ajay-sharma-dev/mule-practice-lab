export default {
  id: 'ms-324',
  category: 'mulesoft',
  title: 'Accept Policy and Accept Expression: Routing Records Between Batch Steps',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'accept-policy', 'accept-expression', 'rejects', 'error-handling'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the default accept policy of a batch step?',
      options: ['ALL', 'ONLY_FAILURES', 'NO_FAILURES', 'NONE'],
      answer: 2,
      explain: 'By default a step only takes records that have not failed in an earlier step.',
    },
    {
      type: 'match',
      prompt: 'Match each accept policy to the records the step receives.',
      pairs: [
        ['NO_FAILURES', 'Only records that have not failed so far'],
        ['ONLY_FAILURES', 'Only records that failed in an earlier step'],
        ['ALL', 'Every record, failed or not'],
      ],
      explain: 'ONLY_FAILURES is the usual choice for a last step that writes rejects.',
    },
    {
      type: 'single',
      prompt: 'A step has acceptExpression="#[payload.action == \'DELETE\']". What happens to a record with action UPDATE?',
      options: [
        'It fails',
        'It skips this step and goes on to the next one, still counted as a good record',
        'It stops the job',
        'It is removed from the job',
      ],
      answer: 1,
      explain: 'The expression filters. Skipping a step is not a failure.',
    },
    {
      type: 'single',
      prompt: 'A step has both an accept policy and an accept expression. Which records enter it?',
      options: [
        'Records that pass either one',
        'Records that pass both',
        'Only the expression counts',
        'Only the policy counts',
      ],
      answer: 1,
      explain: 'The policy is checked first, then the expression.',
    },
    {
      type: 'single',
      prompt: 'How does a last step with ONLY_FAILURES find out why a record failed?',
      options: [
        'It cannot',
        'Recent Mule 4 versions offer batch functions in DataWeave, such as one that returns the step exceptions of the record',
        'From the On Complete payload',
        'From the flow variables of the first step',
      ],
      answer: 1,
      explain: 'Check the batch module functions for your runtime version, such as Batch::getStepExceptions().',
    },
    {
      type: 'multi',
      prompt: 'What is a good design for records that fail validation?',
      options: [
        'Raise an error in the validation step, so the record is marked failed',
        'Let later steps skip it with the default policy',
        'Write it with the reason to a reject table in a last step with ONLY_FAILURES',
        'Catch the error in the step and set the payload to null',
      ],
      answer: [0, 1, 2],
      explain: 'Hiding the error with a null payload makes the record look good, and later steps fail in strange ways.',
    },
  ],
  description: `
Marrow & Pine Home loads product changes with a batch job. Each record has an action: CREATE, UPDATE or DELETE. Deletes need a different step. Records that fail validation must end up in a reject table with the reason, and must not reach the load step.

**Questions**
1. What do the three accept policies do?
2. How do you send only deletes to the delete step?
3. How do you collect failed records and their reasons?
`,
  answerTemplate: `## Accept policies

## Routing deletes

## Collecting failures
`,
  keyPoints: [
    'NO_FAILURES is the default and skips failed records.',
    'ONLY_FAILURES takes only records that failed earlier.',
    'ALL takes every record.',
    'An accept expression filters records without marking them failed.',
    'A record enters a step only when it passes both the policy and the expression.',
    'A last ONLY_FAILURES step writes rejects with their reasons.',
  ],
  solution: `
**1. Accept policies.** NO_FAILURES, the default, takes records that have not failed. ONLY_FAILURES takes records that failed in an earlier step. ALL takes every record.

**2. Routing deletes.** Give the delete step \`acceptExpression="#[payload.action == 'DELETE']"\` and the upsert step the opposite expression. Records that do not match skip the step and are still good records.

**3. Collecting failures.** Let the validation step raise an error for a bad record. The record is marked failed, and later steps with the default policy skip it. Add a last step with ONLY_FAILURES that builds a reject row with the record key and the error, using the batch functions for step exceptions if your version has them, and writes it with a batch aggregator into the reject table. Set maxFailedRecords so the job does not stop at the first bad record.
`,
  followUps: [
    {
      q: 'What value of maxFailedRecords fits this design?',
      a: 'Minus one, or a high number, since rejects are expected. Otherwise the job stops at the first failed record.',
    },
    {
      q: 'Can an accept expression read a record variable?',
      a: 'Yes. A flag set on the record in an earlier step, such as vars.isDelete, keeps the expression short.',
    },
    {
      q: 'Why not use a Choice router inside one step instead?',
      a: 'That works too. Separate steps give per step counts in the job result and separate aggregators for bulk writes.',
    },
  ],
}
