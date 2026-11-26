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
      prompt: 'The storage account key was put in the app properties to reach the inbound share, and the file leaked in a support ticket. What can someone holding that key do?',
      options: [
        'Read and write the inbound share only, since the key was set up for it',
        'Reach file shares in the account, but not its blob containers or queues',
        'Only what the RBAC role of the app identity allows on the account',
        'Read, write and delete in every share, container and queue, and sign SAS',
      ],
      answer: 3,
      explain: 'The account key is like an admin password for the whole account. It is not scoped to a share or a service, and RBAC roles do not limit it. Whoever holds it can use every share, container and queue, and sign new SAS tokens. Rotate the key at once, and give the app a scoped SAS instead.',
    },
    {
      type: 'single',
      prompt: 'The app only reads and lists one inbound share. Which credential fits best?',
      options: [
        'The account key, kept in secure properties',
        'A read and list service SAS for that share',
        'An account SAS with all rights for ten years',
        'An account SAS with read rights on all shares',
      ],
      answer: 1,
      explain: 'Use HTTPS only and a limited lifetime as well. Give the app the smallest scope and rights it needs. A share level SAS with read and list cannot touch other shares.',
    },
    {
      type: 'multi',
      prompt: 'A share SAS valid for one year, with no stored access policy, shows up in full in an application log line. What is true for the response and the next setup?',
      options: [
        'Delete the SAS in the Azure portal, the way you revoke an API key',
        'Add a stored access policy now, which revokes the SAS already issued',
        'Rotating the account key that signed it is the only way to revoke it now',
        'Issue the new SAS against a stored access policy, so removing the policy revokes it',
        'Mask the sig part of the URL in logs, since the SAS travels in the query string',
      ],
      answer: [2, 3, 4],
      explain: 'A SAS is a bearer secret, and Azure keeps no list of issued tokens, so there is nothing to delete. An ad hoc SAS stays valid until it expires or the key that signed it is rotated. A policy added later does not cover a SAS that was signed without it. Tie the next SAS to a stored access policy and keep it out of logs.',
    },
    {
      type: 'single',
      prompt: 'The security team bans account keys and asks you to switch the CloudHub app from its Azure Files service SAS to a user delegation SAS signed with Entra ID. What do you tell them?',
      options: [
        'It works on service version 2025-07-05 or later, signed with a user delegation key from Entra ID',
        'Azure Files has no user delegation SAS, so the app must keep the account key',
        'It works once the user delegation SAS is tied to a stored access policy on the share',
        'Keep the service SAS, since for file shares it is signed by Entra ID, not the key',
      ],
      answer: 0,
      explain: 'Azure Files accepts a user delegation SAS from service version 2025-07-05. The app principal asks Entra ID for a user delegation key and signs the SAS with it, so no account key is used. A user delegation SAS cannot use a stored access policy. A service SAS is always signed with the account key. An Entra ID token with a Storage File Data role is another keyless path.',
    },
    {
      type: 'single',
      prompt: 'The app uses a service principal and an Entra ID token to call the REST API, and gets 403. The token is valid. What is the likely cause?',
      options: [
        'The principal has Contributor, but data calls need Owner',
        'The principal has no Storage File Data role',
        'The storage account is in another region',
        'The call also needs a SAS token in the query string',
      ],
      answer: 1,
      explain: 'It needs a data role, such as a Storage File Data role, on the account or share. A token proves who the caller is. An RBAC data role decides what it may do. Check the exact role and any extra header the API version expects in the Azure docs.',
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
    'Azure Files accepts a user delegation SAS only from service version 2025-07-05, signed with a key from Entra ID.',
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
