export default {
  id: 'inc-143',
  category: 'incidents',
  title: 'Calls to the Shared AWS VPC Time Out: A Resource Share Clean-Up Removed the MuleSoft Principal and the Transit Gateway Went Unknown',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'transit-gateway', 'aws', 'networking', 'private-space', 'energy'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-07-16 17:32:09 INFO  [aws-cloudtrail] ram:DisassociateResourceShare principal 1234-5678-9012 removed from share tgw-shared-prod by svc-cloud-hygiene', relevant: true, why: 'An external principal was removed from the resource share. The private space loses access when the MuleSoft principal is removed.' },
      { text: '2026-07-16 17:40:51 ERROR [sys-meter-readings] GET https://meters.aws.example.internal/v3/readings failed: connect timed out after 10000 ms', relevant: true, why: 'Calls through the transit gateway begin to fail soon after the clean-up.' },
      { text: '2026-07-16 17:41:02 INFO  [exp-customer] GET /v1/accounts/88120 200 (64 ms) via sys-crm', relevant: false },
      { text: '2026-07-16 17:44:30 INFO  [runtime] sys-meter-readings: status RUNNING, 2 replicas STARTED', relevant: true, why: 'The app is healthy. The detached network path is the problem, and the docs say apps keep running when a connection is lost.' },
      { text: '2026-07-16 18:02:18 WARN  [private-space] prod-energy connections: transit gateway tgw-0f31 state unknown', relevant: true, why: 'The docs list a deleted MuleSoft account principal as a cause of the unknown state.' },
      { text: '2026-07-16 18:05:44 INFO  [aws] transit gateway tgw-0f31 state available, resource share tgw-shared-prod active', relevant: true, why: 'The gateway and the share still exist, which rules out the other documented causes of unknown.' },
      { text: '2026-07-16 18:10:12 INFO  [scheduler] tariff-refresh job completed, 4,120 rows from SaaS', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The MuleSoft AWS account principal was removed from the resource share, so the private space lost access to the transit gateway and its state became `unknown`',
          'The private space ran out of route table entries',
          'The transit gateway was deleted in AWS',
          'The replicas of `sys-meter-readings` are failing',
        ],
        answer: 0,
        explain: 'CloudTrail shows the principal removal, and AWS shows the gateway and the share still exist. Of the documented causes of `unknown`, only the principal removal fits.',
      },
      {
        type: 'single',
        prompt: 'What is the documented fix for this cause?',
        options: [
          'Add the MuleSoft account principal back to the resource share',
          'Delete the transit gateway from CloudHub 2.0 and create a new one',
          'Detach the attachment and create a new VPN',
          'Restart all apps in the private space',
        ],
        answer: 0,
        explain: 'Deleting from CloudHub 2.0 is the fix when the gateway or share was deleted. Here the resource still exists, so the smallest documented repair applies. Detaching would also delete the attachment in AWS and the associated routes.',
      },
      {
        type: 'single',
        prompt: 'Why should the team not leave this for a later change window of several weeks?',
        options: [
          'If the gateway stays in `unknown` or `deleted` for 14 days, Anypoint Platform might remove the private space attachments from it',
          'The transit gateway is deleted from AWS after 24 hours',
          'All apps in the private space stop after 7 days',
          'The private space is deleted after 30 days',
        ],
        answer: 0,
        explain: 'The transit gateway itself is not removed, but losing attachments would mean more repair work, on top of the current outage.',
      },
      {
        type: 'multi',
        prompt: 'Which actions belong in prevention?',
        options: [
          'Tag or exclude the resource share from automated clean-up, and document the MuleSoft AWS account ID for your control plane',
          'Periodically check the connection state, as the docs recommend after setup',
          'Alert on failed calls to AWS-hosted systems from a synthetic check',
          'Retire connections from the CloudHub 2.0 side first when one is truly no longer needed',
          'Create a second, redundant transit gateway attachment',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Transit gateway connections are highly available by design, and the docs say not to create redundant ones. A redundant attachment would not have helped in any case, because the cause was an access change, not a failed component.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Confirm that apps are running and that only traffic through the transit gateway fails',
          'Read the transit gateway state in Runtime Manager',
          'Check in AWS whether the gateway and the resource share still exist, and review recent changes',
          'Add the MuleSoft principal back to the resource share',
          'Verify the state and test connectivity with the Network Tools application',
        ],
        explain: 'Narrow the fault, read the state, find which cause of `unknown` applies, apply the matching repair and verify.',
      },
    ],
  },
  description: `
## Symptoms
- Thursday 17:40: \`sys-meter-readings\` starts timing out on calls to a service in the company's AWS VPC. Billing runs are at risk.
- Apps that call SaaS systems over the internet work normally.
- Runtime Manager shows every app as RUNNING.

## Change / Context
- Private space \`prod-energy\` connects to the company VPC through a transit gateway attachment. The transit gateway is shared through **AWS Resource Access Manager**.
- The cloud platform team runs a new job, \`svc-cloud-hygiene\`, which removes external principals that are not on an approved list from resource shares.
- The network team is on leave until Monday, and the next standard change window is in three weeks.

## Logs
\`\`\`
17:32:09 INFO  [aws-cloudtrail] principal removed from share tgw-shared-prod by svc-cloud-hygiene
17:40:51 ERROR [sys-meter-readings] GET https://meters.aws.example.internal/v3/readings:
         connect timed out after 10000 ms
17:44:30 INFO  [runtime] sys-meter-readings: status RUNNING, 2 replicas STARTED
18:02:18 WARN  [private-space] prod-energy connections: transit gateway tgw-0f31 state unknown
18:05:44 INFO  [aws] transit gateway tgw-0f31 state available, resource share tgw-shared-prod active
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
    'A private space loses access to a transit gateway if the gateway is deleted from CloudHub 2.0 or AWS, a resource share is deleted, or the MuleSoft principal is deleted from the share.',
    'When that happens, the gateway state becomes unknown or deleted.',
    'For a deleted principal, the fix is to add the principal back to the resource share.',
    'For a deleted gateway or share, the fix is to delete the gateway from CloudHub 2.0 using the documented steps.',
    'After 14 days in unknown or deleted, Anypoint Platform might remove the private space attachments, though the gateway itself is not removed.',
    'Removing connections in AWS alone disrupts the connection but does not remove it from CloudHub 2.0.',
    'Transit gateway connections are highly available by design, so no redundant connection should be created.',
  ],
  solution: `
