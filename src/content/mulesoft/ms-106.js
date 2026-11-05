export default {
  id: 'ms-106',
  category: 'mulesoft',
  title: 'Connected Apps, MFA and External Identity: Securing Machine and Human Access to Anypoint Platform',
  level: 'ADVANCED',
  tags: ['security', 'access-management', 'connected-apps', 'oauth2', 'mfa', 'sso', 'saml', 'openid-connect'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'A Jenkins pipeline must deploy apps with no human present. It currently signs in with a shared user account. What do the docs require?',
      options: [
        'An internal connected app that acts on its own behalf (Client Credentials), instead of a service account',
        'Keep the user account and turn off MFA for the organization',
        'A connected app with the Password grant, using the same user account',
        'Add the account to Exempt Accounts permanently',
      ],
      answer: 0,
      explain: 'MuleSoft requires internal connected apps instead of service accounts for programmatic calls. MFA cannot be turned off at organization level, and the exemption is limited to specific account types.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the connected app grant type.',
      pairs: [
        ['A tool acts for a signed-in user, who authorises it in the browser', 'Authorization Code'],
        ['A CI/CD pipeline runs with no user, on its own behalf', 'Client Credentials'],
        ['A trusted client gets tokens without transmitting a client secret', 'JWT Bearer'],
        ['An app exchanges a username and password for a token, which is not recommended', 'Password'],
      ],
      explain: 'Client Credentials belongs to the type "App acts on its own behalf", which can only be used in the organization where it is created. The other three belong to "App acts on behalf of a user".',
    },
    {
      type: 'single',
      prompt: 'A connected app has Runtime Manager scopes for the Sandbox environment of one business group, and now calls Production. What must be done?',
      options: [
        'Add the scopes for the Production environment: scopes are selected per business group and environment',
        'Nothing: scopes apply to every environment',
        'Rotate the client secret',
        'Add the app to the Everyone team',
      ],
      answer: 0,
      explain: 'When you add scopes you select the business groups and then the environments they apply to. Keep them as narrow as the pipeline needs.',
    },
    {
      type: 'single',
      prompt: 'A Connected App gives a pipeline its own access to Anypoint Platform. It is created with default settings. What happens to its `clientSecret` over time?',
      options: [
        'It expires after 90 days, the same as refresh tokens',
        'It expires as soon as the access token expires',
        'It has no expiration date, so you plan its rotation',
        'It expires when the user who created the app leaves',
      ],
      answer: 2,
      explain: 'The `clientSecret` has no expiration date by default, though you can change that, so set a rotation date. Refresh tokens are different: they expire after 90 days. With Authorization Code, the `offline_access` scope is required to use refresh tokens after the original access tokens expire. The Password grant is not recommended, because it reveals user credentials to the app and precludes measures such as MFA. Revoking an authorization removes the access and refresh tokens, and the docs say the action cannot be undone.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The engineer who created several connected apps leaves and is removed from the organization. What happens, and what should you do?',
      options: [
        'Ownership transfers to the root organization owner, and you should manually rotate the client secrets of the connected apps',
        'The apps are deleted',
        'The apps stop working until a new owner signs in',
        'Nothing changes, and no action is needed',
      ],
      answer: 0,
      explain: 'The docs give this rule, and it also applies if the creator loses administrative privileges. Rotating matters because that person may still know the secrets.',
    },
    {
      type: 'single',
      prompt: 'Staff sign in through SSO with Okta. A user reports that MFA shows `n/a` in Settings. Is that a problem?',
      options: [
        'No: for SSO users MFA is set up through the identity provider, so Anypoint Platform shows n/a',
        'Yes: MFA has been disabled for that user',
        'Yes: the user must register an authenticator in Anypoint Platform as well',
        'Only if the user is an Organization Administrator',
      ],
      answer: 0,
      explain: 'MFA is managed by the IdP for SSO users. For direct sign-ins it is on by default and cannot be turned off at organization level.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which limits of external identity are documented?',
      options: [
        'External identity can be configured only at organization level, not for a business group',
        'If you delete a user in the IdP, you must also delete the user from the Anypoint Platform organization yourself',
        'OpenID Connect does not support single signout',
        'Membership of SAML groups does not automatically grant permissions: you map groups to teams or roles',
        'Only one external identity provider can be configured',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Up to 25 external IdPs can be configured, using SAML 2.0 or OpenID Connect. Mappings apply only to the IdP they were configured for.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'After SSO goes live, an administrator uses **Invite User** for a new starter. Where are that user\'s credentials stored?',
      options: [
        'In the organization, using the Anypoint identity provider rather than the external IdP',
        'In the external IdP',
        'Nowhere: the invitation fails',
        'In both, kept in sync',
      ],
      answer: 0,
      explain: 'After configuring external identity, add SSO users through your IdP and your provisioning process. Otherwise you get accounts outside the IdP.',
    },
  ],
  description: `
A manufacturer is tightening access to Anypoint Platform before an ISO 27001 audit.

- **Machines:** 14 Jenkins pipelines use one shared account called \`svc-deploy\`, with its password in a Jenkins credential. A Slack bot also reads API status for users.
- **People:** 180 staff sign in directly with Anypoint credentials. The company wants SSO with its corporate IdP and permissions driven by IdP groups.
- **Findings:** several leavers still appear in the user list. Nobody knows who owns the existing connected apps, and a vendor tool asks users to approve it with broad scopes.

**Questions**
1. What are connected apps, and which type fits the pipelines and the Slack bot?
2. How do scopes, secrets and tokens work, and how do you administer them?
3. How does MFA apply to direct users, SSO users and service accounts?
4. How do you introduce external identity, and what are its limits?
5. Give a plan for each finding.
`,
  answerTemplate: `## Connected apps

## Scopes, secrets and tokens

## MFA

## External identity

## Plan for the findings
`,
  keyPoints: [
    'Connected apps give external apps OAuth 2.0 or OpenID Connect access with limited permissions, and their actions are audited.',
    'On behalf of a user: Authorization Code, Password, JWT Bearer. On its own behalf: Client Credentials, for automation.',
    'Scopes are chosen per business group and environment. Client secrets do not expire by default. Refresh tokens expire after 90 days.',
    'Authorization policies: Unrestricted (default) or Restricted, with an allowlist. New scopes need reapproval by an administrator.',
    'If the creator leaves, ownership moves to the root organization owner; rotate secrets.',
    'MFA is required and cannot be turned off for direct sign-ins. SSO users get MFA from the IdP. Only certain tool accounts may be exempt, and connected apps are the required direction.',
    'External identity is organization-wide: up to 25 IdPs, SAML 2.0 or OpenID Connect. Groups give no permissions until mapped to teams or roles.',
    'Deleting a user in the IdP does not delete them from Anypoint Platform.',
  ],
  solution: `
**1. Connected apps.** A connected app registers an external application with a client identity and exact permissions. The platform issues a temporary token for those permissions, with no user credentials exposed, and actions are audited.
- **Pipelines:** **App acts on its own behalf (client credentials)**, one app per pipeline group. Request a token at \`/accounts/api/v2/oauth2/token\` with \`grant_type=client_credentials\`.
- **Slack bot:** **App acts on behalf of a user** with **Authorization Code**, with \`offline_access\` if it needs refresh tokens.

**2. Scopes, secrets, tokens.**
- Scopes are roles with permissions, chosen per business group and environment.
- You need Organization Administrator at the business group level where the app lives.
- The secret has no expiry by default, so set a rotation date. You can reset it in the app or through the Access Management API.
- Revoking an authorization removes its access and refresh tokens and cannot be undone.
- Up to 2000 connected apps per organization and 1000 scopes per app.

**3. MFA.** MFA is on for direct sign-ins and cannot be turned off at organization level. Methods are third-party TOTP apps, built-in authenticators, security keys and Salesforce Authenticator. For SSO users, MFA is handled by the IdP and shows \`n/a\`. Only exempt account types (test automation tools, RPA systems) go on the **Exempt Accounts** list, and MuleSoft requires connected apps instead of service accounts. An administrator can reset a user's MFA if a device is lost.

**4. External identity.** Configure SAML 2.0 or OpenID Connect at the root organization. The IdP you select is effective for all business groups. The IdP must send username and email, and Anypoint Platform must map them, or sign-in fails with a 403. Map groups in **Teams > External IdP Groups**. For SAML, put all groups in one attribute; for OIDC, a JSONata expression must give an array of group names. Limits:
- Accounts from before federation keep signing in through the Anypoint Platform page.
- An SSO user with the same username as an existing user is a separate user.
- OIDC has no single signout.
- Users added with **Invite User** after SSO are stored with the Anypoint identity provider.

**5. Plan.**
- **\`svc-deploy\`:** create connected apps, move each pipeline, then delete the account and audit the result.
- **Leavers:** remove them from the organization by hand, and add that step to the leaver process, as the IdP does not do it.
- **Unknown owners:** review **Owned Apps**, edit the owner, and rotate secrets.
- **Vendor tool:** change the authorization policy to **Restricted**, so only allowlisted apps can be authorised by members. Note that new scopes on an allowlisted app need reapproval.
`,
  followUps: [
    {
      q: 'How do connected apps appear in audit logs?',
      a: 'An audit entry has a Connected App field with the name of the app that acted on behalf of itself or a user. So automated changes can be told apart from human ones.',
    },
    {
      q: 'Why not give the pipeline Organization Administrator to keep it simple?',
      a: 'Connected apps exist to enforce least privilege. If a pipeline secret leaks, the blast radius equals its scopes, so give it only deployment scopes in the environments it deploys to.',
    },
    {
      q: 'Is a connected app the same as a client application in API Manager?',
      a: 'No. A connected app gets access to Anypoint Platform itself. A client application with a contract gets access to one of your managed APIs.',
    },
  ],
}
