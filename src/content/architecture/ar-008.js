export default {
  id: 'ar-008',
  category: 'architecture',
  title: 'Secrets and Configuration per Environment',
  level: 'BEGINNER',
  tags: ['secure-properties', 'configuration', 'environments', 'secrets'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you make the same JAR run in dev, test and prod?',
      options: [
        'Rebuild the app per environment with the right config.yaml',
        'Keep a Git branch per environment',
        'Use config-common.yaml plus config-$\{env}.yaml, with env supplied as a property at deployment',
        'Let developers edit hostnames before each deployment',
      ],
      answer: 2,
      explain: 'One artifact is promoted unchanged; only the properties supplied at deploy time differ. Rebuilding or branching per environment means prod runs something that was never tested.',
    },
    {
      type: 'single',
      prompt: 'The Salesforce client secret was committed in plain text. You now encrypt it with Secure Properties. What else is required?',
      options: [
        'Nothing — the encrypted value replaces it',
        'Delete the old file from the repository',
        'Rotate the secret, because Git history still contains the plain-text value',
        'Rename the property',
      ],
      answer: 2,
      explain: 'Deleting or encrypting a file does not remove it from Git history. Any secret that was ever committed in plain text must be treated as exposed and rotated.',
    },
    {
      type: 'single',
      prompt: 'Where should the secure-properties decryption key live?',
      options: [
        'In config.yaml next to the encrypted values',
        'In the team wiki so everyone can deploy',
        'Supplied at deployment from the pipeline\'s secret store, and declared under secureProperties in mule-artifact.json so Runtime Manager masks it',
        'Hard-coded in a Java class',
      ],
      answer: 2,
      explain: 'A key next to the ciphertext protects nothing. Passing it at deploy time from the pipeline and masking it in Runtime Manager keeps it out of the repo and out of view.',
    },
    {
      type: 'multi',
      prompt: 'Which practices belong in the key-management design?',
      options: [
        'A different encryption key per environment',
        'Prod key usable only by the CI/CD pipeline and a small ops group',
        'A secret scan in pre-commit/CI so plain-text secrets cannot come back',
        'One shared key for all environments to keep things simple',
      ],
      answer: [0, 1, 2],
      explain: 'Separate keys limit the blast radius: knowing the dev key must not unlock prod. Secret scanning stops the original problem from recurring.',
    },
    {
      type: 'single',
      prompt: 'What is Anypoint Secrets Manager mainly for?',
      options: [
        'Replacing application secure properties for all apps',
        'TLS material (certificates, keystores, truststores) used by gateways and Private Spaces',
        'Storing MUnit test data',
        'Encrypting payloads at runtime',
      ],
      answer: 1,
      explain: 'Secrets Manager stores TLS artefacts for platform components; it is not a general vault for application secrets. An external vault (HashiCorp, AWS, Azure) is the next step for those.',
    },
    {
      type: 'order',
      prompt: 'Order the work so the audit findings are closed first.',
      items: [
        'Rotate every credential that was exposed in plain text',
        'Split config per environment and encrypt secrets with Secure Properties',
        'Move the decryption keys into the pipeline secret store and remove the wiki page',
        'Add secret scanning to CI',
        'Later: evaluate an external vault for rotation and audit',
      ],
      explain: 'Exposed credentials are a live risk, so rotate them first. The vault is a valuable improvement but adds a runtime dependency and setup work, so it comes after the urgent fixes.',
    },
  ],
  description: `
You join a team with 25 Mule 4 apps on CloudHub 2.0. During code review you find:

- Database passwords and the Salesforce client secret **in plain text** in \`config.yaml\` inside the Git repository.
- A single \`config.yaml\` used for dev, test and prod; developers edit hostnames before each deployment.
- The same **encryption key** for secure properties is typed into every deployment by hand and is also in a team wiki page.
- A security audit is in 6 weeks.

**Questions:**
- How do you structure configuration so the *same* deployable artifact runs in every environment?
- How do you protect secrets in the repo and at runtime?
- Where should the decryption key live, and who can see it?
- What would you do in the first two weeks versus later?
`,
  answerTemplate: `## Configuration structure

## Protecting secrets

## Key management and access

## Rollout plan
`,
  keyPoints: [
    'One artifact for all environments: environment-specific property files (e.g. dev.yaml, test.yaml, prod.yaml) selected by a runtime property such as env.',
    'Secrets are encrypted with the Secure Properties Config module and referenced with the secure:: prefix; plain-text secrets are removed from the repo and rotated because Git history keeps them.',
    'The decryption key is never in source control; it is supplied at deployment as a protected/hidden property (listed under secureProperties in mule-artifact.json so it is masked in Runtime Manager).',
    'A different encryption key and different credentials per environment, with production keys accessible only to the deployment pipeline and a small ops group.',
    'An external secrets vault (e.g. HashiCorp Vault, AWS Secrets Manager, Azure Key Vault) is a valid next step for rotation and audit, accessed by the pipeline or the app.',
  ],
  solution: `
**Configuration structure.**
- \`config-common.yaml\` (non-secret values identical everywhere: timeouts, paths) plus \`config-$\{env}.yaml\` per environment for hostnames, ports, queue names.
- \`<configuration-properties file="config-$\{env}.yaml"/>\`, where \`env\` is set as a property at deployment (Runtime Manager / Mule Maven plugin). The **same JAR** is promoted dev → test → prod; only properties differ. Rebuilding per environment is what makes "it worked in test" meaningless.

**Protecting secrets.**
- Encrypt values with the **Secure Properties Config** module (e.g. AES, CBC mode) into \`secure-$\{env}.yaml\`; reference them as \`$\{secure::db.password}\`.
- **Rotate** every secret that was in plain text — deleting the file does not remove it from Git history.
- Add a pre-commit / CI secret scan so plain-text secrets cannot come back.

**Key management.**
- The secure-properties key is passed at deployment as a property (e.g. \`mule.key\`) and declared in \`mule-artifact.json\` under \`secureProperties\` so Runtime Manager masks it.
- **Different key per environment.** Developers know the dev key; only the CI/CD pipeline (stored as a pipeline secret) and a small ops group can use the prod key.
- Remove the wiki page; keys live in the pipeline's secret store.

**Rollout.**
- *Weeks 1–2:* rotate exposed credentials, split config per environment, encrypt secrets, move keys into the pipeline, add secret scanning. This closes the audit findings.
- *Later:* consider an **external vault** with short-lived or regularly rotated credentials and access audit. Trade-off: better rotation and central audit, but a new runtime dependency (if the app reads the vault at startup, the vault must be highly available) and more setup work.

**Note:** Anypoint *Secrets Manager* is mainly for TLS material (certificates, keystores, truststores) used by gateways/Private Spaces — it is not a general replacement for application secure properties.
`,
  followUps: [
    { q: 'Why not just keep a separate Git branch per environment with its own config?', a: 'Branch-per-environment leads to drift and different code in each environment. Configuration should be data supplied at deploy time, while one tagged version of the code is promoted.' },
    { q: 'How do you rotate a database password without downtime?', a: 'Use a dual-credential window: create the new credential while the old one still works, redeploy (rolling update) with the new encrypted value, then revoke the old one. A vault with dynamic secrets automates the same idea.' },
    { q: 'Is encrypting properties enough if a developer can log the decrypted value?', a: 'No. Encryption protects data at rest in the repo; you also need code review/logging standards (never log credentials, mask sensitive fields) and restricted access to production logs.' },
  ],
}
