export default {
  id: 'ms-253',
  category: 'mulesoft',
  title: 'Authenticating to Azure Blob From Mule: Account Key, SAS Tokens or a Service Principal',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'authentication', 'sas', 'service-principal', 'rbac', 'security', 'product-data-hub'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'Every partner shares the hub account key, though each partner only needs to upload into the inbound container. What can one partner do with that key today?',
      options: [
        'Reach only the inbound container, as the key was handed out for it',
        'Only what the RBAC role on its own Entra account allows',
        'Read and write blobs, but deletes need an Entra identity',
        'Read, change or delete anything in the account, and sign SAS tokens',
      ],
      answer: 3,
      explain: 'The account key is full control of the account. Leaking it is like leaking an admin password. A key is not scoped to a container. Requests signed with the key do not go through RBAC at all, so roles do not limit it, and no operation needs an extra identity.',
    },
    {
      type: 'multi',
      prompt: 'A partner must upload to the inbound container for one week, only from its office IP range, over HTTPS, with files under 50 MB. Which of these can the SAS itself enforce?',
      options: ['Write and create only, on the inbound container', 'Expiry after seven days', 'Only from the office IP range', 'HTTPS only', 'Files under 50 MB', 'Only blob names that end in .json'],
      answer: [0, 1, 2, 3],
      explain: 'A SAS limits what, until when, from where and over which protocol: its permissions, expiry, allowed IP range and allowed protocol are all part of the signed token. It cannot cap the size of what is uploaded, so the hub must check the size itself. It also cannot limit blob names to a pattern, so the hub must check names and reject what does not fit.',
    },
    {
      type: 'single',
      prompt: 'A SAS token for a partner leaks. It was signed with the account key and has no stored access policy. How can you revoke it?',
      options: [
        'Revoke the user delegation keys on the account',
        'Regenerate the storage key it was signed with',
        'Add a stored access policy to the container now',
        'Issue a new SAS so the old signature is replaced',
      ],
      answer: 1,
      explain: 'A SAS signed with an account key is checked against that key, so regenerating the key stops it before expiry. That also breaks every other SAS signed with the same key. Revoking user delegation keys stops only SAS tokens signed through Entra ID. A stored access policy added now does not apply to a SAS that was not issued against it. A new SAS does not replace an old one, so both stay valid.',
    },
    {
      type: 'match',
      prompt: 'Match each option to how it is revoked or limited.',
      pairs: [
        ['Account key', 'Regenerate the key'],
        ['Service SAS with a stored access policy', 'Change or delete the policy'],
        ['User delegation SAS', 'Signed with Microsoft Entra credentials, and short lived'],
        ['Service principal', 'Remove its role assignment or its secret'],
      ],
      explain: 'Options that can be revoked one by one are safer than a key shared by everything.',
    },
    {
      type: 'single',
      prompt: 'A Mule app uses a service principal that has the Storage Blob Data Reader role on the inbound container. It tries to set metadata on a blob. What happens?',
      options: [
        'It works, since reading includes metadata',
        'It is refused, since the role allows no writes',
        'It works for blobs the app itself created',
        'It works if the role is set at account scope',
      ],
      answer: 1,
      explain: 'Reader roles allow reads only. Marking a blob processed is a write, so it needs a role such as Storage Blob Data Contributor.',
    },
    {
      type: 'single',
      prompt: 'The hub on CloudHub 2.0 moves from the account key to Microsoft Entra auth. A team member proposes a managed identity, so that no secret is stored. What should the team do?',
      options: [
        'Turn on a system assigned identity for the app in Runtime Manager',
        'Use a managed identity, with the private space in the same region',
        'Register a service principal and keep its secret in secure properties',
        'Use a managed identity for reads, and keep the account key for writes',
      ],
      answer: 2,
      explain: 'Managed identities are tied to resources hosted in Azure, or to servers that Azure Arc manages. CloudHub workers are neither, so apps there use a service principal or a SAS they hold themselves. A service principal still needs a secret or certificate, kept in secure properties. Runtime Manager has no Azure identity to turn on, and the region of the private space does not change where the app runs. A managed identity is not available for reads either, as the app is still outside Azure.',
    },
  ],
  description: `
Kestrel Home Supply runs a product data hub. Partners upload GS1 style JSON files to an Azure Blob container, and the Mule hub reads them, then writes metadata to mark each one processed. Today every partner and the hub use the same account key, stored in several properties files.

The security team wants this fixed before the next audit.

**Questions**
1. What is wrong with sharing the account key?
2. How should partners write their files?
3. How should the Mule hub authenticate, and with which rights?
4. How do you rotate and revoke access without an outage?
`,
  answerTemplate: `## The account key problem

## Partner access

## Hub access

## Rotation and revocation
`,
  keyPoints: [
    'The account key gives full control of the whole account.',
    'A SAS token limits permissions, expiry, IP range and protocol.',
    'A plain SAS can only be revoked by rotating its key, so use stored access policies or user delegation SAS.',
    'A service principal with an RBAC data role gives the hub its own revocable identity.',
    'Marking blobs processed needs a role that allows writes.',
    'Two account keys allow rotation without downtime. Shared key access can be turned off once nothing uses it.',
  ],
  solution: `
**1. The account key.** It gives full control of the whole storage account: every container, every blob, deletes and SAS signing. Shared by all partners, it cannot be revoked for one of them, and any leak exposes everything.

**2. Partner access.** Give each partner a SAS limited to its own container or path, with write and create rights only, an expiry, HTTPS only and, where possible, its IP range. Back it with a stored access policy, or use a user delegation SAS signed with Microsoft Entra credentials, so one partner can be cut off without touching the others.

**3. Hub access.** Register an application in Microsoft Entra ID and use its service principal from Mule, with a client secret or certificate kept in secure properties. Give it a data role on the inbound container: reading files and writing metadata needs a role such as Storage Blob Data Contributor, scoped to that container rather than the account. A managed identity is not available to an app running outside Azure. Check which authentication types your connector version supports before choosing.

**4. Rotation and revocation.** Storage accounts have two keys, so systems can move to key 2 while key 1 is regenerated. With partners on their own SAS and the hub on a service principal, nothing should need the key at all, and you can turn off shared key access for the account. Then rotation is per partner SAS or per service principal secret.
`,
  followUps: [
    {
      q: 'Why scope the hub role to the container and not the account?',
      a: 'If the hub credentials leak, only that container is exposed. Least privilege limits the damage of any one secret.',
    },
    {
      q: 'A new role assignment does not work for a few minutes. Is that a bug?',
      a: 'No, role assignments can take some time to take effect. Plan for it in a release, and retry before assuming the role is wrong.',
    },
    {
      q: 'How do you stop a partner SAS from living forever?',
      a: 'Give it a short expiry and issue new ones on a schedule, or let the partner request a fresh token from an API you control.',
    },
  ],
}
