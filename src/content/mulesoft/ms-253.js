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
      prompt: 'What can a holder of the storage account key do?',
      options: [
        'Read and write one container only',
        'Anything in the account, including signing SAS',
        'Only list and read blobs',
        'Only what its RBAC role allows',
      ],
      answer: 1,
      explain: 'The account key is full control of the account. Leaking it is like leaking an admin password.',
    },
    {
      type: 'multi',
      prompt: 'Which limits can be built into a SAS token?',
      options: ['Permissions such as read or write', 'An expiry time', 'Allowed IP addresses', 'HTTPS only', 'A maximum blob size'],
      answer: [0, 1, 2, 3],
      explain: 'A SAS limits what, until when, from where and over which protocol. It cannot cap the size of what is uploaded.',
    },
    {
      type: 'single',
      prompt: 'A SAS token for a partner leaks. It was signed with the account key and has no stored access policy. How can you revoke it?',
      options: [
        'Delete the token in the Azure portal',
        'Rotate the account key that signed it',
        'Rename the container it points to',
        'It cannot be revoked in any way',
      ],
      answer: 1,
      explain: 'Rotating the key also breaks every other SAS signed with that key. A plain SAS is checked by its signature. Only rotating the key, or a stored access policy set up in advance, stops it before expiry.',
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
        'It works if the container allows public read',
      ],
      answer: 1,
      explain: 'Reader roles allow reads only. Marking a blob processed is a write, so it needs a role such as Storage Blob Data Contributor.',
    },
    {
      type: 'single',
      prompt: 'Can a Mule app on CloudHub use an Azure managed identity to reach the storage account?',
      options: [
        'Yes, any app can be given one',
        'No, an app outside Azure needs other credentials',
        'Only when the app runs in a matching region',
        'Only for reads, not for writes',
      ],
      answer: 1,
      explain: 'Managed identities are tied to resources hosted in Azure. Apps running elsewhere, such as on CloudHub, use a service principal or a SAS they hold themselves.',
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
