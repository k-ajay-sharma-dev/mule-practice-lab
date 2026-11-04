export default {
  id: 'ms-021',
  category: 'mulesoft',
  title: 'CI/CD with Maven and the Mule Maven Plugin',
  level: 'ADVANCED',
  tags: ['ci-cd', 'maven', 'mule-maven-plugin', 'cloudhub-2', 'devops'],
  estMinutes: 30,
  quiz: [
    {
      type: 'order',
      prompt: 'Order the pipeline stages for "build once, promote many".',
      items: [
        'PR build: `mvn clean verify` (compile + MUnit + coverage)',
        'On merge: set a release version and `mvn clean deploy` to publish the JAR to Exchange',
        'Deploy that version to dev, then qa, with per-environment parameters',
        'Manual approval, then deploy the same version to prod',
      ],
      explain: 'The artifact is published once; every environment deploys that exact version, so what was tested is what runs in prod.',
    },
    {
      type: 'match',
      prompt: 'Match each pipeline error to its cause.',
      pairs: [
        ['`Could not resolve ... mule-sap-connector` on CI only', 'Missing MuleSoft EE repository credentials in the CI settings.xml'],
        ['`401 Unauthorized` publishing to Exchange', 'No valid credentials for the Exchange repository server ID'],
        ['Prod re-run fails: version "already exists"', 'The stage tried to publish a release version that is already in Exchange'],
      ],
      explain: 'Enterprise connectors live in an authenticated repository; Exchange publishing needs credentials (e.g. a Connected App) and the right groupId; a re-run must deploy, not re-publish.',
    },
    {
      type: 'single',
      prompt: 'For CloudHub 2.0 publishing, what must the project `groupId` be?',
      options: [
        'The organization / business group ID',
        'The company reverse domain, e.g. `com.acme`',
        'The environment name',
        'Any value, as long as it is unique in Maven Central',
      ],
      answer: 0,
      explain: 'CloudHub 2.0 deploys from Exchange, and Exchange assets are owned by an organization — the `groupId` must equal the business group (org) ID.',
    },
    {
      type: 'single',
      prompt: 'How should the pipeline authenticate to Anypoint Platform?',
      options: [
        'A Connected App with client credentials and only deploy/Exchange scopes, secrets from the CI secret store',
        "A team lead's username and password in the pom.xml",
        'The environment client ID/secret used by autodiscovery',
        'An SSH key registered in Runtime Manager',
      ],
      answer: 0,
      explain: 'Connected Apps are not tied to a person (no leaver risk or MFA prompts), are scoped, and their secrets rotate independently.',
    },
    {
      type: 'multi',
      prompt: 'Which values should come from pipeline variables per environment rather than a rebuild?',
      options: [
        'Target environment and space',
        'Replicas and vCores',
        'Application properties such as `env`',
        'The secure-properties key (as a secure property)',
        'The MUnit test cases',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Everything environment-specific is a deploy-time parameter of the mule-maven-plugin; tests belong to the build, which happens once.',
    },
  ],
  description: `
Your team deploys ~30 Mule apps to **CloudHub 2.0** by exporting JARs from Anypoint Studio and uploading them in Runtime Manager. Management wants a pipeline (GitHub Actions or Jenkins) with:

- Build and **MUnit tests** on every pull request.
- **Build once**, then promote the *same* artifact **dev → qa → prod** with approvals.
- No personal credentials anywhere; secrets from the CI secret store.
- Per-environment settings: replicas, replica size, properties, the secure-properties key.

The first pipeline attempt fails with:
- \`Could not resolve dependencies ... com.mulesoft.connectors:mule-sap-connector\` on the CI runner (works on laptops).
- \`401 Unauthorized\` when publishing to Exchange.
- A re-run of the prod stage fails because the version "already exists".

**Questions**
1. What are the steps of the pipeline, and which Maven commands/plugin goals do you run in each?
2. Show the key parts of the \`mule-maven-plugin\` configuration for a CloudHub 2.0 deployment.
3. Explain each of the three errors and how to fix them.
4. How do you implement "build once, promote many" with CloudHub 2.0?
`,
  answerTemplate: `## Pipeline stages

## mule-maven-plugin configuration

## The three errors

## Build once, promote many
`,
  keyPoints: [
    'PR stage: mvn clean verify (compile + MUnit with coverage); main branch: publish the versioned artifact to Exchange; deploy stages: mvn deploy -DmuleDeploy (or equivalent) per environment.',
    'CloudHub 2.0 deploys from an artifact published to Exchange, so the groupId must be the business group (organization) ID and distributionManagement must point to the Exchange Maven repository.',
    'Authentication via a Connected App (client credentials) with deploy/Exchange scopes; credentials from the CI secret store, injected into settings.xml or as -D properties.',
    'Enterprise connectors resolve from the MuleSoft EE repository, which requires Nexus credentials in the CI settings.xml.',
    'Treat a published release version as fixed — promote an existing version instead of re-publishing; bump the version for new builds.',
    'Environment-specific values (target, replicas, vCores, properties, secure key) come from pipeline variables, not from rebuilding the JAR.',
  ],
  solution: `
**Pipeline stages**
1. **PR build:** \`mvn clean verify\` — compiles the app, runs MUnit, enforces coverage (munit-maven-plugin).
2. **Publish (merge to main / release tag):** set a release version (no \`-SNAPSHOT\`), \`mvn clean deploy\` (tests skipped only if they already ran) → publishes the app JAR to **Exchange**.
3. **Deploy dev → qa → prod:** the same version is deployed with \`mvn mule:deploy\` / \`mvn deploy -DmuleDeploy\` using per-environment parameters; manual approval gate before prod; smoke test after each deploy.

**Plugin configuration (CloudHub 2.0)**
\`\`\`xml
<plugin>
  <groupId>org.mule.tools.maven</groupId>
  <artifactId>mule-maven-plugin</artifactId>
  <version>$\{mule.maven.plugin.version}</version>
  <extensions>true</extensions>
  <configuration>
    <cloudhub2Deployment>
      <uri>https://anypoint.mulesoft.com</uri>
      <provider>MC</provider>
      <environment>$\{env.name}</environment>
      <target>$\{target.space}</target>              <!-- shared or private space -->
      <muleVersion>$\{app.runtime}</muleVersion>
      <applicationName>$\{app.name}-$\{env.short}</applicationName>
      <replicas>$\{replicas}</replicas>
      <vCores>$\{vcores}</vCores>
      <connectedAppClientId>$\{ca.client.id}</connectedAppClientId>
      <connectedAppClientSecret>$\{ca.client.secret}</connectedAppClientSecret>
      <connectedAppGrantType>client_credentials</connectedAppGrantType>
      <properties><env>$\{env.short}</env></properties>
      <secureProperties><secure.key>$\{secure.key}</secure.key></secureProperties>
    </cloudhub2Deployment>
  </configuration>
</plugin>
\`\`\`
(Element names vary slightly by plugin version — check the docs for the version you use.)

**Errors**
- **SAP connector not resolved:** it is an **Enterprise** connector hosted in the MuleSoft EE Maven repository, which needs credentials. Laptops have them in \`~/.m2/settings.xml\`; the CI runner doesn't. Add the repository credentials (from the secret store) to the CI \`settings.xml\`.
- **401 publishing to Exchange:** the \`distributionManagement\` server ID needs credentials in \`settings.xml\` — e.g. the Connected App (\`~~~Client~~~\` username format) with Exchange contributor scope — and the \`groupId\` must equal the **organization/business group ID**.
- **Version already exists:** the stage tried to publish a release version that is already in Exchange. A prod re-run must **deploy** the existing version, not publish again. Separate "publish" from "deploy" and make deploy stages idempotent.

**Build once, promote many:** publish \`order-papi:1.4.0\` once. Each environment stage deploys **that** version from Exchange with its own parameters (environment, replicas, properties, secure key). The JAR never changes between qa and prod, so what was tested is what runs. Tag the Git commit with the version for traceability.
`,
  followUps: [
    {
      q: 'Why a Connected App instead of a username/password?',
      a: 'Connected Apps are not tied to a person (no leaver risk, no MFA prompts), can be limited to specific scopes and environments, and their secrets can be rotated independently.',
    },
    {
      q: 'How do you roll back a bad production deployment?',
      a: 'Redeploy the previous Exchange version through the same pipeline job; CloudHub 2.0 rolling updates keep the old replicas serving until the new ones are healthy, which limits downtime.',
    },
    {
      q: 'Where do API Manager policies fit in the pipeline?',
      a: 'Policies are applied to the API instance via the API Manager API or tools (e.g. Anypoint CLI) as part of environment setup, and the app only needs the right api.id; keep that configuration as code too.',
    },
  ],
}
