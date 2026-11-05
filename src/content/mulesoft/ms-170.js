export default {
  id: 'ms-170',
  category: 'mulesoft',
  title: 'Operating Mule Domains in Depth: Version Matching, the Default Domain, Start Order, Metaspace Gains and What Runtime Manager Cannot Install',
  level: 'ADVANCED',
  tags: ['deployment', 'domains', 'shared-resources', 'on-prem', 'hybrid', 'memory', 'performance', 'environments'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'Two Studio projects are copied to the same on-premises runtime. Each has its own HTTP Listener configuration on `0.0.0.0:8081`, and the second app logs `address already in use`. What is the documented fix if both must stay on port 8081?',
      options: [
        'Put the listener configuration in a domain, keep it only in `mule-domain-config.xml`, and associate both apps with that domain',
        'Keep both listener configurations and give each a different base path',
        'Start the two apps on different threads with `ee:scheduler-pools`',
        'Deploy both apps to the `default` domain, which shares ports automatically',
      ],
      answer: 0,
      explain: 'Two apps cannot bind the same host and port in one runtime unless they share that listener through a domain. The `default` domain is only what apps use when no domain dependency is set: to share a port, the docs say to point the app at your own domain.',
    },
    {
      type: 'single',
      prompt: 'On Mule 4.2.2 or later, an app\'s `pom.xml` declares its domain at version `1.0.1`. Which deployed domain versions satisfy it?',
      options: [
        '1.0.2 and later work; 1.0.0 does not',
        'Only exactly 1.0.1',
        'Any 1.x version, including 1.0.0',
        'Any version, because the domain is `provided` scope',
      ],
      answer: 0,
      explain: 'The version honours semantic versioning. The Shared Resources page gives this exact example: for 1.0.1, a domain at 1.0.2 and later works, a domain at 1.0.0 does not.',
    },
    {
      type: 'single',
      prompt: 'The release team wants to install a new domain through the Runtime Manager UI, the same way they deploy apps to their hybrid servers. What do the docs say?',
      options: [
        'Mule domain projects cannot be installed using Runtime Manager; place the JAR in `$MULE_HOME/domains`, or use the Mule Maven plugin with the standalone or Runtime Manager agent deployment strategy',
        'Runtime Manager deploys domains if the server is in a server group',
        'Runtime Manager deploys domains automatically when an app references them',
        'Domains can only be deployed from Anypoint Studio',
      ],
      answer: 0,
      explain: 'Domains go to each runtime separately. The Mule Maven plugin supports domains only with the standalone and agent strategies, so plan this step per node.',
    },
    {
      type: 'multi',
      prompt: 'Which of these can you define in a domain and share with its apps?',
      options: [
        'Connector configurations such as an HTTP Listener or HTTP Request configuration',
        'Shared properties',
        'Scheduler pools',
        'A shared error-handling subflow',
        'A flow that logs every request',
      ],
      answer: [0, 1, 2],
      explain: 'Domains share resources, not behaviour. Defining flows, subflows or any message processors as shared resources is not supported. Shared logic belongs in a library or a separate app.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for a clean first deployment of a domain and two apps to a standalone runtime outside Studio.',
      items: [
        'Export the domain as a deployable JAR and copy it to `$MULE_HOME/domains`',
        'Export each app that references the domain and copy the JARs to `$MULE_HOME/apps`',
        'Start the runtime',
        'Mule deploys everything in the domains folder',
        'Mule deploys the apps, after the domains are fully started',
      ],
      explain: 'The runtime deploys domains before apps. An app that references a domain fails to start if the domain JAR is missing or still deploying.',
    },
    {
      type: 'single',
      prompt: 'Two different domains on one server have the same group ID, artifact ID and version, and the reference in an app\'s `pom.xml` has become ambiguous. What is the documented way to pin the app to one of them?',
      options: [
        'Add the domain folder name to the app\'s `mule-artifact.json`, for example `"domain": "mymuledomain-1.0.1-mule-domain"`',
        'Set `mule.deploy.applications` on the command line',
        'Rename `mule-domain-config.xml` in one domain',
        'Add a second domain dependency to the `pom.xml`, because an app can belong to two domains',
      ],
      answer: 0,
      explain: 'An app is associated with only one domain at a time, and `mule-domain-config.xml` must keep that exact name. The `domain` field in `mule-artifact.json` removes the ambiguity.',
    },
    {
      type: 'single',
      prompt: 'Why does the performance guidance recommend domains when many apps share one on-premises instance?',
      options: [
        'A central point for shared resources makes class loading, and so metaspace use, more efficient, and domain dependencies in the `pom.xml` are shared with the domain\'s apps',
        'A domain gives each app its own JVM',
        'Domains remove the need for heap sizing',
        'Domains replicate apps across cluster nodes',
      ],
      answer: 0,
      explain: 'The documented example is 2 GB heap and 256 MB metaspace: without a domain, TPS drops noticeably at 60 apps and out-of-memory exceptions appear at 80; with a domain sharing the backend configuration, the count passes 100. Every app still adds its own overhead, so test each one.',
    },
  ],
  description: `
An insurer is consolidating **70 small HTTP proxy applications** from individual VMs onto two standalone Mule instances, each with **2 GB of heap and 256 MB of metaspace**. All 70 apps call the same policy administration backend and apply one IP allow list policy. The servers are registered with Runtime Manager.

The pilot has produced these problems:
- The first copied app starts; the second fails with \`address already in use\`.
- After a domain was added, one app refuses to start on a server that still has the older domain JAR.
- Once 60 apps are deployed without a domain, throughput falls. A test with 80 apps fails with out-of-memory errors.
- The release manager wants domains installed through the Runtime Manager UI, like apps.
- One architect proposes putting the common logging subflow in the domain so that every team reuses it.

**Questions**
1. What belongs in the domain, and what does not?
2. Explain how an app finds its domain, including version matching and ambiguity.
3. In what order are domains and apps deployed, and how does the release process change?
4. Why does a domain help with this workload, and what are its limits?
5. Where do domains not apply?
`,
  answerTemplate: `## What goes in the domain

## How an app binds to a domain

## Deployment order and release process

## Performance effect and limits

## Where domains do not apply
`,
  keyPoints: [
    'A domain shares resources: properties, scheduler pools and connector configurations. Flows, subflows and message processors are not supported as shared resources.',
    'A domain project has `/src/main/mule/mule-domain-config.xml`; that file name is required.',
    'An app is associated with one domain at a time. With no domain dependency it uses the `default` domain.',
    'The domain is a `pom.xml` dependency with the `mule-domain` classifier and `provided` scope. On Mule 4.2.2 and later the version honours semantic versioning: an app at 1.0.1 accepts 1.0.2 and later, not 1.0.0.',
    'If several domains share the same coordinates, name the domain folder in the `domain` field of `mule-artifact.json`.',
    'Domain JARs go to `$MULE_HOME/domains`, app JARs to `$MULE_HOME/apps`. The runtime deploys domains first; apps fail to start if the domain is missing or still deploying.',
    'Runtime Manager cannot install domain projects. The Mule Maven plugin handles them only with the standalone and agent strategies.',
    'Domains improve class loading and metaspace use. The documented example goes from trouble at 60 to 80 apps to more than 100, but each app still adds load, so test it alone and with the others.',
    'The docs state that domains are not supported on CloudHub, and describe them as an on-premises feature.',
  ],
  solution: `
**1. What goes in the domain.** Put the HTTP Listener configuration, the HTTP Request configuration for the policy backend and any shared properties in \`mule-domain-config.xml\`. Scheduler pools can also live there. The logging subflow cannot: domains are not meant to share behaviour, and flows, subflows and message processors are not supported. Ship that logic as a shared library instead.

\`\`\`xml
<http:listener-config name="HTTP_Listener_Configuration">
  <http:listener-connection host="0.0.0.0" port="8080"/>
</http:listener-config>
\`\`\`

Each app then uses \`config-ref="HTTP_Listener_Configuration"\` with its own path, and the listener configuration must not remain in the app.

**2. How an app binds to a domain.** The app declares the domain as a dependency:

\`\`\`xml
<dependency>
  <groupId>com.mycompany</groupId>
  <artifactId>mymuledomain</artifactId>
  <version>1.0.1</version>
  <classifier>mule-domain</classifier>
  <scope>provided</scope>
</dependency>
\`\`\`

Since Mule 4.2.2 the version follows semantic versioning, so an app declaring 1.0.1 runs with 1.0.2 and later, but not with 1.0.0. That explains the pilot failure: the server still held the older JAR. If two domains share coordinates, set \`"domain": "mymuledomain-1.0.1-mule-domain"\` in \`mule-artifact.json\`.

**3. Order and release process.** The runtime deploys everything in \`$MULE_HOME/domains\` before anything in \`$MULE_HOME/apps\`. An app fails to start if its domain is missing or still deploying. Because Runtime Manager cannot install domain projects, the domain becomes a separate release step for each server, done by file copy or with the Mule Maven plugin's standalone or agent strategy. Roll the domain out before any app that needs the new version.

**4. Effect and limits.** This scenario mirrors the example in the docs: with 2 GB heap and 256 MB metaspace, independent deployment lowers TPS at about 60 apps and causes out-of-memory exceptions at 80. A domain sharing the backend configuration takes the count past 100 with balanced resource use, because a central point for shared resources makes class loading and metaspace use more efficient. The limit is that each app still adds its own load. Test each app alone, then with the others, before adding it. All apps in the domain also depend on it, so a mistake in shared configuration reaches all of them.

**5. Where domains do not apply.** The shared resources page lists running Mule on premises as a prerequisite, and the deployment model page states that domains are not supported on CloudHub. Teams moving to managed targets must give each app its own configuration.
`,
  followUps: [
    {
      q: 'Do domain dependencies help too, or only connector configurations?',
      a: 'They help too. The docs note that dependencies declared in the domain pom are shared with the domain\'s apps, which is part of the class-loading and metaspace gain.',
    },
    {
      q: 'Would you put all 70 apps in one domain?',
      a: 'Only if they really share the same resources and release rhythm, as these proxies do. Apps with different owners and different shared configuration are better in separate domains, because every app in a domain depends on that one artifact.',
    },
    {
      q: 'Does the domain give each app its own port?',
      a: 'No, it does the opposite. Sharing the listener lets many apps expose services through the same port, each with its own path.',
    },
  ],
}
