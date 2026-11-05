export default {
  id: 'ms-162',
  category: 'mulesoft',
  title: 'One Parent POM for 40 Apps: Publishing It to Exchange, Stopping Plugin Inheritance and Sharing Dependency Versions',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'parent-pom', 'exchange', 'mule-maven-plugin', 'dependencies'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'How do the docs say a parent POM reaches Exchange?',
      options: [
        'As a custom asset, published with `exchange-mule-maven-plugin`',
        'As a Mule application, published with `mule-maven-plugin` and the `mule-application` classifier',
        'As a Mule plugin, with `mule-extensions-maven-plugin`',
        'Parent POMs cannot be stored in Exchange',
      ],
      answer: 0,
      explain: 'The Exchange page says parent POMs are published as custom assets, and that custom assets use `exchange-mule-maven-plugin`. Its latest version on that page is 0.1.7.',
    },
    {
      type: 'single',
      prompt: 'The parent POM publish fails in the deploy stage with status code 412. What does the troubleshooting section say?',
      options: [
        '`exchange-pre-deploy` was not executed, so make sure that goal is inside the executions of the plugin',
        'The version already exists, so raise the version',
        'The Connected App lacks the Exchange Contributor permission',
        'The `distributionManagement` URL must use `/api/v2/`',
      ],
      answer: 0,
      explain: 'A 412 (Precondition Failed) here means that `exchange-pre-deploy` did not run. The plugin needs both goals: `exchange-pre-deploy` in the `validate` phase and `exchange-deploy` in the `deploy` phase.',
    },
    {
      type: 'single',
      prompt: 'The parent already declares `exchange-mule-maven-plugin`. A child Mule application is published with the Mule Maven plugin. What must be done?',
      options: [
        'Prevent the inheritance with `<inherited>false</inherited>` on that plugin',
        'Add `maven-deploy-plugin` to the child',
        'Publish the child as a custom asset as well',
        'Nothing, because the two plugins run in sequence',
      ],
      answer: 0,
      explain: 'Without this, the child picks up the custom asset publishing behaviour of its parent. The Exchange page shows the plugin declared with `<inherited>false</inherited>`.',
    },
    {
      type: 'single',
      prompt: 'The parent POM has a `distributionManagement` URL with `/api/v2/`, and a new child overrides it with `/api/v3/`. What does the Exchange FAQ say?',
      options: [
        'Do not mix versions: a parent POM using v2 and a child using v3 fails to deploy',
        'It works, and the child value wins',
        'It works, because v2 and v3 are aliases',
        'The parent must use v2, and only children use v3',
      ],
      answer: 0,
      explain: 'In a Maven POM, use the Maven Facade URL with `/api/v3/`. The REST Exchange API stays on v2, and that is a different API.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about the parent and its children are correct?',
      options: [
        'A plugin in `pluginManagement` is inherited only if the child references it in its `<plugin>` section',
        'The child can then leave out `<version>`, because the version comes from the parent',
        'If the uploaded asset has a defined parent, the parent must be a valid and already uploaded Exchange asset for dynamic parameters to be interpreted',
        'The Maven Facade supports dynamic parameters for `<artifactId>` and `<version>` only',
        'Including `maven-deploy-plugin` alongside `mule-maven-plugin` is the recommended way to publish',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The Exchange page says not to include `maven-deploy-plugin` in the POM or settings file, because it is not compatible with the required plugin.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the plugin configuration that meets it.',
      pairs: [
        ['The Database Connector needs a JDBC driver, and the driver is an application dependency', '`sharedLibraries`'],
        ['One connector needs a library, and no other connector may see it', '`additionalPluginDependencies`'],
        ['Package with a specific Mule runtime version (plugin 4.6.0 and later)', '`runtimeVersion`'],
      ],
      explain: 'Shared libraries are visible to all connectors in the app, which can cause issues when classes differ between versions. An additional plugin dependency needs an explicit version and stays private to that connector.',
    },
    {
      type: 'single',
      prompt: 'Two dependencies in an application bring in different versions of the same library. What does the packaging page say about a dependency version conflict in the `pom.xml`?',
      options: [
        'The latest version is used',
        'The earliest version is used',
        'The build fails',
        'Both versions go into the JAR',
      ],
      answer: 0,
      explain: 'The note on the Package a Mule Application page says the latest version is used. `mvn dependency:tree` shows what you are getting.',
    },
  ],
  description: `
A retailer has 40 Mule applications, all with copied POMs. An audit found 7 versions of the Mule Maven plugin, 5 of MUnit, and 3 of the Database Connector, and some apps still publish through an old \`/api/v2/\` URL. The platform team builds \`retail-parent\`:

\`\`\`xml
<project>
  <groupId>6f1b0a44-1234-4c1e-9f00-aaaabbbbcccc</groupId>
  <artifactId>retail-parent</artifactId>
  <version>1.4.0</version>
  <packaging>pom</packaging>
  <properties>
    <app.runtime>4.9.0</app.runtime>
    <mule.maven.plugin.version>4.10.4</mule.maven.plugin.version>
    <munit.version>3.7.0</munit.version>
    <db.connector.version>1.14.0</db.connector.version>
  </properties>
  <build>
    <plugins>
      <plugin>
        <groupId>org.mule.tools.maven</groupId>
        <artifactId>exchange-mule-maven-plugin</artifactId>
        <version>0.1.7</version>
        <executions>
          <execution>
            <id>deploy</id>
            <phase>deploy</phase>
            <goals><goal>exchange-deploy</goal></goals>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>
\`\`\`

The first publish fails with status code 412. After a quick fix, the first child app starts to behave strangely when it publishes. A developer also asks why the MySQL driver stays in every child, and whether the parent can hold it.

**Questions**
1. How is a parent POM published to Exchange, and why did the first publish fail?
2. Why does a child app misbehave, and what is the fix?
3. What must the release order be between the parent and the children?
4. Design what goes into the parent: versions, plugin management, repositories and dependency management.
5. How do you roll out a connector upgrade to 40 apps through the parent?
`,
  answerTemplate: `## Publishing the parent

## Child apps

## Release order

## Parent design

## Connector upgrade
`,
  keyPoints: [
    'Parent POMs are Exchange custom assets, published with exchange-mule-maven-plugin.',
    'That plugin needs exchange-pre-deploy (validate) and exchange-deploy (deploy). A 412 means pre-deploy did not run.',
    'If the parent declares that plugin, stop inheritance with inherited false, so that Mule apps publish with the Mule Maven plugin.',
    'A parent that an uploaded asset depends on must already be a valid uploaded asset, so publish the parent first.',
    'Use /api/v3/ in POMs. A parent on v2 and a child on v3 fails to deploy.',
    'pluginManagement defines configuration, and children opt in by referencing the plugin without a version.',
    'sharedLibraries are visible to all connectors. additionalPluginDependencies stay with one connector and need an explicit version.',
    'If there is a version conflict in the POM, the latest version is used. Check with mvn dependency:tree.',
  ],
  solution: `
**Publishing the parent.** The Exchange page says parent POMs are published as custom assets, with \`exchange-mule-maven-plugin\`, and it needs two goals. The draft has only \`exchange-deploy\`. The docs give the meaning of the error directly: a 412 (Precondition Failed) in the deploy stage means \`exchange-pre-deploy\` was not executed. Add the missing execution:

\`\`\`xml
<plugin>
  <groupId>org.mule.tools.maven</groupId>
  <artifactId>exchange-mule-maven-plugin</artifactId>
  <version>0.1.7</version>
  <inherited>false</inherited>
  <executions>
    <execution>
      <id>validate</id>
      <phase>validate</phase>
      <goals><goal>exchange-pre-deploy</goal></goals>
    </execution>
    <execution>
      <id>deploy</id>
      <phase>deploy</phase>
      <goals><goal>exchange-deploy</goal></goals>
    </execution>
  </executions>
</plugin>
\`\`\`

The \`groupId\` is the organization ID, or the business group ID if the asset belongs to a business group. The parent also needs a \`distributionManagement\` repository on the v3 Maven Facade, with the same \`<id>\` as the server in \`settings.xml\`.

**Child apps.** Plugins declared under \`<build><plugins>\` are inherited, so each child gets \`exchange-mule-maven-plugin\` too, as well as its own Mule Maven plugin. The docs say that when a Maven project is published with the Mule Maven plugin and its parent already includes \`exchange-mule-maven-plugin\`, you need to prevent the inheritance. Adding \`<inherited>false</inherited>\`, as above, is the fix.

**Release order.** The Exchange page covers an uploaded asset with a defined parent. The parent must be a valid and already uploaded Exchange asset for the dynamic parameters to be properly interpreted. So:
1. Publish \`retail-parent\` 1.5.0.
2. Update one pilot app to the new parent and run the full pipeline.
3. Roll out to the other apps.

The Maven Facade supports dynamic parameters only for \`<artifactId>\` and \`<version>\`, so do not rely on a property resolved from the parent for anything else in the asset coordinates. Build agents also need the Exchange repository in \`repositories\`, or the child cannot resolve its parent at all.

**Parent design.**
- **Properties:** the plugin, MUnit and runtime versions. The MUnit page requires \`munit.version\`.
- **\`pluginManagement\`:** the Mule Maven plugin with \`<extensions>true</extensions>\`, because the plugin does not work without it, and the MUnit plugin with its executions and coverage block. Children reference them in \`<plugins>\` without a version. The same mechanism lets a child ignore a plugin, by not declaring it.
- **\`dependencyManagement\`:** connector versions, which is standard Maven. The entry must carry the same classifier as the dependency, so write \`<classifier>mule-plugin</classifier>\`. A child still declares each connector it uses, but without a version.
- **Repositories:** Exchange, the MuleSoft releases repository, and the Enterprise repository for plugins, with no credentials in the POM.
- **Not in the parent:** connector dependencies that only some apps use. A dependency in the parent's \`<dependencies>\` goes to every child.

For the driver question: a JDBC driver is an application dependency that a connector must see, so it is a shared library, and \`sharedLibraries\` only names it by \`groupId\` and \`artifactId\`. Every app that uses the Database Connector needs the declaration, and the driver version can be set once in \`dependencyManagement\`. An alternative is \`additionalPluginDependencies\`, which keeps the driver with that connector, but it needs an explicit \`version\`.

**Connector upgrade.**
1. Change the version in the parent, and publish a new parent version.
2. Run the pilot app, and check \`mvn dependency:tree\`. The packaging page says that on a version conflict the latest version is used, so look for surprises.
3. Check the runtime. A connector can require a later Mule version than the app declares, and deployment then fails, so confirm this against your oldest target.
4. Move the other apps in waves. Each picks up the new parent through a small version change and its normal pipeline.

The parent version is what you roll back, which is one reason to keep it a release version and not a \`SNAPSHOT\`.
`,
  followUps: [
    { q: 'Why not use a SNAPSHOT parent for speed?', a: 'Its content can change under a released app, so a rebuild of the same tag can produce a different result. Use it only while building the parent, and keep release versions for the apps.' },
    { q: 'What happens to the coverage block if a child overrides it?', a: 'The docs say the override suppresses the parent configuration, so the child must declare everything again, or the default values apply.' },
    { q: 'How do you publish Java libraries that the apps need?', a: 'The Exchange page says to publish Java libraries and POM files as Exchange custom assets.' },
    { q: 'What happens with Maven 3.9.12 when the parent still uses v2?', a: 'Maven 3.9.12 and later publish files in parallel by default, which Facade API v1 and v2 do not support, so the publish fails. Moving to v3 is the cleanest fix.' },
    { q: 'Is a parent POM the only reuse option?', a: 'No. A Maven archetype or a project template helps at creation time, but only a parent changes existing apps through a version bump.' },
  ],
}
