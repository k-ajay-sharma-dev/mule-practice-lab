export default {
  id: 'ms-166',
  category: 'mulesoft',
  title: 'Custom Connectors and Exchange Dependencies in a Pipeline: Java Compatibility Metadata, Publishing Rules and Consuming Assets',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'exchange', 'mule-sdk', 'connectors', 'dependencies'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A Java SDK connector has no `@JavaVersionSupport` annotation. On Mule 4.5.0 or later, which Java versions is it assumed to support?',
      options: ['Java 8 and Java 11', 'Java 17 only', 'All Java versions that Mule supports', 'No version, so it does not load'],
      answer: 0,
      explain: 'So an app that moves to Java 17 fails if it contains such a connector: at deployment Mule verifies that all modules are compatible with the Java version, and if it finds an incompatibility, the application does not deploy.',
    },
    {
      type: 'multi',
      prompt: 'From August 1, 2026, a team publishes a new connector version that changes its supported Java versions. What do the docs require?',
      options: [
        'Java connectors include the `@JavaVersionSupport` annotation',
        'XML connectors use `mule-extensions-maven-plugin` 1.9.0 or later, so that the metadata is generated at build time',
        'The build pipeline uses Maven 3.8.0 or later (3.9.8 or later recommended) and JDK 17 or later',
        'Connectors already published to Exchange must be republished',
        'Running applications must be redeployed',
      ],
      answer: [0, 1, 2],
      explain: 'The change does not affect connectors already published to Exchange, or running applications. Exchange reads Java compatibility from `mule-artifact.json` during publication.',
    },
    {
      type: 'single',
      prompt: 'How do you confirm that a built connector carries the Java metadata?',
      options: [
        'Check that `mule-artifact.json` in the connector JAR includes the `supportedJavaVersions` attribute',
        'Check that the POM includes `<java.version>`',
        'Check the Exchange page after publishing',
        'Run `mvn dependency:tree`',
      ],
      answer: 0,
      explain: 'The Publishing Connectors page gives this check after `mvn clean install`, and suggests a publish to a test environment before Production.',
    },
    {
      type: 'single',
      prompt: 'A custom connector depends on a library that exists only in the company Artifactory. What does the Exchange page say?',
      options: [
        'Mule 4 extensions that declare dependencies that do not exist in Maven Central or the MuleSoft Maven repositories are not currently supported, so publish the library as an Exchange custom asset',
        'It works, as long as Exchange has the Artifactory URL',
        'The connector must shade the library into a new group ID',
        'Exchange downloads it from any repository in the POM',
      ],
      answer: 0,
      explain: 'The section on dependencies external to Exchange says to publish Java libraries and POM files as custom assets. The SDK documentation adds that all Maven dependencies of a custom connector must be accessible from Exchange.',
    },
    {
      type: 'single',
      prompt: 'An app depends on version 2.3.0 of a connector that is in the `development` state and is not a SNAPSHOT. Why does the build fail to resolve it?',
      options: [
        'An asset that is in development state and is not a SNAPSHOT version cannot be consumed through Maven',
        'Development assets are visible only in the EU control plane',
        'The app must use `<scope>provided</scope>`',
        'The Maven Facade serves only stable assets of type `rest-api`',
      ],
      answer: 0,
      explain: 'Either publish a stable version, or use a SNAPSHOT version during development. A SNAPSHOT asset stays in the `development` state permanently, and `mvn clean deploy` overwrites it without any errors.',
    },
    {
      type: 'multi',
      prompt: 'Which settings are valid for a pipeline that consumes assets from Exchange?',
      options: [
        'A `<repository>` in the POM with the Maven Facade URL, and a `<server>` in `settings.xml` with the same `<id>`',
        'Username `~~~Client~~~`, and password `clientID~?~clientSecret` for a connected app',
        'Dependency coordinates with the group ID, artifact ID and version of the asset',
        'The `/api/v2/` REST URL of the Exchange API in `<repositories>`',
      ],
      answer: [0, 1, 2],
      explain: 'The `<id>` links the POM with the login information. The REST Exchange API is on v2 and is for calls over HTTP, and the Maven Facade API is the one for Maven clients.',
    },
    {
      type: 'single',
      prompt: 'Publishing a custom connector ends in a timeout, and its schema definitions import other schemas. What does the troubleshooting note say?',
      options: [
        'Remove external references that are private or not reachable from the internet',
        'Raise `deploymentTimeout`',
        'Publish with Maven 3.8',
        'Split the connector into two assets',
      ],
      answer: 0,
      explain: 'The timeout can happen if schema definitions import other schemas with external references that are private or unreachable from the internet.',
    },
  ],
  description: `
A bank has built two extensions, and 14 applications use them:

| Asset | Built with | Notes |
|---|---|---|
| \`ledger-connector\` | Java SDK | Calls the core ledger, and needs \`ledger-client.jar\`, which exists only in the bank's Artifactory |
| \`common-error-module\` | XML SDK | Shared error mapping, built from an old POM |

Both were published to Exchange by hand from a laptop two years ago. Now:

- The bank is moving apps to Java 17.
- A new pipeline must build, test and publish both assets.
- Application builds must get them from Exchange with no personal credentials.
- Developers want to try new connector code before it is released, without publishing a stable version each time.

**Questions**
1. What do you need to change in each extension for Java 17, and what happens if you do not?
2. Design the publishing pipeline, including its Maven and JDK requirements.
3. How do you handle \`ledger-client.jar\`?
4. How do application builds consume the assets?
5. How do developers test connector changes before a stable release?
6. How do you roll a new connector version out to the 14 apps?
`,
  answerTemplate: `## Java 17 changes

## Publishing pipeline

## External library

## Consuming assets

## Pre-release testing

## Rollout
`,
  keyPoints: [
    'Without @JavaVersionSupport, a custom connector is assumed to support Java 8 and 11, and an app with an incompatible module does not deploy.',
    'From August 1, 2026, new versions that change Java compatibility need the metadata in mule-artifact.json.',
    'XML connectors need mule-extensions-maven-plugin 1.9.0 or later. Use Maven 3.8.0 or later and JDK 17 or later in the pipeline.',
    'Verify that supportedJavaVersions is in mule-artifact.json inside the JAR.',
    'Extensions cannot declare dependencies missing from Maven Central or the MuleSoft repositories. Publish libraries as custom assets.',
    'groupId is the organization or business group ID, and the Mule Maven plugin publishes extensions.',
    'A non-SNAPSHOT asset in development cannot be consumed through Maven. A SNAPSHOT can, and it overwrites without errors.',
    'Consume with the Facade URL, and a server id that matches the repository id. Connected App login: ~~~Client~~~ and clientID~?~clientSecret.',
  ],
  solution: `
**Java 17 changes.**
- \`ledger-connector\`: add or upgrade the \`mule-sdk-api\` dependency, and add \`@JavaVersionSupport\` in the class that has \`@Extension\`:

\`\`\`java
@Extension(name = "Ledger")
@JavaVersionSupport({JAVA_8, JAVA_11, JAVA_17})
public class LedgerConnector { }
\`\`\`

- \`common-error-module\`: the XML SDK has no annotation, so move to \`mule-extensions-maven-plugin\` 1.9.0 or later, directly or through \`mule-modules-parent\` 1.9.0 or later, so that the metadata is generated at build time.

If you do nothing, a connector without the annotation is assumed to support Java 8 and 11. When an app on Java 17 deploys, Mule verifies all its modules, throws an error and does not deploy it. For an XML connector, the docs give the example \`Extension 'module-error-handler-plugin' does not support Java 17. Supported versions are: [1.8, 11]\`. Only mark a connector as Java 17 compatible after testing on it: the annotation is a promise, not a conversion. Check its dependencies as well.

**Publishing pipeline.**
1. Run on Maven 3.8.0 or later, with 3.9.8 or later recommended, and JDK 17 or later. A build failure after moving to plugin 1.9.0 usually means that these are not met.
2. \`mvn clean install\`, with the connector's tests.
3. Check that \`mule-artifact.json\` in the JAR has \`supportedJavaVersions\`.
4. Publish to a test environment first, as the docs suggest. Use a separate business group if you want to keep it out of the main catalogue.
5. Publish with \`mvn deploy\`, with \`groupId\` set to the organization or business group ID, a \`distributionManagement\` repository on the v3 Maven Facade, and a Connected App in \`settings.xml\`. The Exchange page says to use the Mule Maven plugin to publish an extension, and not to include \`maven-deploy-plugin\`.

Remember the rule from August 1, 2026: new versions that change Java compatibility need this metadata, or Exchange rejects them. If it rejects a connector with an error about missing compatibility information, check the plugin version, then rebuild and republish.

**External library.** The Exchange page says that Mule 4 extensions that declare dependencies which do not exist in Maven Central or the MuleSoft Maven repositories are not currently supported. It also says that Java libraries and POM files can be published as Exchange custom assets. So a first pipeline publishes \`ledger-client\` with \`exchange-mule-maven-plugin\`, and the connector depends on that asset. Artifactory can stay as a proxy for internal builds, but the published connector must not rely on it.

**Consuming assets.** Add the dependency with the group ID, artifact ID and version, plus \`<classifier>mule-plugin</classifier>\`, and the repository:

\`\`\`xml
<repository>
  <id>exchange</id>
  <name>Corporate Repository</name>
  <url>https://maven.anypoint.mulesoft.com/api/v3/organizations/$\{org.id}/maven</url>
  <layout>default</layout>
</repository>
\`\`\`

\`\`\`xml
<server>
  <id>exchange</id>
  <username>~~~Client~~~</username>
  <password>$\{env.EXCHANGE_CLIENT_ID}~?~$\{env.EXCHANGE_CLIENT_SECRET}</password>
</server>
\`\`\`

The \`<id>\` values must be the same, because that is what connects the POM to the login. Give the Connected App only the Exchange access that this job needs, and use a separate app for publishing, so that a build that only reads cannot publish.

**Pre-release testing.** Publish a \`SNAPSHOT\` version with the v3 facade. It is permanently in the \`development\` state, it can be consumed through Maven, and \`mvn clean deploy\` overwrites it with no errors. A non-SNAPSHOT version in the \`development\` state cannot be consumed through Maven, so a pre-release number would not help. Keep \`SNAPSHOT\` dependencies out of release builds.

**Rollout.** Set the new version in the parent POM's \`dependencyManagement\`, and migrate one pilot app. A dependency can raise the required Mule version, and in that case the deployment error reports the version the dependency needs. So test on your oldest target runtime. Then move the other apps in waves, each through its normal pipeline, and keep the old version available in Exchange until the last app has moved.
`,
  followUps: [
    { q: 'How do you set a custom icon for a connector published by Maven?', a: 'Upload an SVG with the icon classifier by a PUT to the Exchange REST API, with a bearer token in the authorization header.' },
    { q: 'What if a connector declares compatibility with Java 17 only?', a: 'The SDK docs say you can, but you must make sure that no adoption or backward compatibility issues exist, because apps on older Java can no longer use it.' },
    { q: 'Can the asset type be changed later?', a: 'No. You cannot republish an asset with the same asset ID as a different asset type, so a wrong first publish means a new asset ID.' },
    { q: 'Should a build agent download from Exchange on every run?', a: 'Cache the local Maven repository between runs, as with any Maven build, but never cache SNAPSHOT versions across a release build.' },
    { q: 'Which token form does Exchange accept in settings.xml?', a: 'For token authentication, the username stays ~~~Token~~~ and the password is the access token. The Connected App form is better for a pipeline, because it does not expire in the same way as a token that a person fetched.' },
  ],
}
