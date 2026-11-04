export default {
  id: 'ms-023',
  category: 'mulesoft',
  title: 'Mule Domains and Shared Resources On-Premises',
  level: 'ADVANCED',
  tags: ['domains', 'shared-resources', 'on-prem', 'hybrid', 'http'],
  estMinutes: 20,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which can a Mule domain project contain?',
      options: [
        'A shared HTTP listener config and TLS context',
        'A shared Database config',
        'A VM config with queues',
        'Flows with business logic',
      ],
      answer: [0, 1, 2],
      explain: 'A domain holds shared **global elements** for apps on the same runtime. It cannot contain flows.',
    },
    {
      type: 'single',
      prompt: 'How does an app associate itself with the domain?',
      options: [
        'A Maven dependency on the domain with classifier `mule-domain` and scope `provided`',
        'An `<import>` of the domain XML file inside the app',
        'By deploying the app into the domain folder',
        'A property `mule.domain=bank-domain` in Runtime Manager',
      ],
      answer: 0,
      explain: 'The pom dependency links app and domain; the domain is deployed to the runtime **before** its apps.',
    },
    {
      type: 'match',
      prompt: 'Match each problem to how the domain solves it.',
      pairs: [
        ['Only one inbound port (8443) allowed', 'All apps share the domain HTTPS listener, separated by base path'],
        ['12 × 20 DB connections per server', 'One shared DB config and pool sized for combined load'],
        ['Two apps want to exchange messages without HTTP', 'A VM config in the domain visible to both apps'],
      ],
      explain: 'Sharing the listener avoids "address already in use"; sharing the DB config gives one pool; a domain-level VM config lets apps of that domain use the same queues.',
    },
    {
      type: 'single',
      prompt: 'What is the main operational drawback of a domain?',
      options: [
        'Apps depend on the domain: they fail to start if its JAR is missing or still deploying',
        'Domains double memory use per app',
        'Apps in a domain cannot define any global elements of their own',
        'Domains disable Runtime Manager monitoring',
      ],
      answer: 0,
      explain: 'Coupling and shared fate are the cost, so plan any domain change together with its apps. Apps can still define their own non-conflicting global elements.',
    },
    {
      type: 'single',
      prompt: 'The bank later moves to CloudHub 2.0. What happens to the domain design?',
      options: [
        'Domains are not supported; use platform ingress with path routing, per-app pools, and a broker instead of shared VM queues',
        'The domain is deployed as a separate CloudHub 2.0 app',
        'Domains work the same on CloudHub 2.0 and Runtime Fabric',
        'Only the VM part of the domain is supported',
      ],
      answer: 0,
      explain: 'Domains are for standalone/hybrid runtimes. On CloudHub 2.0 and RTF each app runs isolated in its own replicas.',
    },
  ],
  description: `
A bank runs **12 Mule 4 apps** on a pair of **on-prem** (hybrid, Runtime Manager-managed) Mule runtimes behind an F5 load balancer. The network team only allows **one inbound port (8443)** through the firewall to these servers. Today:

- Only the first app deploys; the rest fail with "address already in use".
- Each app has its own DB connection pool to the same core-banking database, so the DB team sees **12 × 20 connections** per server and complains.
- Two apps exchange messages and the team wants to use **VM queues** between them instead of HTTP.

A colleague proposes a **Mule domain project**.

**Questions**
1. What is a Mule domain, and which resources can it share? What can it *not* contain?
2. Show how the domain and an app are wired together (domain config + app project).
3. How does a domain solve each of the three problems?
4. What are the operational drawbacks of domains?
5. Would this design work on CloudHub 2.0 or Runtime Fabric? What would you do there instead?
`,
  answerTemplate: `## What a domain is

## Wiring domain and app

## Solving the three problems

## Drawbacks

## CloudHub 2.0 / RTF
`,
  keyPoints: [
    'A domain project holds shared global configurations (e.g. HTTP listener config, DB config, JMS/VM config, TLS context) for apps deployed to the same runtime — no flows.',
    'Apps reference the domain as a Maven dependency with the mule-domain classifier (provided scope); the domain is deployed to the runtime before its apps.',
    'A shared HTTP listener config lets many apps listen on one port with different base paths.',
    'Shared connector configs give one connection pool instead of one per app; VM configs in the domain allow VM queues between apps of that domain.',
    'Drawbacks: coupling — apps fail to start if the domain JAR is missing or still deploying; all apps share fate and must use compatible versions.',
    'Domains are for standalone/hybrid runtimes only — not CloudHub/CloudHub 2.0 or Runtime Fabric, where each app is isolated.',
  ],
  solution: `
**What a domain is:** a special Mule project (\`mule-domain\` packaging) that contains **global elements shared** by all apps associated with it on the same runtime: connector configurations such as HTTP listener, DB, JMS and VM configs, TLS contexts, and shared properties. It can't contain **flows** or business logic.

**Wiring**
\`\`\`xml
<!-- domain: mule-domain-config.xml -->
<domain:mule-domain ...>
  <tls:context name="bankTls"> ... </tls:context>
  <http:listener-config name="sharedHttps">
    <http:listener-connection host="0.0.0.0" port="8443" protocol="HTTPS" tlsContext="bankTls"/>
  </http:listener-config>
  <db:config name="coreBankingDb"> ... pooling profile maxPoolSize="40" ... </db:config>
  <vm:config name="sharedVm"><vm:queues><vm:queue queueName="payments"/></vm:queues></vm:config>
</domain:mule-domain>
\`\`\`
In each app's \`pom.xml\`:
\`\`\`xml
<dependency>
  <groupId>com.bank</groupId>
  <artifactId>bank-domain</artifactId>
  <version>1.0.0</version>
  <classifier>mule-domain</classifier>
  <scope>provided</scope>
</dependency>
\`\`\`
Apps then use \`config-ref="sharedHttps"\` with distinct paths (\`/payments/*\`, \`/accounts/*\`). Deploy the domain first by copying its JAR to \`$MULE_HOME/domains\` (domain projects cannot be installed using Runtime Manager), then the apps.

**Solving the problems**
- **One port:** all 12 apps share the domain's HTTPS listener on 8443, separated by base path.
- **DB connections:** one shared DB config → one pool per server sized for the combined load (e.g. 40) instead of 240.
- **VM between apps:** a VM config defined in the domain is visible to all its apps, so app A can publish and app B consume in-memory (non-persistent unless configured; not across servers).

**Drawbacks**
- **Coupling:** apps that reference the domain **fail to start** if its JAR is missing or still deploying. The docs do not state what a domain redeploy does to running apps, so test it on your runtime version and plan it as a change to all of them.
- Shared fate: a misbehaving app can exhaust the shared pool for everyone.
- Version alignment: the domain's connector versions are fixed for all apps.
- VM queues only work within one runtime/cluster — not a replacement for a broker.

**CloudHub 2.0 / RTF:** domains are **not supported**; each app runs in its own replica(s) with its own port and resources. Use the platform's ingress (one hostname, path-based routing to apps), separate connection pools sized per app, and a message broker (Anypoint MQ, JMS) instead of shared VM queues.
`,
  followUps: [
    {
      q: 'Can an app still have its own HTTP listener config when it uses a domain?',
      a: 'Yes — an app can define its own global elements in addition to the domain\'s, as long as they don\'t conflict (e.g. a different port).',
    },
    {
      q: 'Why not just put a reverse proxy in front with different ports per app?',
      a: 'That also works and avoids domain coupling; many teams prefer it. The firewall rule stays on one port at the proxy, and each app keeps its own lifecycle.',
    },
    {
      q: 'How do VM queues behave in an on-prem cluster?',
      a: 'In a Mule cluster, persistent VM queues are distributed across the cluster, so messages can be consumed by any node; without a cluster they are local to one runtime.',
    },
  ],
}
