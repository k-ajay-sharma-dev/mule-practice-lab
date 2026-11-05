export default {
  id: 'ms-010',
  category: 'mulesoft',
  title: 'Anypoint Platform Structure: Business Groups, Environments, Access',
  level: 'INTERMEDIATE',
  tags: ['anypoint-platform', 'access-management', 'environments', 'governance'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'Each division must manage its own apps, assets and admins without touching the others. How do you structure the organization?',
      options: [
        'One root organization with a child business group per division and one for the CoE',
        'One organization with a separate environment per division',
        'A separate Anypoint organization (separate subscription) per division',
        'One environment shared by all, with naming conventions per division',
      ],
      answer: 0,
      explain: 'Environments only separate deployments. **Business groups** also separate ownership — assets, admins, capacity allocation and Exchange visibility — while staying under one root org.',
    },
    {
      type: 'single',
      prompt: 'Leavers must lose access automatically. What is the best way to grant permissions?',
      options: [
        'Grant permissions to individual users after each joiner request',
        'Configure SSO with Azure AD and map IdP groups to Teams that hold the permissions',
        'Share one admin account per division',
        'Use a Connected App per developer',
      ],
      answer: 1,
      explain: 'With SSO and group-to-team mapping, membership is managed in Azure AD — remove the user there and their access goes. Per-user grants do not scale and are hard to audit.',
    },
    {
      type: 'single',
      prompt: 'How should the CI/CD pipelines authenticate to Anypoint Platform?',
      options: [
        "With a developer's personal username and password stored in the pipeline",
        'With a Connected App using client credentials and only the scopes it needs',
        'With the environment client ID/secret used by API autodiscovery',
        'Anonymously, since deployments come from the corporate network',
      ],
      answer: 1,
      explain: 'A Connected App that acts on its own behalf gives the pipeline a non-personal identity with least-privilege scopes. Environment client credentials are for runtimes pairing with the platform, not for deployments.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to the Anypoint feature.',
      pairs: [
        ['CoE shares RAML fragments and templates', 'Exchange in the CoE business group'],
        ['Split centrally bought vCores between divisions', 'Entitlement allocation from root to business groups'],
        ['Mocking an API during design', 'Design environment'],
        ['Per-environment credentials for autodiscovery', 'Environment client ID/secret'],
      ],
      explain: 'Exchange is the asset catalogue; capacity is assigned from the root org down; each environment has its own client ID/secret.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about environments are true?',
      options: [
        'Each business group has its own environments',
        'Environments are typed as Production or Sandbox (plus Design)',
        'Each environment has its own client ID and secret',
        'Promoting an app keeps the source environment credentials inside the JAR',
      ],
      answer: [0, 1, 2],
      explain: 'Credentials differ per environment, so they must be supplied at deployment (or by the platform) for the target environment — never baked into the JAR.',
    },
  ],
  description: `
A retail company just bought Anypoint Platform. It has three divisions — **Stores**, **E-commerce** and **Finance** — plus a central **Integration CoE**. Requirements from the CIO:

- Each division deploys and manages **its own** applications and must not touch other divisions' production apps.
- The CoE publishes reusable **RAML fragments and templates** that every division can use.
- vCore capacity is purchased centrally but must be **split** between divisions.
- Developers log in with corporate **Azure AD** accounts; leavers must lose access automatically.
- CI/CD pipelines must deploy **without a personal user account**.

**Questions**
1. How would you structure the organization (business groups, environments)?
2. How do you give developers the right permissions — roles vs teams vs individual permissions?
3. How is capacity (vCores) distributed?
4. How do the CI/CD pipelines authenticate?
5. Where do the CoE's shared assets live, and how do divisions consume them?
`,
  answerTemplate: `## Organization layout

## Permissions

## Capacity

## CI/CD authentication

## Shared assets
`,
  keyPoints: [
    'Root organization with child business groups per division (and one for the CoE); each business group has its own environments.',
    'Environments are typed (Production vs Sandbox; plus Design for API design/mocking); each environment has its own client ID/secret.',
    'Permissions are granted to Teams (mapped to IdP groups via SSO) rather than to individual users.',
    'vCores/entitlements are allocated from the root org down to business groups.',
    'Pipelines use a Connected App (client credentials) with only the scopes they need, not a personal account.',
    'Shared assets are published to Exchange in the CoE business group and shared/visible to the other groups.',
  ],
  solution: `
**Organization layout**
- **Root organization** (master) → child **business groups**: *Stores*, *E-commerce*, *Finance*, *Integration CoE*. Business groups isolate assets, apps and permissions; admins of one group can't see another unless granted.
- Each business group gets its own **environments**, e.g. *Development*, *QA* (Sandbox type) and *Production* (Production type). The *Design* environment is used by Design Center for mocking.
- Each environment has its own **client ID/secret**, used e.g. by API autodiscovery.

**Permissions**
- Use **Teams** in Access Management: e.g. *Ecom-Developers* (deploy/manage apps in Ecom Development and QA, view Production), *Ecom-Ops* (manage Production).
- Configure **SSO** with Azure AD (OpenID Connect or SAML) and **map IdP groups to teams**, so joiners/leavers are managed in AD — removing the user from AD removes access.
- Avoid granting permissions to individual users; it does not scale and is hard to audit.

**Capacity:** vCores (and other entitlements such as static IPs/VPNs or private spaces depending on subscription) are bought at the root and **assigned to business groups**; each group can only deploy within its allocation.

**CI/CD:** create a **Connected App** ("app acts on its own behalf", client credentials) in the relevant business group with only the needed scopes (e.g. Runtime Manager deploy for specific environments, Exchange contributor). The pipeline uses its client ID/secret. Rotate secrets and never use a personal login.

**Shared assets:** the CoE publishes fragments, templates and examples to **Exchange** in its business group. Assets are visible to child groups according to Exchange permissions, so divisions add them as dependencies in Design Center/Anypoint Studio. Optionally publish a public/private Exchange portal for partners.
`,
  followUps: [
    {
      q: 'What is the difference between a Sandbox and a Production environment type?',
      a: 'Mostly governance and entitlement: Production environments consume production capacity and are meant for live traffic, and teams often get tighter permissions there. Functionally the deployment model is the same.',
    },
    {
      q: 'Why use business groups instead of just separate environments per division?',
      a: 'Environments only separate deployments; business groups also separate ownership — assets, admins, capacity allocation and Exchange visibility — so each division can self-manage.',
    },
    {
      q: 'What happens to an app\'s client ID/secret when you promote it from QA to Production?',
      a: 'The environment credentials differ per environment, so they must be supplied as deployment properties (or by the platform) for the target environment rather than baked into the JAR.',
    },
  ],
}
