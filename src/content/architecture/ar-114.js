export default {
  id: 'ar-114',
  category: 'architecture',
  title: 'Hardening a Mule Delivery Pipeline After an Audit: Identities, Secrets by Target, Signed Artifacts and Governance Gates',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'security', 'secrets', 'governance', 'connected-apps', 'github-actions', 'azure-devops'],
  estMinutes: 40,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which design rules reduce the damage if a pipeline identity leaks?',
      options: [
        'Separate Connected Apps for publishing to Exchange, deploying to non-production, and deploying to Production',
        'Keep the Production credentials in the Production environment of the CI tool, behind an approval',
        'Grant each identity only the scopes and environments it needs',
        'Rotate secrets on a schedule, and rehearse the rotation',
        'One Connected App with Organization Administrator for all pipelines, so that permissions are never a problem',
      ],
      answer: [0, 1, 2, 3],
      explain: 'A single powerful identity turns any pull request job that can read it into a route to Production. The Runtime Manager Continuous Deployment page also advises a dedicated account for deployment and CI.',
    },
    {
      type: 'match',
      prompt: 'Match each deployment target to what protects a property value there.',
      pairs: [
        ['CloudHub 2.0', 'Property protection on the Properties tab in Runtime Manager, or `secureProperties` in the plugin'],
        ['CloudHub 1.0', 'Safely hidden application properties in Runtime Manager'],
        ['Hybrid server', 'Encrypted secure configuration properties, or an external properties provider, because hidden values remain visible'],
      ],
      explain: 'The note on the hidden properties page says that for hybrid deployments, the values remain visible, even after the redeployment. On CloudHub 2.0, `secureProperties` in `mule-artifact.json` does not mask values.',
    },
    {
      type: 'single',
      prompt: 'The team uses the Secure Configuration Properties module. Where does the decryption key belong?',
      options: [
        'It is passed to the runtime at deployment time, as a property such as `runtime.property`, and it is never in the repository',
        'In `secure.yaml`, next to the encrypted values',
        'In the `pom.xml`, under `properties`',
        'In `mule-artifact.json`',
      ],
      answer: 0,
      explain: 'Encrypted `![value]` entries can sit in Git only because the key is somewhere else. In the docs example, `key` is `$\{runtime.property}`, and the value is passed in at deployment time.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about credentials in Maven are correct?',
      options: [
        '`settings.xml` is not distributed with a project, because it can contain confidential information',
        'Encrypted passwords need a master password in `settings-security.xml`',
        'If `username` and `password` are set in the deployment configuration, they overwrite the server ID',
        '`connectedAppGrantType` takes `client_credentials`',
        'Passing secrets as `-D` flags is safest, because Maven masks them in all logs',
      ],
      answer: [0, 1, 2, 3],
      explain: 'A value on a command line can appear in process listings and build logs. CI tools mask known secrets on a best-effort basis, so prefer environment variables that a generated `settings.xml` reads.',
    },
    {
      type: 'single',
      prompt: 'For hybrid servers, the security team wants the runtime itself to refuse artifacts that the pipeline did not produce. What does the Runtime Manager agent offer?',
      options: [
        'The JAR signature validator of the application validator service: each signed entry in the artifact must match one of the keystore aliases',
        'The `armInsecure` setting',
        'Gatekeeper',
        'Exchange asset lifecycle states',
      ],
      answer: 0,
      explain: 'It prevents the deployment of non-authorized artifacts, and it is configured in `mule-agent.yml`. The docs note that artifacts signed with expired certificates are allowed, so rotation of the certificate needs its own process.',
    },
    {
      type: 'multi',
      prompt: 'Which pull request protections are sound?',
      options: [
        'Jobs triggered from a fork get no secrets, and do not deploy',
        'Pipeline definitions and shared templates need a review from the platform team',
        'Third-party CI actions or extensions are pinned to a full commit or version',
        'Production deployment runs only from a protected branch or tag',
        'Any developer can edit the workflow file of a repository to reach Production secrets, as long as a test passes',
      ],
      answer: [0, 1, 2, 3],
      explain: 'If a pull request can change the pipeline definition, and that definition can read secrets, then the review of the code protects nothing.',
    },
    {
      type: 'order',
      prompt: 'Order the gates in a hardened path from a change to Production.',
      items: [
        'Secret scan and spec validation on the pull request',
        'Build, MUnit and the coverage gate, with no deployment credentials in the job',
        'Dependency check, and a check against the approved plugin versions',
        'Publish the release version once, with the publishing identity',
        'Deploy to Test with a non-production identity',
        'Human approval on the Production environment',
        'Deploy with the Production identity, and record the release',
      ],
      explain: 'Cheap, credential-free checks come first. Each later stage gets the smallest identity that it needs.',
    },
  ],
  description: `
A payments company runs 35 Mule apps: 25 on **CloudHub 2.0** and 10 on **hybrid** servers inside its PCI zone. An external audit of the delivery path reports these findings:

1. A personal Anypoint username and password are in the POM of four apps, and one password is in Git history.
2. One Connected App, with wide permissions, serves all pipelines, including jobs that run on pull requests.
3. \`settings.xml\` with real values is stored in a shared repository.
4. Hybrid apps have database passwords as hidden properties, and an auditor could read them in Runtime Manager.
5. Three apps use \`armInsecure\`, "to get past a certificate error".
6. Anyone with console access can deploy any JAR to a hybrid server.
7. API specs and pipeline definitions change with no required review.
8. The plugin versions in use include a deprecated one, and nobody tracks connector vulnerabilities.

The audit gives the team 90 days. The company uses GitHub Actions, and a sister company uses Azure DevOps with the same requirements.

**Questions**
1. Design the identities for the pipeline.
2. Design secrets handling, for each deployment target.
3. How do you handle findings 1 and 3 right now?
4. How do you make sure that only pipeline-built artifacts run on hybrid servers?
5. Which gates belong in the path, and in what order?
6. What is specific to GitHub Actions and to Azure DevOps?
`,
  answerTemplate: `## Identities

## Secrets by target

## Immediate clean-up

## Trusted artifacts

## Gates

## GitHub Actions and Azure DevOps
`,
  keyPoints: [
    'No personal credentials. One narrow Connected App for each purpose and environment level.',
    'A secret in Git history is compromised, so rotate it. Deleting the line is not enough.',
    'Hidden properties protect values on CloudHub 1.0, but for hybrid deployments the values remain visible.',
    'CloudHub 2.0 protects values on the Properties tab, and secureProperties in the plugin encrypts them. mule-artifact.json does not mask values there.',
    'Secure configuration properties keep encrypted values in the app, and the key arrives at deployment.',
    'External properties providers can fetch secrets at run time, for example from Azure Key Vault or AWS Secrets Manager.',
    'The JAR signature validator stops unauthorized artifacts on hybrid servers.',
    'Remove armInsecure, and fix the truststore. Credential-free checks come first in the path.',
  ],
  solution: `
**Identities.**

| Identity | Can do | Runs in |
|---|---|---|
| \`ci-exchange-read\` | Read Exchange assets | Build jobs |
| \`ci-exchange-publish\` | Publish to Exchange | Release job on protected branches |
| \`ci-deploy-nonprod\` | Deploy to Dev and Test | Test environment of the CI tool |
| \`ci-deploy-prod\` | Deploy to Production | Production environment, after approval |

They are Connected Apps acting on their own behalf, with \`connectedAppGrantType\` set to \`client_credentials\`. The plugin pages say the credentials must have the \`Design Center Developer\` access scope. The CLI page says deployment needs the right CloudHub and Runtime Manager permissions, so confirm the minimum set in a sandbox. Pull request jobs get none of these, except read access if they need to resolve dependencies.

**Secrets by target.**
- **Pipeline secrets** (Connected App secrets, Nexus credentials) live in the CI secret store, and reach \`settings.xml\` as environment variables at run time. A generated file with placeholders replaces the shared one.
- **CloudHub 2.0:** send secrets through \`secureProperties\`, which tells the platform to encrypt the values before storing them, or use property protection on the **Properties** tab. Protected values cannot be viewed or retrieved by any user. \`secureProperties\` in \`mule-artifact.json\` does not mask values on this target. Remember that a deployment with \`properties\` or \`secureProperties\` replaces what was there, so the pipeline must send the full set.
- **Hybrid:** this is finding 4. The hidden properties page says that for hybrid deployments, the values remain visible, even after the redeployment. So use one of these instead:
  - Secure Configuration Properties, with values encrypted as \`![value]\` in a file, and \`key="$\{runtime.property}"\` supplied at deployment. The key must not be in the repository.
  - A properties provider, such as Azure Key Vault Properties Provider, AWS Secrets Manager or HashiCorp Vault, so that the secret never enters the artifact or Runtime Manager.
  - For a key set at the server, \`wrapper.conf\` works, but restrict access to it, and treat it as a secret.
- **In all cases:** runtime secrets and pipeline secrets have different owners. A leak in one should not expose the other.

**Immediate clean-up.** For findings 1 and 3, in this order:
1. Rotate every exposed credential first. Anything in Git history must be treated as known, and rewriting history is a tidy-up, not a fix.
2. Replace the personal account in the POMs with a Connected App. If \`server\` is used, remove \`username\` and \`password\`, because they would overwrite it.
3. Replace the shared \`settings.xml\`. Keep a template in Git, with placeholders only.
4. Add a secret scanner to pull requests, so that it does not happen again.

Finding 5: remove \`armInsecure\`. The docs describe it for a Private Cloud Edition installation whose certificates are not in the truststore, and warn that it is a dangerous practice. Put the right certificate in the truststore.

Finding 8: raise the plugin to a supported version, and do not use the versions the docs mark as deprecated: 3.0.0, 3.1.0 to 3.1.7, 3.8.3 and the 4.10.2 release. Recent plugin releases are mostly vulnerability fixes, so keep a regular upgrade rhythm through the parent POM.

**Trusted artifacts.**
- Sign the JAR in the release job, with a key that only that job can use.
- On hybrid servers, enable the JAR signature validator in \`$MULE_HOME/conf/mule-agent.yml\`, under the application validator service. Each signed entry in the artifact must match one of the keystore aliases, which prevents the deployment of non-authorized artifacts. Note that artifacts signed with expired certificates are allowed, so a compromised key needs active removal, not just expiry. Test this with your real JAR, with an unsigned JAR, because the page speaks only of signed entries, and with your deployment route.
- Remove console deploy rights in Production from people, and keep them for a break-glass account with an audit trail. A server managed by Runtime Manager must be deployed to through Runtime Manager, so also restrict file system access to \`apps\`.
- For CloudHub 2.0, the artifact comes from Exchange. So control who can publish, and keep the checksum in the release record.

**Gates.** Follow the order in the exercise. Use \`governance:api:validate\` for specs. With local rulesets it runs locally and suits a job with no credentials, but with \`--remote-rulesets\` or \`exchange.json\` dependencies it must reach Exchange. The reference does not document exit codes, so prove with a bad spec that the step fails the job, or have the step search the output for \`Conforms: false\`. Use MUnit with its coverage gate, and a dependency check on the output of \`mvn dependency:tree\`. Fail the build if the Mule Maven plugin is not the approved version. Protect the pipeline definition itself: CODEOWNERS or a branch policy on workflow files and shared templates answers finding 7.

**GitHub Actions and Azure DevOps.**
- GitHub Actions: environment secrets with required reviewers, branch and tag rules that limit which refs can deploy, pinned third-party actions, and minimal \`GITHUB_TOKEN\` permissions. Secrets are not passed to workflows triggered from forks, and \`pull_request_target\` needs care, because it runs with secrets.
- Azure DevOps: approvals and checks on Environments, variable groups linked to Azure Key Vault, secure files for the settings template, and a branch control check. The result is that only protected branches can use the Production service connection. Secrets are not made available to builds of pull requests from forks unless you enable that.
- In both: masking is a safety net, not a control. Never print the effective settings without redaction.
`,
  followUps: [
    { q: 'Should Mule apps read secrets from the pipeline at all?', a: 'They do not have to. With a properties provider, the app fetches them at run time, and the pipeline only sends the reference. This keeps rotation away from deployments, at the cost of a run-time dependency on the vault.' },
    { q: 'What about the decryption key in the pipeline?', a: 'It is a secret like the others, and it is usually different for each environment. It goes to the runtime as a secure deployment property, or a server-level setting that operators control.' },
    { q: 'Why are Terraform and platform configuration part of this?', a: 'The MuleSoft Terraform provider can manage platform resources such as access management and CloudHub 2.0 resources as code. Then a change to an identity or a private space goes through the same review as an app.' },
    { q: 'How do you show the auditor that a release was controlled?', a: 'Keep one record for each release: commit, tag, artifact checksum, test and coverage results, approver, identity used and time. These all come out of the pipeline, so nobody has to assemble them by hand.' },
    { q: 'Does governance replace these gates?', a: 'No. API Governance reports conformance, and the pipeline gate is what stops a change. Use the same rulesets in both.' },
  ],
}
