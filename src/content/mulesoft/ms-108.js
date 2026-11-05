export default {
  id: 'ms-108',
  category: 'mulesoft',
  title: 'SLA Tiers and the Contract Lifecycle: Approval, Tier Changes, Revoking and Deprecating',
  level: 'INTERMEDIATE',
  tags: ['api-manager', 'api-management', 'sla-tiers', 'contracts', 'client-applications', 'exchange', 'deprecation'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'A developer requests access in Exchange to an API instance that has no SLA tiers defined. What happens to the request?',
      options: [
        'It is approved automatically and a contract is created',
        'It waits until an administrator creates a tier',
        'It is rejected, because a contract needs a tier',
        'It waits for an Organization Administrator to approve it',
      ],
      answer: 0,
      explain: 'The docs state that a request is automatically approved if no SLA tiers are defined. This is why a public-facing API needs its tiers before developers can find it.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The Gold tier allows 1,000 requests per minute and 40 apps are approved on it. An administrator edits it to 500. When does this affect those apps?',
      options: [
        'Immediately: approved apps are held to the edited tier',
        'Only for apps approved after the edit',
        'At the next redeployment of the API',
        'After each app owner accepts the change',
      ],
      answer: 0,
      explain: 'If you edit a tier that has approved applications, they are immediately held to the new terms. The docs warn that changing throughput without notice can inconvenience users.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A tier requires manual approval and has 12 pending requests. It is changed to automatic approval. What happens to the 12 requests?',
      options: [
        'API Manager grants them',
        'They stay pending until someone approves them',
        'They are rejected and must be sent again',
        'Only requests made after the change are affected',
      ],
      answer: 0,
      explain: 'The docs state that when a tier changes from manual to automatic approval, API Manager grants any pending approval requests. Review the pending list before making this change.',
    },
    {
      type: 'order',
      prompt: 'Order the documented steps to move apps off an old tier and remove it.',
      items: [
        'Create a new tier and tell application owners its name',
        'Revoke application access to the old tier',
        'Ask application owners to request access again on the new tier',
        'Approve their move to the new tier',
        'Delete the old tier when no applications are assigned to it',
      ],
      explain: 'You cannot delete a tier that has applications assigned. The docs describe this path: new tier, revoke, re-request, approve, delete.',
    },
    {
      type: 'single',
      prompt: 'A contract links a client application to an API instance. During a dispute, an API owner must block one partner\'s app and keep the option to let it back in. What should the owner do?',
      options: [
        'Revoke the contract, and restore it when the dispute ends',
        'Delete the contract, and restore it when the dispute ends',
        'Deprecate the API instance, and undo that when the dispute ends',
        'Deprecate the SLA tier that the app is on',
      ],
      answer: 0,
      explain: 'Revoking blocks the client application from accessing the API. It is the reversible step: the contract can then be restored or deleted, and you must revoke a contract before you can delete it. The docs describe restore only for a revoked contract, and deletion removes the approved contract. Deprecating an instance or a tier leaves existing apps in place.',
    },
    {
      type: 'single',
      prompt: 'v1 of an API is deprecated in API Manager while consumers move to v2. What happens to apps that already have contracts with v1?',
      options: [
        'Their contracts stay active, but no new contracts can be created for that instance',
        'All contracts are revoked at once',
        'Their requests get a warning header from the gateway',
        'Their contracts move to v2 automatically',
      ],
      answer: 0,
      explain: 'Deprecating removes the invitation to request access. Existing application contracts stay active, and no new contracts can be created. It does not stop traffic.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A partner requests access on a manual tier. Who is notified automatically that the contract is pending?',
      options: [
        'Organization administrators, environment administrators and contracts managers',
        'Only the owner of the client application',
        'Nobody, because the approver must check the Contracts page',
        'All users in the business group',
      ],
      answer: 0,
      explain: 'Contract alerts go to whoever must act: administrators for pending and auto-approved requests, and application owners when their request is decided or changed.',
    },
  ],
  description: `
An energy retailer publishes a **Meter Readings API** to about 90 partner applications. It has three tiers:

| Tier | Limit | Approval |
|---|---|---|
| Bronze | 60 per minute | Automatic |
| Silver | 600 per minute | Manual |
| Gold | 6,000 per minute | Manual |

Over the next quarter the API owner must:
- Reduce Silver from 600 to 400 per minute after a capacity review.
- Stop manual work by making Silver automatic. There are 12 pending Silver requests, and two of them are from companies that failed a credit check.
- Retire Bronze, which still has 31 apps.
- Respond to a partner that requests Gold when the business will only approve Silver.
- Block one partner's app during a dispute, with the option to let it back in.
- Move everyone from v1 to v2 of the API.

**Questions**
1. What are SLA tiers, and what is needed for them to be enforced?
2. How does a contract come into being? When is it automatic?
3. What is the effect of each planned change, and in what order would you do them?
4. What is the difference between revoking and deleting a contract, and between deprecating a tier and an API instance?
`,
  answerTemplate: `## SLA tiers and enforcement

## How a contract is created

## The planned changes

## Revoke, delete and deprecate
`,
  keyPoints: [
    'An SLA tier is a named access level with limits and an approval type (automatic or manual). The instance URL must be set to define tiers, and a tier is enforced only by an SLA-based policy.',
    'A contract links one client application to one API instance. Only one contract can exist per instance and application at a time. The API Groups pages add a case: an app can also hold a group contract on that API, and then only one contract is Applied.',
    'With no tiers defined, access requests are approved automatically.',
    'Editing a tier applies immediately to approved apps. Changing manual to automatic grants all pending requests.',
    'A tier with applications cannot be deleted. Create a new tier, revoke access, have owners request again, approve, then delete the old tier.',
    'An approver can override a request by applying another tier.',
    'Revoke blocks the app and can be undone with Restore; a contract must be revoked before it can be deleted.',
    'Deprecating an API instance stops new contracts only. Existing contracts stay active.',
  ],
  solution: `
**1. SLA tiers.** A tier is a category of access that you define on an API instance: a name, one or more limits, and automatic or manual approval. A tier alone enforces nothing. You need a rate-limiting or throttling policy that is **SLA-based**, and every consuming app must register for a tier and send its client credentials.

**2. Contracts.** A developer picks an instance in Exchange, chooses or creates a client application, chooses a tier, and clicks **Request access**. When the request is approved, a contract is created between the instance and the application. Only one contract can exist per instance and application. The request is automatic if the tier is automatic, or if the instance has no tiers. For manual tiers, people with the Organization Administrator, API Manager Environment Administrator or Manage Contracts permission approve or reject it on the instance's **Contracts** page.

**3. The planned changes.**
- **Reduce Silver to 400.** All Silver apps are held to the new limit at once. Tell partners first and pick a date.
- **Make Silver automatic.** This grants every pending request, including the two that failed the credit check. **Reject those two first**, then change the tier.
- **Retire Bronze.** It cannot be deleted with 31 apps on it. Create the replacement tier, tell the owners, revoke access to Bronze, let owners request the new tier, approve, then delete Bronze. Apps lose access between revoke and re-request, so agree the timing.
- **Partner asks for Gold.** Approve with an override: the approver can apply another tier in place of the one requested.
- **Dispute.** **Revoke** the contract. Do not delete it, because a revoked contract can be restored.
- **v1 to v2.** Deprecate the v1 instance. New contracts stop and existing apps keep working. Consumers then request access to the v2 instance, because a contract belongs to an instance. Delete v1 only after traffic stops.

A safe order: reject the two bad requests, change Silver to automatic, announce and change the limit, then start the Bronze move.

**4. The differences.**
| Action | Effect |
|---|---|
| Revoke contract | App blocked; can be restored or deleted |
| Delete contract | Removes the contract; it must be revoked first |
| Deprecate tier | No new sign-ups on that tier; existing apps must be moved before it can be deleted |
| Deprecate API instance | No new contracts; a badge shows it is deprecated; existing contracts stay active |
`,
  followUps: [
    {
      q: 'What does the Visible flag on a limit do?',
      a: 'With several limits in a tier, it can hide a limit from application developers at registration. The docs say that if you define only one limit, you cannot hide it.',
    },
    {
      q: 'Does a partner get an email when an app is approved?',
      a: 'Yes, contract alerts are automatic. Application owners are notified when a contract is approved, rejected, revoked, restored or has its tier changed. These alerts come from no-reply@mulesoft.com, and that cannot be customized.',
    },
    {
      q: 'How many tiers can one API version have?',
      a: 'The API Manager limits page lists 250 SLA tiers per API version.',
    },
    {
      q: 'Can a deprecated instance be brought back?',
      a: 'Anypoint CLI has both api-mgr:api:deprecate and api-mgr:api:undeprecate commands, so it is not a one-way step.',
    },
  ],
}
