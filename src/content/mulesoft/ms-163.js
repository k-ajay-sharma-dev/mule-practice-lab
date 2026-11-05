export default {
  id: 'ms-163',
  category: 'mulesoft',
  title: 'Mule Domains in a Build: Project Shape, Version Matching, MUnit and Deployment Order',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'domains', 'shared-resources', 'on-premises', 'munit'],
  estMinutes: 25,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which statements describe a Mule domain project?',
      options: [
        'The shared configuration file must be named `mule-domain-config.xml`',
        'It can define shared resources such as HTTP listener configurations',
        'Its Maven packaging is `mule-domain`',
        'It can hold shared flows and sub-flows',
        'A Mule app can belong to several domains at once',
      ],
      answer: [0, 1, 2],
      explain: 'Defining flows, sub-flows or any message processors as shared resources is not supported: domains share resources, not behaviour. An app is associated with only one domain at a time.',
    },
    {
      type: 'single',
      prompt: 'How does an application declare its domain in the `pom.xml`?',
      options: [
        'A dependency with `<classifier>mule-domain</classifier>` and `<scope>provided</scope>`',
        'A dependency with `<classifier>mule-plugin</classifier>` and `<scope>compile</scope>`',
        'A `<parent>` element that points to the domain',
        'A `<sharedLibrary>` entry in the Mule Maven plugin',
      ],
      answer: 0,
      explain: 'Studio writes the same dependency, and outside Studio you add it by hand. If you set no domain dependency, the app uses the `default` domain.',
    },
    {
      type: 'single',
      prompt: 'On Mule 4.2.2 or later, an app declares domain version 1.0.1. Which deployed domain does NOT satisfy it?',
      options: ['1.0.0', '1.0.1', '1.0.2', '1.0.5'],
      answer: 0,
      explain: 'The version honours semantic versioning: with 1.0.1 set, a domain with version 1.0.2 and later works, but a domain with version 1.0.0 does not.',
    },
    {
      type: 'single',
      prompt: 'Different domains are deployed with the same group ID, artifact ID and version, so the reference in the POM might be ambiguous. What is the fix?',
      options: [
        'Add the name of the domain folder to the `domain` field of the application `mule-artifact.json`',
        'Rename the application',
        'Set `scope` to `system`',
        'Use `sharedLibraries`',
      ],
      answer: 0,
      explain: 'For example `"domain": "mymuledomain-1.0.1-mule-domain"`.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about deploying a domain are correct?',
      options: [
        'The Mule Maven plugin supports domains only with the standalone or Runtime Manager agent strategy',
        'Mule domain projects cannot be installed using Runtime Manager',
        'The domain JAR goes in `MULE_HOME/domains`, and apps go in `MULE_HOME/apps`',
        'When Mule starts, it first deploys domains, so that they are fully started before the apps',
        '`armDeployment` with `targetType` set to `cluster` is the documented way to deploy a domain',
      ],
      answer: [0, 1, 2, 3],
      explain: 'To deploy a domain with the plugin, use the same configuration and steps as for an app, with `standaloneDeployment` or `agentDeployment`. `armDeployment` is not one of the two supported strategies.',
    },
    {
      type: 'multi',
      prompt: 'A domain-based application has MUnit tests that run in the pipeline. What do the MUnit pages require?',
      options: [
        'The domain must be declared in the POM as a dependency, with classifier `mule-domain`',
        'Domains and apps are handled as regular dependencies, installed in an M2 repository',
        'In a Studio workspace, the folder name must match the artifact ID, and this is case sensitive',
        'The version must be consistent between the repository and the POM',
        'The test suite must redefine the shared HTTP listener configuration',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Because the domain is a dependency of the app, MUnit can start it to retrieve the global elements. The test needs no copy of the shared configuration.',
    },
    {
      type: 'order',
      prompt: 'Order a pipeline release in which both the domain and an application change.',
      items: [
        'Build and test the domain project, and publish its release version to the repository',
        'Update the domain dependency version in the application `pom.xml`',
        'Run the application build, so that MUnit starts against the new domain',
        'Deploy the domain to the target',
        'Deploy the application to the target',
        'Run smoke tests on the shared listener paths',
      ],
      explain: 'The application build needs the domain in a repository, and the runtime needs the domain before the application.',
    },
  ],
  description: `
A government agency runs 25 HTTP services on two on-premises Mule instances, in a segment with no route to Anypoint Platform. All services share one port, so they use a Mule domain:

\`\`\`xml
<mule-domain ...>
  <http:listener-config name="shared-https" >
    <http:listener-connection host="0.0.0.0" port="8443" protocol="HTTPS" />
  </http:listener-config>
  <db:config name="shared-db"> ... </db:config>
  <flow name="audit-log"> ... </flow>
</mule-domain>
\`\`\`

Until now, a developer has exported JARs from Studio. A new pipeline must build, test and deploy the domain and the applications. These points come up:

- The domain and the apps sit in separate Git repositories.
- A build agent has an empty \`.m2\`, and application builds fail to find the domain.
- MUnit passes on a laptop, but not in the pipeline.
- A developer raised the application dependency to domain 1.3.1, but the servers still run 1.3.0.
- The team plans a move of some services to CloudHub 2.0 next year.

**Questions**
1. What is wrong with the domain configuration above?
2. How do you structure the build for a domain and its applications?
3. How do you make MUnit work for a domain-based application in CI?
4. How do versions between app and domain work, and what will happen with 1.3.1 and 1.3.0?
5. How do you deploy the domain from the pipeline?
6. What does the future move mean for this design?
`,
  answerTemplate: `## Domain configuration

## Build structure

## MUnit

## Versions

## Deployment

## Future move
`,
  keyPoints: [
    'A domain shares resources, not behaviour: no flows, sub-flows or message processors.',
    'mule-domain-config.xml is the fixed file name. Packaging is mule-domain.',
    'An app depends on the domain with classifier mule-domain and scope provided, and belongs to one domain at a time.',
    'Versions honour semantic versioning from Mule 4.2.2: an app on 1.0.1 accepts 1.0.2 and later, but not 1.0.0.',
    'The domain field in mule-artifact.json settles an ambiguous reference.',
    'MUnit starts the domain from the dependency, so it must be in an M2 repository.',
    'The plugin deploys domains only with the standalone or agent strategy, and Runtime Manager cannot install them.',
    'Domains are an on-premises feature, so a move to the cloud means moving the shared configuration into each app.',
  ],
  solution: `
**Domain configuration.** The \`audit-log\` flow is not allowed. The Shared Resources page says defining flows, sub-flows or any message processors as shared resources is not supported, because domains are meant to share resources, not behaviour. Move the audit logic to a shared library or a separate service. The file must be named \`mule-domain-config.xml\`, under \`src/main/mule\`.

**Build structure.**
- Treat the domain as a product with its own repository, version and pipeline. Its \`pom.xml\` has \`<packaging>mule-domain</packaging>\`, and the project also has a \`mule-artifact.json\`.
- Publish the domain's release version to the repository the build agents use. The failure on the empty \`.m2\` is the expected result if the domain was only ever installed on a laptop with \`mvn install\`. An application build resolves the domain as a dependency like any other.
- Each application declares it:

\`\`\`xml
<dependency>
  <groupId>com.agency</groupId>
  <artifactId>agency-domain</artifactId>
  <version>1.3.0</version>
  <classifier>mule-domain</classifier>
  <scope>provided</scope>
</dependency>
\`\`\`

- Keep the shared configuration small and stable, because every application depends on it. Note the warning in the environment properties page: with a shared resources structure, do not set anything in the properties files, because that can cause conflicts between the apps that share a domain. Set environment variables that span the app, its domain and the other apps under it.

**MUnit.** Because the domain is a dependency of the application, MUnit can start the domain and retrieve the global elements, so the app needs no extra test configuration. The requirements are:
- The domain is in an M2 repository, handled as a regular dependency.
- The domain is declared in the POM, with a \`<version>\` that is consistent with the repository. The pipeline failure here is most likely the same missing artifact.
- In Studio, the domain is in the workspace, and each folder name matches its artifact ID, case sensitively.

**Versions.** From Mule 4.2.2 the version honours semantic versioning. If you set 1.0.1, a domain with 1.0.2 and later works, but 1.0.0 does not. So an app that declares 1.3.1 does not work with the 1.3.0 on the servers. Deploy domain 1.3.1 first, and only then the application. This also gives a useful rule: raising the domain version first still passes the version check for apps declaring 1.3.0, because a later version satisfies them. If several domains share the same coordinates, the reference can be ambiguous, and the \`domain\` field in \`mule-artifact.json\` settles it, for example \`"domain": "mymuledomain-1.0.1-mule-domain"\`.

**Deployment.** These servers have no link to the platform, and the Mule Maven plugin supports domains only with the standalone or Runtime Manager agent strategy. So use \`agentDeployment\` with the \`uri\` of each instance, or \`standaloneDeployment\` for a local instance, with the same steps as for an app:

\`\`\`bash
mvn clean deploy -DmuleDeploy
\`\`\`

The Runtime Manager agent REST API also lists deploying domains among its functions. Domain deployment is a separate job that runs before the application jobs. At a Mule restart, order takes care of itself: Mule deploys any domains in \`MULE_HOME/domains\` first, then the apps in \`MULE_HOME/apps\`, so all domains are fully started first.

**Future move.** The Shared Resources page lists an on-premises Mule runtime as a prerequisite. The deployment options page describes domains for on-premises deployments. It says that on CloudHub you do not need domains to share ports or other resources between applications, because each app runs on its own server. The Mule runtime overview says that you can only deploy domains when running Mule on premises, and the plugin's domain support does not cover CloudHub 2.0 or Runtime Fabric deployments. So plan to move each shared configuration into the application, with its values in properties, and test each service without the domain before moving it.
`,
  followUps: [
    { q: 'Why use a domain at all?', a: 'To expose several services on the same port, to share a connection to persistent storage, and to keep one configuration for many apps. The docs also give a performance example: on a 2 GB heap, independent proxies hit out-of-memory problems at around 80 apps, and a domain took the count beyond 100.' },
    { q: 'What if the servers are managed by Runtime Manager?', a: 'Then the docs pull in two directions: Mule domain projects cannot be installed using Runtime Manager, and a managed server must not be managed by other tools. Agree the approach with MuleSoft Support before you design a pipeline for it.' },
    { q: 'Can a domain have dependencies?', a: 'Yes. The packaged domain has a repository folder with its dependencies, and domain dependencies declared in the pom.xml are shared with the domain apps, which makes class loading and metaspace use more efficient.' },
    { q: 'Do domain changes restart the applications?', a: 'The pages read here do not say what happens to running apps when a domain is redeployed. Test it on a non-production instance, and plan the change as an outage for all apps under that domain until you know.' },
  ],
}
