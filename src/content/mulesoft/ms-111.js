export default {
  id: 'ms-111',
  category: 'mulesoft',
  title: 'Exchange as a Maven Repository: Publishing, Consuming, Permissions and Who Can See What',
  level: 'INTERMEDIATE',
  tags: ['exchange', 'api-management', 'maven', 'ci-cd', 'developer-portal', 'api-experience-hub', 'permissions'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A team wants to publish a Mule application to Exchange from its pipeline. Its POM uses `maven-deploy-plugin`. What do the docs require?',
      options: [
        'Use `mule-maven-plugin` and do not include `maven-deploy-plugin`, because it is not compatible',
        'Keep `maven-deploy-plugin` and add the Exchange URL to it',
        'Use both, with `maven-deploy-plugin` running last',
        'Use `exchange-mule-maven-plugin` for all asset types',
      ],
      answer: 0,
      explain: 'The publishing page requires the Mule Maven plugin and says not to include maven-deploy-plugin. exchange-mule-maven-plugin is used for custom assets; different asset types use different plugins.',
    },
    {
      type: 'single',
      prompt: 'What must `groupId` be when publishing an asset to a business group through the Maven facade?',
      options: [
        'The business group ID, which also appears in the repository URL',
        'Any reverse domain name, such as com.acme',
        'The name of the environment',
        'The email address of the asset owner',
      ],
      answer: 0,
      explain: 'For the root organization the group ID is the organization ID, and for a business group it is the business group ID. The Facade URL contains the same ID.',
    },
    {
      type: 'single',
      prompt: 'A Mule app was published to Exchange with Maven, and the pipeline shows success. A developer cannot find it in the Exchange asset list. What is the likely explanation?',
      options: [
        'Mule 4 applications are not displayed in the Exchange asset list; they are consumed through the APIs',
        'The publish failed without an error',
        'It is in the development state',
        'Exchange takes 24 hours to index applications',
      ],
      answer: 0,
      explain: 'The asset types page says Mule applications do not appear in the Exchange UI, and they are published and managed through the Maven Facade API or REST API.',
    },
    {
      type: 'multi',
      prompt: 'A pipeline must authenticate to the Maven facade with a connected app. Which statements are correct?',
      options: [
        'The username in settings.xml is `~~~Client~~~`',
        'The password has the form `clientID~?~clientSecret`',
        'The server id in settings.xml must match the repository id in the POM',
        'The Maven facade can also delete assets',
      ],
      answer: [0, 1, 2],
      explain: 'The id connects the POM repository to the credentials. The Maven Facade API does not support deleting assets; use the Exchange UI or the Exchange API for that.',
    },
    {
      type: 'match',
      prompt: 'Match each Exchange permission to what it allows.',
      pairs: [
        ['Exchange Viewers', 'View and download assets in the business group'],
        ['Exchange Contributors', 'Also create assets and edit portal content'],
        ['Exchange Administrators', 'Also share, deprecate and delete assets in the business group'],
        ['Exchange Creator', 'Create assets, and modify only the assets that this user created'],
      ],
      explain: 'A creator automatically gets the Asset Administrator role on assets that they create. Asset-level roles give the same kind of access on one asset, including to users outside the business group.',
    },
    {
      type: 'single',
      prompt: 'Company A shares a RAML fragment and a REST API with Company B, an external organization. What can a user in Company B do?',
      options: [
        'Use the fragment as a dependency in API Designer and scaffold from the API in Studio, but not manage the API in API Manager',
        'Manage the API in API Manager and request access to it',
        'Edit the asset as a contributor',
        'Apply Company A\'s custom policies to its own APIs',
      ],
      answer: 0,
      explain: 'External sharing grants viewer access only. API Manager shows only APIs from the user\'s own business group, and only users internal to the granting organization can request access or become contributors.',
    },
    {
      type: 'single',
      prompt: 'Which statement about portals is correct?',
      options: [
        'API Experience Hub is the next-generation evolution of API Community Manager, while an Exchange public portal is the simple built-in portal of an organization',
        'The Exchange public portal replaced API Experience Hub',
        'API Community Manager is the current name of the Exchange public portal',
        'Public portals are disabled by default and need a Salesforce organization',
      ],
      answer: 0,
      explain: 'Exchange public portals are enabled by default and replace what were called developer portals. API Experience Hub connects to a Salesforce organization, and the docs describe it as the next generation of API Community Manager.',
    },
  ],
  description: `
A manufacturer's integration team of 40 developers uses Jenkins. Exchange is its only artifact store for MuleSoft assets. Current problems:

- Jenkins uses \`maven-deploy-plugin\` and a shared person's password, and publishing is unreliable.
- A published Mule app "cannot be found" in Exchange, so a developer published it again.
- A team changed the name in the POM for version 2.0.0, and Exchange still shows the old name.
- All 40 developers are Exchange Administrators.
- A sister company, which has its own Anypoint organization, needs the shared fragments.
- Dealers (external companies) need to read the Parts API and get credentials. The marketing team also wants a branded portal with a community feed.

**Questions**
1. How does Exchange work as a Maven repository? Explain the URL, \`groupId\`, plugins and authentication for publishing and consuming.
2. Explain the missing app and the old name.
3. Which permissions would you give, and why?
4. What can the sister company do with shared assets?
5. Which portal option fits the dealers?
`,
  answerTemplate: `## Exchange as a Maven repository

## The missing app and the old name

## Permissions

## Sharing with the sister company

## Portal options
`,
  keyPoints: [
    'The Exchange Maven Facade API lets Maven clients publish and consume connectors, Mule apps, examples, templates, policies and custom assets. It supports Maven clients only, not REST clients.',
    'groupId is the organization or business group ID, and it also appears in the Facade URL. The URL differs by control plane.',
    'Use the Mule Maven plugin; do not include maven-deploy-plugin. Facade v3 needs Mule Maven plugin 3.5.0 or later.',
    'The Facade cannot delete assets. A new version is stable unless the version is SNAPSHOT, which stays in development.',
    'Mule 4 apps do not appear in the Exchange asset list. Name and description in the POM apply only to the first version of a group and asset ID.',
    'Connected app authentication uses the username ~~~Client~~~ and the password clientID~?~clientSecret.',
    'Give least privilege: Exchange Creator lets everyone publish while limiting changes to their own assets.',
    'External organizations get viewer access: no API Manager management, no access requests, no shared custom policies.',
    'Public portals are enabled by default. API Experience Hub is the next generation of API Community Manager.',
  ],
  solution: `
**1. Exchange as a Maven repository.** The **Exchange Maven Facade API** is a Maven endpoint in front of Exchange.

- **URL:** \`https://maven.anypoint.mulesoft.com/api/v3/organizations/ORGANIZATION_ID/maven\`. EU and other control planes use different hosts.
- **groupId:** the organization ID, or the business group ID if publishing to a business group.
- **Publishing:** \`mule-maven-plugin\` with the correct classifier, such as \`mule-application\`, and the Facade in \`distributionManagement\`. Remove \`maven-deploy-plugin\`, which is not compatible. Facade v3 needs plugin version 3.5.0 or later.
- **Authentication:** credentials are in \`settings.xml\`, linked by the same \`id\` as the repository in the POM. For a pipeline, use a connected app: username \`~~~Client~~~\`, password \`clientID~?~clientSecret\`. This removes the shared password.
- **Consuming:** add the asset's group ID, artifact ID and version to \`dependencies\`, and the Facade to \`repositories\`.
- **Lifecycle:** Maven publishes as stable by default. A version of \`SNAPSHOT\` with Facade v3 stays in development, and repeat deploys overwrite it. A development version that is not a SNAPSHOT cannot be consumed through Maven.

**2. The two surprises.**
- Mule 4 applications do not appear in the Exchange asset list. The first publish worked, so the second was not needed.
- The POM's \`name\` and \`description\` are read only for the first version of a group ID and asset ID. After that they are ignored. Change the name in the asset portal.

**3. Permissions.**
| Who | Permission |
|---|---|
| Consumers of assets | Exchange Viewers |
| Documentation writers | Exchange Contributors |
| Delivery developers | Exchange Creator: can create assets, and modify only their own |
| C4E team | Exchange Administrators |
| One person outside the business group | Asset Viewers, Contributors or Administrators on that asset |

Note that a connected app with Exchange Creator cannot create new versions of existing assets. Users must log out and in again to see updated permissions.

**4. The sister company.** Both organizations add each other to **External Access** in Access Management. An Exchange or asset administrator then shares the asset. The receiving organization has viewer access only:
- It can use a shared connector, example or template in Studio.
- It can add a shared RAML fragment as a dependency in API Designer. If the sharing stops or the fragment is deleted, its spec shows "File not found".
- It cannot manage a shared API in API Manager or apply a shared custom policy.
- It cannot request access to an API.

**5. Portal options.**
- **Exchange public portal:** every organization has one, enabled by default. Anyone can view it and download assets without logging in. Anypoint users from other organizations log in as external users, and they can create client applications and request access. You can customize the logo, banner image, text and favicon.
- **API Experience Hub:** a separate product that connects to a Salesforce organization. It is the next-generation evolution of **API Community Manager**. It offers templates, user management, and community features such as Chatter feed tracking.

The dealers' needs could be met by the public portal. The branded portal with a community feed points to API Experience Hub. Before publishing, remember that a public portal is visible to anyone with its URL, and the visibility of each instance is set separately as public or private.
`,
  followUps: [
    {
      q: 'Who can add an asset to a public portal?',
      a: 'Exchange administrators. Removing an asset from the portal does not delete it; it stays available internally and its visibility becomes Private.',
    },
    {
      q: 'Can you turn a public portal off?',
      a: 'Yes, through the Exchange API with a token from a user with the Organization Administrator permission in the root organization. All shared assets must first be set to private.',
    },
    {
      q: 'What makes the Request access button appear on a public portal?',
      a: 'Publish a REST, SOAP or HTTP API, create an instance in API Manager, set the instance as public, and set its URL. For a private instance, the button shows only to logged-in users.',
    },
    {
      q: 'Is the mocking service instance private?',
      a: 'No. The Configuring Instances page says the mocking service is always public, so do not put real data in spec examples.',
    },
  ],
}
