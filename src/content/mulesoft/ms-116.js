export default {
  id: 'ms-116',
  category: 'mulesoft',
  title: 'Runtime Manager for Hybrid Servers: Server Groups or Clusters, Properties, Environments and Anypoint CLI',
  level: 'INTERMEDIATE',
  tags: ['runtime-manager', 'deployment', 'environments', 'api-management', 'anypoint-cli', 'platform-apis', 'hybrid'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the main difference between a server group and a cluster in Runtime Manager?',
      options: [
        'In a server group, application instances run in isolation; in a cluster, they are aware of each other, share information and synchronize statuses',
        'A server group is for CloudHub and a cluster is for on-premises servers',
        'A server group has no single deployment target',
        'Clusters do not need the Runtime Manager agent',
      ],
      answer: 0,
      explain: 'Both act as a single deployment target. If you have concurrency issues with a server group, the docs suggest a cluster.',
    },
    {
      type: 'multi',
      prompt: 'Which requirements apply to a server group?',
      options: [
        'All servers run the same Mule runtime version',
        'All servers run the same Runtime Manager agent version',
        'All servers run the same Java version',
        'Applications on a server must be stopped and deleted before it joins the group',
        'All servers must be in the same multicast segment',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The network segment rule is for multicast clusters, not server groups.',
    },
    {
      type: 'match',
      prompt: 'Match each deployment target to its property.',
      pairs: [
        ['Unicast', 'You configure node IP addresses, so they cannot be assigned dynamically with DHCP'],
        ['Multicast', 'Nodes detect each other automatically, and must be on the same network segment'],
        ['Server group', 'No cluster type to choose, because application instances run in isolation'],
      ],
      explain: 'A unicast node must be Running to be added. A multicast node need not be, but many networks block multicast. A cluster has up to eight servers.',
    },
    {
      type: 'single',
      prompt: 'An engineer changes a property on the Settings page of an app running on a cluster. Nothing changes in behaviour. What is missing?',
      options: [
        'A restart of the application and any server group or cluster where it is deployed',
        'A new JAR, because properties are read only at build time',
        'A change in the bundled YAML file, which takes priority',
        'A new API instance',
      ],
      answer: 0,
      explain: 'After a change to properties, the docs say you must restart the application and any server group or cluster where it is deployed. Settings page values override values in the properties file.',
    },
    {
      type: 'match',
      prompt: 'Match each environment type to its purpose.',
      pairs: [
        ['Production', 'Deploy applications and APIs publicly'],
        ['Sandbox', 'Develop and test without affecting production'],
        ['Design', 'Used by Design Center; you cannot deploy to it with Runtime Manager'],
      ],
      explain: 'The type is chosen when an environment is created, and it cannot be changed after that.',
    },
    {
      type: 'single',
      prompt: 'A CI job runs Anypoint CLI. The credentials file has one client ID, an environment variable has another, and the command line has a third. Which is used?',
      options: [
        'The command line, then environment variables, then the file',
        'The file, then environment variables, then the command line',
        'Environment variables always win',
        'The command fails because the values differ',
      ],
      answer: 0,
      explain: 'Command-line parameters override all other methods. Environment variables override the configuration file.',
    },
    {
      type: 'single',
      prompt: 'Since MFA was enabled for all users, how should an automated job authenticate to Anypoint CLI?',
      options: [
        'With a connected app (client ID and client secret)',
        'With a shared user name and password',
        'With the environment client ID and secret',
        'With a client application\'s client ID',
      ],
      answer: 0,
      explain: 'The CLI page says that, as part of MFA enablement, the only way to use Anypoint CLI is through Connected Apps.',
    },
  ],
  description: `
An airline keeps its Mule runtimes on-premises for data residency reasons, and manages them from Runtime Manager. There are four servers, and Sandbox and Production environments.

| App | Behaviour |
|---|---|
| \`crew-roster-api\` | Stateless REST API |
| \`baggage-events\` | Scheduler and listener; two nodes must not process the same work |

Questions from a design review:
- Should each app go on a server group or a cluster?
- Servers get their addresses from DHCP, and the network team blocks multicast.
- The team sets properties in Runtime Manager, and sometimes the change seems to be ignored.
- Monitoring shows only one of the four servers.
- A new environment was created with the wrong type by mistake.
- The team wants scripts, not clicks, for promoting API instances and listing contracts.

**Questions**
1. How do you register a server? What are servers, server groups and clusters?
2. Which target suits each app, and what do the network facts change?
3. How do properties work in hybrid deployments?
4. Explain environment types and the mistake.
5. What can Anypoint CLI and the platform APIs do, and how should a script authenticate?
`,
  answerTemplate: `## Servers, groups and clusters

## Target for each app

## Properties

## Environments

## Anypoint CLI and platform APIs
`,
  keyPoints: [
    'Register a Mule server with the Runtime Manager agent, using the amc_setup command that Runtime Manager generates.',
    'A server group is one deployment target with isolated app instances. A cluster has up to eight servers, whose instances share information and synchronize; if one fails, another takes over.',
    'All servers in a group or cluster need the same Mule runtime, Runtime Manager agent and Java versions.',
    'Unicast needs fixed IP addresses; multicast needs one network segment and a network that allows it.',
    'Settings page properties override properties in the file, and changes need a restart of the app and any group or cluster.',
    'Environment types are production, sandbox and design. The type cannot be changed after creation.',
    'Install the Anypoint Monitoring agent on each server in a group or cluster.',
    'Anypoint CLI (anypoint-cli-v4) scripts the platform. Use connected apps. Precedence: command line, environment variables, configuration file.',
  ],
  solution: `
**1. Servers, groups and clusters.** In Runtime Manager, choose **Servers > Add Server** and enter a name. Runtime Manager generates an \`amc_setup\` command with a registration token for your organization and environment. Run it to configure the agent on the server. A server belongs to one environment and is visible only there. You can then deploy to the server, or add it to a group or cluster.

| | Server group | Cluster |
|---|---|---|
| Deployment target | One | One |
| App instances | Isolated | Aware of each other, share information |
| If a server fails | Redundancy: the app is also on other servers | Another server takes over processing |
| Size | Not stated on the page | Up to eight servers |

**2. Target for each app.**
- \`crew-roster-api\` is stateless, so a **server group** behind a load balancer gives redundancy without coordination.
- \`baggage-events\` has concurrency concerns, and the docs suggest clusters for those, so use a **cluster**.

The network facts decide the cluster type. Multicast is blocked, so the cluster must be **unicast**. Unicast identifies a node by IP address, so IP addresses cannot be assigned dynamically with DHCP. If a restarted server gets a new address, you must add it to the cluster again with that address. So ask for fixed addresses. Keep nodes on one subnet or in one availability zone, because clustering relies on high-speed connectivity.

**3. Properties.** You can bundle a properties file in the app and add environment-specific values in Runtime Manager. The **Settings** page values override the file. Any change needs a **restart** of the app and of any group or cluster it runs on, which explains the "ignored" changes. Values are sent over HTTPS and stored encrypted, and are displayed only on the Settings page.

**4. Environments.**
- **Production:** deploy apps and APIs publicly.
- **Sandbox:** development and test.
- **Design:** used by Design Center. Only applications deployed from Design Center can target it.

You **cannot change the type** after an environment is created, so create a new one with the right type and move the work. Users cannot be added to an environment directly; you grant access with role permissions. Each environment has its own client ID and secret. Apps can be promoted from a sandbox to production without uploading them again.

**Monitoring.** The Anypoint Monitoring agent must be installed on **each** server in a group or cluster, which explains why only one server shows data.

**5. CLI and APIs.** \`anypoint-cli-v4\` covers accounts, API Manager, Design Center, governance, CloudHub and more. Examples:
- \`api-mgr:api:promote\` with \`--copyPolicies\`, \`--copyTiers\` and \`--copyAlerts\`.
- \`api-mgr:contract:list\`.
- \`api-mgr:api:autodiscovery\` lists the properties a gateway needs.
- \`governance:api:validate\` checks a spec against rulesets.

Authenticate with a **connected app**. Its client ID and secret can be in a configuration file, environment variables or command-line flags, in that increasing order of priority.

The platform also offers REST APIs, such as the Exchange API, Runtime Manager REST services and the Anypoint Monitoring Metrics API. A connected app gets a bearer token from \`/accounts/api/v2/oauth2/token\`, limited to its scopes, business groups and environments. API Manager control plane endpoints have rate limits per client IP and return 429 when exceeded, so scripts should back off.
`,
  followUps: [
    {
      q: 'Is the Distributed option of a rate-limiting policy useful on a server group?',
      a: 'No. Quotas are shared only in a Mule HA cluster. On a server group, each node enforces the quota on its own.',
    },
    {
      q: 'Which alerts can be set for hybrid servers?',
      a: 'Runtime Manager offers server CPU, memory, load average (not on Windows) and thread count, plus connection events for servers, groups and clusters, such as Server disconnected and Cluster presents visibility issues.',
    },
    {
      q: 'Can anyone switch off a Runtime Manager alert?',
      a: 'Yes. The docs say all users of Anypoint Platform, even those without permission to create alerts, can switch an alert on or off, and the change applies to everyone who receives it.',
    },
    {
      q: 'Where do CloudHub 2.0 and Runtime Fabric fit?',
      a: 'They are other deployment targets in Runtime Manager. Server groups and clusters are for hybrid and Private Cloud Edition servers.',
    },
  ],
}
