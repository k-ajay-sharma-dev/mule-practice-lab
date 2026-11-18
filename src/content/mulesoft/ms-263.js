export default {
  id: 'ms-263',
  category: 'mulesoft',
  title: 'Authenticating to the Azure Files REST API: Account Key, SAS Tokens and Entra ID',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'authentication', 'sas', 'entra-id', 'rbac', 'security'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A developer wants to put the storage account key in the Mule app. What does that key allow?',
      options: [
        'Read access to one share',
        'Full control of everything in the storage account, including signing SAS tokens',
        'Only listing directories',
        'Only what an RBAC role allows',
      ],
      answer: 1,
      explain: 'The account key is like an admin password for the whole account. A leak exposes every share, container and queue in it.',
    },
    {
      type: 'single',
      prompt: 'The app only reads and lists one inbound share. Which credential fits best?',
      options: [
        'The account key',
        'A service SAS for that share with read and list permissions, HTTPS only and a limited lifetime',
        'An account SAS with all permissions for ten years',
        'No credential, with the share made public',
      ],
      answer: 1,
      explain: 'Give the app the smallest scope and rights it needs. A share level SAS with read and list cannot touch other shares.',
    },
    {
      type: 'multi',
      prompt: 'Which are good practices for SAS tokens used by an integration?',
      options: [
        'Tie the SAS to a stored access policy, so it can be revoked without changing the account key',
        'Plan a rotation before it expires',
        'Mask it in logs, since it travels in the query string',
        'Commit it to the Git repository so every developer has it',
      ],
      answer: [0, 1, 2],
      explain: 'A SAS is a bearer secret. Anyone who sees the URL can use it until it expires or its policy is removed.',
    },
    {
      type: 'single',
      prompt: 'Which statement about a user delegation SAS is true?',
      options: [
        'It works for Azure Files and Blob Storage alike',
        'It is signed with Entra ID credentials and is offered for Blob Storage, not for Azure Files',
        'It never expires',
        'It needs the account key',
      ],
      answer: 1,
      explain: 'For Azure Files, a SAS is signed with the account key. That is one reason to protect who can create them.',
    },
    {
      type: 'single',
      prompt: 'The app uses a service principal and an Entra ID token to call the REST API, and gets 403. The token is valid. What is the likely cause?',
      options: [
        'The token is too long',
        'The service principal has no data role, such as a Storage File Data role, on the account or share',
        'Azure Files does not accept HTTPS',
        'The share name is wrong case',
      ],
      answer: 1,
      explain: 'A token proves who the caller is. An RBAC data role decides what it may do. Check the exact role and any extra header the API version expects in the Azure docs.',
    },
    {
      type: 'match',
      prompt: 'Match each credential to its main risk.',
      pairs: [
        ['Account key', 'A leak exposes the whole storage account'],
        ['Long lived SAS without a policy', 'Cannot be revoked short of rotating the key that signed it'],
        ['Service principal secret', 'The client secret itself expires and must be rotated'],
        ['Managed identity', 'Only works where Azure can give the app an identity, not on CloudHub'],
      ],
      explain: 'Each choice moves the risk to a different place. Managed identities need an Azure host, so CloudHub apps usually use a SAS or a service principal.',
    },
  ],
  description: `
Marrow & Pine Home reads store files from an Azure file share with the REST API. The first version used the storage account key, copied into a property file. A security review asked the team to replace it.

**Questions**
1. What are the choices for authenticating to the Azure Files REST API?
2. What does each choice allow, and what is its risk?
3. What would you choose for a Mule app on CloudHub that only reads one share?
4. How do you keep the credential safe in Mule?
`,
  answerTemplate: `## Choices

## Scope and risk

## Choice for this app

## Keeping it safe
`,
  keyPoints: [
    'The account key gives full control of the account.',
    'A service SAS can be scoped to one share with read and list rights and an expiry.',
    'A stored access policy lets you revoke a SAS.',
    'User delegation SAS is a Blob Storage feature, not an Azure Files one.',
    'Entra ID tokens need an RBAC data role as well.',
    'Keep secrets in secure properties and mask the SAS in logs.',
  ],
  solution: `
**1. Choices.** The account key, signing each request with Shared Key. A SAS token, signed with the account key and limited by permissions, scope, time and protocol. An Entra ID token, for a service principal or a managed identity, which newer API versions accept for many REST calls.

**2. Scope and risk.** The account key is full control of the account and should not live in an app. A SAS limits the damage: a service SAS on one share with read and list rights cannot write or reach other shares. A SAS without a stored access policy cannot be revoked short of rotating the account key, so tie it to a policy. Entra ID tokens add RBAC: the identity also needs a data role on the share or account. A managed identity only works where Azure hosts the app.

**3. Choice for this app.** A service SAS on the inbound share with read and list, plus delete or write if the app archives files, HTTPS only, linked to a stored access policy and rotated on a schedule. If the security team prefers Entra ID, a service principal with a narrow data role works too, at the cost of handling token requests and the client secret.

**4. Keeping it safe.** Put the SAS in secure properties or a secrets manager, encrypted, and give each environment its own. Mask query strings in HTTP logs. Track the expiry date and alert before it passes.
`,
  followUps: [
    {
      q: 'The SAS expired at 02:00 and the night run failed. How do you prevent a repeat?',
      a: 'Track the expiry, alert weeks before it, and rotate with an overlap: issue the new SAS, deploy it, then remove the old policy.',
    },
    {
      q: 'Why does an account SAS worry security teams more than a service SAS?',
      a: 'An account SAS can cover several services and all shares. A service SAS is limited to one resource such as a single share.',
    },
    {
      q: 'Can you see who used a SAS?',
      a: 'Storage logs show requests and the authentication type, but a SAS is a shared bearer secret. Give each app its own SAS or policy so the logs tell them apart.',
    },
  ],
}