**Diagnosis.** Only traffic through the transit gateway fails, and apps are healthy. Runtime Manager shows \`unknown\`. AWS still has the gateway and the share. CloudTrail shows the principal being removed eight minutes before the first failure.

**Immediate mitigation.**
- Declare the incident, because it does not have to wait for the change window.
- Stop the hygiene job from running again against this share.
- Add the MuleSoft AWS account back as a principal on \`tgw-shared-prod\`. The account ID appears on the **Add Transit Gateway** page and varies by control plane.
- Check the state in Runtime Manager, and test connectivity with the Network Tools application.
- Rerun any failed billing work.

**Root cause.** Automation removed a principal that it did not recognise, with no check of who depended on it. The resulting state is documented behaviour.

**Permanent fix.** Add the MuleSoft account to the approved list, and require a dependency check before the job removes a principal.

**Prevention.**
- Tag shares used by Anypoint Platform and exclude them from automated clean-up.
- Monitor the connection through a synthetic call and check the state regularly.
- When a connection really is no longer needed, delete it from CloudHub 2.0 first, then remove it in AWS, as the docs instruct.
`,
  followUps: [
    { q: 'What would the state be if the transit gateway itself was deleted in AWS?', a: 'deleted. Delete it from CloudHub 2.0 using the documented steps, then create a new transit gateway.' },
    { q: 'What happens to routes if you detach the transit gateway?', a: 'Removing an attachment also deletes the associated routes, and detaching also deletes the attachment in AWS. The resource share stays, so you can add the gateway again.' },
    { q: 'Do apps stop if a transit gateway is detached?', a: 'No. The docs say that apps deployed to the private space continue to run, but they are no longer connected to your Amazon VPCs and VPNs.' },
  ],
}
