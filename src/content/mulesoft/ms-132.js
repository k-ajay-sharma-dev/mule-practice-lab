export default {
  id: 'ms-132',
  category: 'mulesoft',
  title: 'Pipeline Credentials: Connected App Deployment, Encrypted Maven Settings and Precedence Traps',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'security', 'connected-apps', 'mule-maven-plugin'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each authentication method in the deployment configuration to its parameters.',
      pairs: [
        ['Username and password', '`username` and `password`'],
        ['Credentials in `settings.xml`', '`server`'],
        ['Authorization token', '`authToken`'],
        ['Connected App', '`connectedAppClientId`, `connectedAppClientSecret`, `connectedAppGrantType`'],
      ],
      explain: 'These four methods are listed on the CloudHub 2.0 and Runtime Fabric deployment pages.',
    },
    {
      type: 'single',
      prompt: 'What value does `connectedAppGrantType` take in the Mule Maven plugin?',
      options: [
        '`client_credentials`, the only supported type',
        '`authorization_code`',
        '`password`',
        'Either `client_credentials` or `jwt_bearer`',
      ],
      answer: 0,
      explain: 'The reference table says it specifies the only supported connection type, `client_credentials`. That matches a pipeline, which acts on its own behalf with no user.',
    },
    {
      type: 'single',
      prompt: 'Which access scope does the CloudHub 2.0 deployment page say the Connected App credentials must have?',
      options: [
        '`Design Center Developer`',
        '`Exchange Viewer` only',
        '`Organization Administrator`',
        'No scope, because a client credentials app has full access',
      ],
      answer: 0,
      explain: 'The authentication table states this scope for Connected Apps. Other work needs its own scopes: for example, the Anypoint CLI page says Connected Apps need `View Organization` and `View Environment` to authenticate.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for using an encrypted password in `settings.xml`.',
      items: [
        'Run `mvn --encrypt-master-password` to create the encrypted master password',
        'Put it in `settings-security.xml` in `~/.m2`',
        'Run `mvn --encrypt-password` to encrypt the Anypoint Platform password',
        'Add the encrypted value to a `server` entry in `settings.xml`',
        'Reference the server ID with `<server>` in the deployment configuration',
      ],
      explain: 'This is the order on the deployment pages. The password can be encrypted only after the master password exists.',
    },
    {
      type: 'single',
      prompt: 'A deployment block has `<server>my.anypoint.credentials</server>`, and the parent POM still sets `<username>` and `<password>` in the same block. Which credentials are used?',
      options: [
        'The username and password, because the docs say they overwrite the defined server ID',
        'The server entry, because `settings.xml` always wins over the POM',
        'Neither: the plugin rejects the configuration',
        'The server entry first, then the username and password if it fails',
      ],
      answer: 0,
      explain: 'The docs warn you to make sure that the username and password are not set in the deployment configuration, or they overwrite the server ID.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about a Connected App that acts on its own behalf are correct?',
      options: [
        'It acts without impersonating a user',
        'It uses the Client Credentials grant type',
        'It can be used only in the organization where it is created',
        'It is a documented way to build CI/CD pipelines',
        'It needs a user to sign in the first time a pipeline runs',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Those are in the Connected Apps overview and developer pages. No user is involved: signing in belongs to apps that act on behalf of a user.',
    },
  ],
  description: `
A bank's internal audit has found that the integration pipelines deploy with the personal Anypoint account of a platform engineer. The password sits in plain text in a \`settings.xml\` on two Jenkins agents and in a parent POM property. There are 34 applications, and any change must not stop weekly releases.

The security team has set these requirements:
- No personal account is used by a pipeline.
- No secret appears in plain text in a repository or in build logs.
- Each stage has only the access it needs, and Test and Production are separated.
- Secrets can be rotated without changing an application.

The current block looks like this:

\`\`\`xml
<cloudhub2Deployment>
  <environment>$\{deploy.env}</environment>
  <target>$\{deploy.target}</target>
  <provider>MC</provider>
  <applicationName>$\{deploy.appName}</applicationName>
  <username>$\{anypoint.user}</username>
  <password>$\{anypoint.pass}</password>
  <replicas>2</replicas>
  <vCores>0.5</vCores>
</cloudhub2Deployment>
\`\`\`

**Questions**
1. Which authentication methods does the plugin support, and which one do you choose for the pipeline?
2. Rewrite the block.
3. How do you handle publishing to Exchange, which is a separate step with separate credentials?
4. When do encrypted Maven settings still make sense, and what do they protect against?
5. What traps can leave the old credentials in use after the migration?
`,
  answerTemplate: `## Choice of authentication

## Deployment block

## Publishing to Exchange

## Encrypted Maven settings

## Traps during migration
`,
  keyPoints: [
    'Four methods: username and password, server, authToken and Connected App.',
    'A Connected App that acts on its own behalf uses client credentials, needs no user and works only in the organization where it was created.',
    'connectedAppGrantType is client_credentials. The credentials must have the Design Center Developer scope, according to the deployment page.',
    'Exchange as a Maven repository is a separate login: username ~~~Client~~~ and password clientID~?~clientSecret in the server entry.',
    'Encrypted settings use settings-security.xml for the master password and an encrypted value in the server entry.',
    'username and password in the deployment configuration overwrite the server ID, so remove them from every level of the POM.',
    'Inject the secrets from the CI secret store. Do not store them in the repository.',
  ],
  solution: `
**Choice of authentication.** The plugin supports username and password, a \`server\` entry in \`settings.xml\`, an \`authToken\`, and a Connected App. Use a Connected App that acts on its own behalf. It does not depend on a person, it uses the client credentials grant, and the Connected Apps page names CI/CD pipelines as a use. Create separate apps for non-production and production, so that a Test job holds no route to Production.

**Deployment block.**
\`\`\`xml
<cloudhub2Deployment>
  <environment>$\{deploy.env}</environment>
  <target>$\{deploy.target}</target>
  <provider>MC</provider>
  <applicationName>$\{deploy.appName}</applicationName>
  <connectedAppClientId>$\{anypoint.clientId}</connectedAppClientId>
  <connectedAppClientSecret>$\{anypoint.clientSecret}</connectedAppClientSecret>
  <connectedAppGrantType>client_credentials</connectedAppGrantType>
  <replicas>2</replicas>
  <vCores>0.5</vCores>
</cloudhub2Deployment>
\`\`\`
The deployment page says the credentials must have the \`Design Center Developer\` scope. Add the scopes for the target, and test the minimum set in a sandbox, because the page does not give a full list for every operation. The two values come from the CI secret store at run time, for example as \`-D\` parameters masked by the CI tool. They are never in the repository.

**Publishing to Exchange.** Publishing goes through Maven, so it uses a \`server\` entry whose \`id\` matches the repository in \`distributionManagement\`. For a Connected App the username is \`~~~Client~~~\` and the password is \`clientID~?~clientSecret\`. Generate this \`settings.xml\` at build time from the secret store, or store it as a CI secret file. Do not commit a file with real values.

**Encrypted Maven settings.** Where a team must stay with the \`server\` method, follow the documented sequence: \`mvn --encrypt-master-password\`, \`settings-security.xml\` in \`~/.m2\`, \`mvn --encrypt-password\`, and the encrypted value in the \`server\` entry. Then reference it with \`<server>\` in the deployment block. This keeps a plain password out of \`settings.xml\`. It does not remove the need to protect the agent, because \`settings-security.xml\` sits in \`~/.m2\` on the same machine. Encryption is a second layer. Using a secret store and no personal account is what answers the audit finding.

**Traps during migration.**
- \`username\` and \`password\` in the deployment configuration overwrite the server ID. Remove them from the parent POM and from every profile, not only the child POM, then check with \`mvn help:effective-pom\`.
- Remove old \`server\` entries from agents, so an old job cannot quietly succeed with the old account.
- Disable the personal password's use in the pipeline last, after one release has run through the new path.
- Rotate the exposed password, because it has been in plain text and must be treated as compromised.
`,
  followUps: [
    { q: 'What is an authToken for, and why not use it in a pipeline?', a: 'It is an authorization token that replaces username and password, and the docs relate it to single sign-on setups. A pipeline would need to obtain a token before each run, so a Connected App is simpler for automation.' },
    { q: 'How does the same pipeline authenticate the Anypoint CLI?', a: 'Set ANYPOINT_CLIENT_ID and ANYPOINT_CLIENT_SECRET as environment variables from the secret store. The Connected App needs View Organization and View Environment to authenticate.' },
    { q: 'What can happen when an allowlist is enabled for Connected Apps?', a: 'Allowlisting applies to apps that request access to organization user data. If new scopes are added later, they cannot be requested until the admin reapproves the app, while existing authorizations keep working.' },
    { q: 'How do you rotate a Connected App secret safely?', a: 'Update the CI secret store and run a pipeline against a non-production target. Applications are unaffected, because the secret is used only by the pipeline and not at run time.' },
  ],
}
