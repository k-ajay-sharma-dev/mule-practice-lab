export default {
  id: 'ms-027',
  category: 'mulesoft',
  title: 'Anatomy of a Mule 4 Project: pom.xml, mule-artifact.json and Resources',
  level: 'BEGINNER',
  tags: ['project-structure', 'maven', 'mule-artifact', 'packaging'],
  estMinutes: 10,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each item to the folder it belongs in.',
      pairs: [
        ['Flow XML files', '`src/main/mule`'],
        ['`log4j2.xml`, YAML properties, `.dwl` modules', '`src/main/resources`'],
        ['MUnit test suites', '`src/test/munit`'],
        ['Test data files', '`src/test/resources`'],
      ],
      explain: '`src/main/*` ends up in the deployable jar; the test folders do not.',
    },
    {
      type: 'single',
      prompt: 'CI fails with "Cannot load driver class: oracle.jdbc.OracleDriver" while the laptop works. What is the proper fix?',
      options: [
        'Add the driver as a Maven dependency and as a shared library',
        'Add the driver as a Maven dependency in `provided` scope, as the runtime has it',
        'Put the driver jar in `src/main/resources` so it is on the classpath',
        'Add the driver jar to `src/main/java` next to the custom classes',
      ],
      answer: 0,
      explain: "CI only knows the POM. The shared-library declaration in the mule-maven-plugin lets the Database connector's class loader see the driver. The runtime does not ship the Oracle driver, so a `provided` dependency leaves it out of the app jar. A jar in resources or java folders is not on the connector's class path.",
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A developer starts a new API project from the POM of the team\'s domain project. It builds, but the jar cannot be deployed as an app. The POM says `<packaging>mule-domain</packaging>`. What should it say?',
      options: [
        '`mule-plugin`, since the runtime loads every app as a plugin',
        '`mule-extension`, the packaging the Mule SDK uses for apps',
        '`mule-application`, the packaging of a deployable app',
        '`jar`, and the mule-maven-plugin adds the Mule type itself',
      ],
      answer: 2,
      explain: 'Apps use `mule-application`; domains use `mule-domain`. `mule-extension` is the packaging of a connector or module built with the Mule SDK, and such connectors are used as dependencies with the `mule-plugin` classifier. A plain `jar` packaging does not produce a Mule app.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'An app needs Mule 4.6 or later, supports only Java 17, must have `db.password` masked in Runtime Manager on CloudHub 1.0, and runs 2 replicas in prod. Which three entries belong in `mule-artifact.json`?',
      options: [
        '`minMuleVersion` set to `4.6.0`',
        '`replicas` set to `2` for the prod environment',
        '`javaSpecificationVersions` listing `17`',
        '`db.password` with its encrypted `![...]` value',
        '`secureProperties` listing `db.password`',
      ],
      answer: [0, 2, 4],
      explain: 'It is the artifact descriptor read by the runtime and tooling: minimum Mule version, supported Java versions and the names of secure properties. Replicas are a deployment setting (Runtime Manager or mule-maven-plugin), not part of the artifact. Property values, encrypted or not, go in the properties files or the deployment, never in the descriptor.',
    },
    {
      type: 'single',
      detail: true,
      prompt: '`db.password` shows in clear text in Runtime Manager Properties for an app on CloudHub 1.0. What masks it there?',
      options: [
        'Listing `db.password` under `secureProperties` in `mule-artifact.json`',
        'Renaming the property to `db.secret` so the platform hides it',
        'Marking it `protected: true` in the YAML configuration file',
        'Setting `log4j2` to WARN so the value is not printed',
      ],
      answer: 0,
      explain: 'On CloudHub 1.0 listed properties are masked in Runtime Manager. On CloudHub 2.0 this setting has no effect: use Protect on the Properties tab. The value itself should still be encrypted with Secure Properties or supplied as a protected property.',
    },
  ],
  description: `
You join a team and open \`orders-sapi\` in Anypoint Studio. The project tree looks like this:

\`\`\`text
orders-sapi/
├── pom.xml
├── mule-artifact.json
├── src/main/mule/            orders-sapi.xml, global.xml, impl/*.xml
├── src/main/resources/       config-dev.yaml, log4j2.xml, api/, dwl/
├── src/main/java/            (empty)
├── src/test/munit/           orders-test-suite.xml
└── src/test/resources/
\`\`\`

There are two problems:
- A colleague's laptop build works, but the CI build fails with "Cannot load driver class: oracle.jdbc.OracleDriver". The Oracle JDBC jar was added to Studio's build path by hand on the colleague's machine.
- After deployment to CloudHub 1.0, the Runtime Manager **Properties** tab shows \`db.password\` in clear text.

**Questions**
1. What belongs in each folder, and what ends up in the deployable jar?
2. What does \`pom.xml\` declare for a Mule application (packaging, plugins, dependencies)?
3. What is \`mule-artifact.json\` for? Name a few of its fields.
4. Fix the JDBC driver problem properly.
5. How do you stop \`db.password\` from being visible in Runtime Manager?
`,
  answerTemplate: `## Folder layout

## pom.xml

## mule-artifact.json

## JDBC driver fix

## Hiding the password
`,
  keyPoints: [
    'src/main/mule holds the flow XML; src/main/resources holds properties, log4j2.xml, specs, DWL and other classpath resources; src/test/munit holds MUnit suites.',
    'pom.xml uses packaging mule-application, the mule-maven-plugin, and lists connectors/modules as dependencies with classifier mule-plugin.',
    'mule-artifact.json is the artifact descriptor: minMuleVersion, supported Java versions, secureProperties and similar runtime metadata.',
    'A JDBC driver must be a Maven dependency and also declared as a shared library in the mule-maven-plugin so the DB connector can load it.',
    'On CloudHub 1.0, listing a property under secureProperties in mule-artifact.json makes Runtime Manager mask its value; on CloudHub 2.0 use Protect on the Properties tab instead.',
  ],
  solution: `
**Folder layout**
| Folder | Contents | In the jar? |
|---|---|---|
| \`src/main/mule\` | Flow / config XML files | Yes |
| \`src/main/resources\` | Properties (YAML/.properties), \`log4j2.xml\`, API spec, \`.dwl\` scripts/modules, schemas, keystores | Yes (classpath root) |
| \`src/main/java\` | Custom Java classes (Java module, Spring) | Yes, compiled |
| \`src/test/munit\` | MUnit test suites | No |
| \`src/test/resources\` | Test data, test-only properties | No |

\`mvn package\` produces \`target/orders-sapi-1.0.0-mule-application.jar\`: the deployable artifact.

**pom.xml**
- \`<packaging>mule-application</packaging>\`
- \`mule-maven-plugin\` (packaging and deployment config) and \`munit-maven-plugin\` (tests, coverage)
- Dependencies: connectors/modules with \`<classifier>mule-plugin</classifier>\`, API spec assets from Exchange, plain jars such as JDBC drivers
- Repositories: Anypoint Exchange and MuleSoft releases, usually with credentials from \`settings.xml\`

**mule-artifact.json**: descriptor read by the runtime/tooling. Typical fields: \`minMuleVersion\`, \`javaSpecificationVersions\`, \`secureProperties\`, \`classLoaderModelLoaderDescriptor\` (how dependencies are resolved), and optionally \`configs\` (which XML files to load). Studio maintains most of it.

**JDBC driver fix:** never rely on Studio's build path: CI only knows the POM. Add the driver as a Maven dependency **and** declare it as a shared library so the Database connector's class loader can see it:
\`\`\`xml
<plugin>
  <groupId>org.mule.tools.maven</groupId>
  <artifactId>mule-maven-plugin</artifactId>
  <configuration>
    <sharedLibraries>
      <sharedLibrary>
        <groupId>com.oracle.database.jdbc</groupId>
        <artifactId>ojdbc8</artifactId>
      </sharedLibrary>
    </sharedLibraries>
  </configuration>
</plugin>
\`\`\`
Studio's "Add driver" in the DB config does the same thing when you let it edit the POM.

**Hiding the password**
\`\`\`json
{ "minMuleVersion": "4.6.0", "secureProperties": ["db.password", "anypoint.platform.client_secret"] }
\`\`\`
On CloudHub 1.0, properties listed in \`secureProperties\` are masked in Runtime Manager. On CloudHub 2.0 this setting does not mask anything; use **Protect** on the *Properties* tab. Separately, the value itself should be encrypted in a secure properties file (Secure Configuration Properties module) or supplied as a protected property at deployment: never committed in clear text.
`,
  followUps: [
    {
      q: 'Where should a log4j2.xml go, and what happens if it is missing?',
      a: 'In src/main/resources. If it is missing, the runtime falls back to a default logging configuration, so you lose control over appenders, patterns and levels.',
    },
    {
      q: 'What is the difference between a mule-application and a mule-domain packaging?',
      a: 'A mule-application is a deployable app; a mule-domain packages shared global configurations (e.g. one HTTP listener port) that several apps on the same on-premises runtime reference. Domains are not used on CloudHub.',
    },
    {
      q: 'Why do connectors use the mule-plugin classifier?',
      a: 'Connectors and modules are packaged as Mule plugins with their own class loader isolation; the classifier tells Maven and the runtime to treat them as plugins rather than plain libraries.',
    },
  ],
}
