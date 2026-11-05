export default {
  id: 'ms-016',
  category: 'mulesoft',
  title: 'Property Placeholders, Precedence and Secure Properties',
  level: 'INTERMEDIATE',
  tags: ['properties', 'secure-properties', 'configuration', 'deployment'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you make one JAR load the right property file in dev, qa and prod?',
      options: [
        '`<configuration-properties file="config/config-${env}.yaml"/>` with `env` supplied at deployment',
        'Swap `prod-config.yaml` into the XML before the production build',
        'Build a separate JAR per environment with Maven profiles',
        'Put all three environments in one YAML file and pick with a Choice router',
      ],
      answer: 0,
      explain: 'A placeholder in the file name plus a deployment property selects the file at runtime — no rebuild, no XML edits.',
    },
    {
      type: 'order',
      prompt: 'Order these property sources from **highest** to **lowest** precedence.',
      items: [
        'Deployment / system properties (Runtime Manager Properties tab, `-D`)',
        'Environment variables',
        'Configuration properties files (including secure ones)',
        'Global properties',
      ],
      explain: 'A `db.host` set in Runtime Manager therefore **does** override the YAML. If it seems not to, check the exact name and that the app was restarted.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'How is the encrypted DB password referenced in the connector config?',
      options: ['`${secure::db.password}`', '`${db.password}`', '`#[secure(db.password)]`', '`![db.password]`'],
      answer: 0,
      explain: 'The `secure::` prefix tells Mule to read the value from the secure properties config and decrypt it. `![...]` is how the **encrypted value** looks inside the file.',
    },
    {
      type: 'single',
      prompt: 'Where should the Secure Properties decryption key come from?',
      options: [
        'Supplied at deployment per environment (e.g. `-Dsecure.key` or a protected property), stored in a vault or pipeline secret',
        'Hardcoded in the `secure-properties:config` element',
        'Stored in `config-prod.yaml` next to the encrypted values',
        'Committed to Git in an encrypted ZIP',
      ],
      answer: 0,
      explain: 'The key must never be in the project. Different keys per environment limit the blast radius if one leaks.',
    },
    {
      type: 'single',
      prompt: 'A developer finds a plain-text database password committed to Git in a Mule project. What must happen to that password?',
      options: [
        'Delete the file in a new commit, which removes it from history',
        'Encrypt it in the file, which makes the old value safe',
        'Rotate it, because it remains in Git history',
        'Hide it in Runtime Manager, which also covers the Git copy',
      ],
      answer: 2,
      explain: 'Deleting the file in a new commit does not remove it from history, so the password must be rotated. The new value is then encrypted with the Secure Properties Tool and moved to the secure file. Also mask sensitive values in Runtime Manager: `secureProperties` in `mule-artifact.json` on CloudHub 1.0, property protection on the Properties tab on CloudHub 2.0.',
    },
  ],
  description: `
A **Payroll System API** must run in **dev**, **qa** and **prod** from the **same JAR**. The current project has:

- \`config.yaml\` with dev values hardcoded, and a \`prod-config.yaml\` that developers swap in by editing the XML before a production build.
- The database password and an API key in plain text in \`config.yaml\`, committed to Git.
- A colleague set \`db.host\` in Runtime Manager's *Properties* tab, but the app still connects to the value in the YAML — or does it? Nobody is sure which value wins.

**Questions**
1. How do you structure property files so one JAR works in every environment? Show the configuration.
2. What is the precedence order between deployment properties, system properties, environment variables and properties files?
3. How do you protect the password and API key with the Secure Properties module? Where does the encryption key come from?
4. How do you stop secret values from being visible in Runtime Manager?
`,
  answerTemplate: `## One JAR, many environments

## Precedence

## Secure properties

## Hiding values in Runtime Manager
`,
  keyPoints: [
    'One file per environment (e.g. config-dev.yaml, config-prod.yaml) loaded via a placeholder like config-$\{env}.yaml, with env supplied at deployment.',
    'Deployment/system properties override environment variables and values from configuration-properties files, so Runtime Manager properties win over the YAML.',
    'Secure Properties: values encrypted as ![...] in a secure file, loaded by secure-properties:config, referenced as $\{secure::name}.',
    'The decryption key is never in the project — it is passed at deployment (e.g. -Dsecure.key or a protected deployment property) per environment.',
    'On CloudHub 1.0, property names listed under secureProperties in mule-artifact.json are hidden in Runtime Manager; on CloudHub 2.0 that setting has no effect, so use Protect on the Properties tab.',
  ],
  solution: `
**One JAR, many environments**
\`\`\`xml
<global-property name="env" value="dev"/>  <!-- local default only -->

<configuration-properties file="config/config-$\{env}.yaml"/>
<secure-properties:config name="secureProps"
    file="config/secure-$\{env}.yaml" key="$\{secure.key}">
  <secure-properties:encrypt algorithm="AES" mode="CBC"/>
</secure-properties:config>

<db:config name="payrollDb">
  <db:generic-connection url="jdbc:postgresql://$\{db.host}:$\{db.port}/payroll"
      user="$\{db.user}" password="$\{secure::db.password}"
      driverClassName="org.postgresql.Driver"/>
</db:config>
\`\`\`
At deployment set \`env=prod\` (and \`secure.key\`) — no rebuild, no XML edits. Keep common values in a shared \`config-common.yaml\` if useful.

**Precedence** (highest first): **deployment properties / system properties** (Runtime Manager *Properties*, \`-D\` on the runtime) → **environment variables** → **configuration properties files** (including secure ones) → **global properties**. So a \`db.host\` set in Runtime Manager **does override** the YAML. If it appears not to, check the name exactly matches (YAML nesting \`db: host:\` = \`db.host\`) and that the app was restarted/redeployed after the change.

**Secure properties**
1. Encrypt each secret with the Secure Properties Tool (same algorithm/mode as the config), producing values like \`password: "![k1Jx9...]"\` in \`secure-prod.yaml\`.
2. Reference as \`$\{secure::db.password}\` — the \`secure::\` prefix tells Mule to read from the secure config and decrypt.
3. The **key** is supplied at runtime (\`-Dsecure.key=...\` or a protected deployment property), different per environment, and stored in a vault / pipeline secret — never in Git.
4. Rotate the leaked plain-text password: it is in Git history.

**Hiding in Runtime Manager:** it depends on the target. On CloudHub 1.0, list the property names in \`mule-artifact.json\`:
\`\`\`json
{ "secureProperties": ["secure.key", "anypoint.platform.client_secret"] }
\`\`\`
Their values are then hidden in Runtime Manager. On **CloudHub 2.0** that setting does not mask anything: set the property on the *Properties* tab and click **Protect**, after which the value cannot be viewed, only replaced. On hybrid deployments the docs warn that values set this way remain visible after a redeployment.
`,
  followUps: [
    {
      q: 'Can you use $\{secure::...} with a value set in Runtime Manager instead of a file?',
      a: 'The secure:: prefix reads from the secure properties file and decrypts it. A value set directly as a deployment property is used as a plain placeholder ($\{name}) and should be protected/hidden instead.',
    },
    {
      q: 'Why not just use environment variables for everything?',
      a: 'You can for some values, but files keep non-secret configuration versioned and reviewable with the code, while only secrets and the environment selector come from the platform at deploy time.',
    },
    {
      q: 'How would you use a real vault such as Azure Key Vault or HashiCorp Vault?',
      a: 'Either the pipeline reads the secret from the vault and passes it as a protected deployment property, or a vault properties provider module resolves placeholders at startup; the app never stores the secret itself.',
    },
  ],
}
