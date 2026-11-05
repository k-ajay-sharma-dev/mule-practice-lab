export default {
  id: 'ms-115',
  category: 'mulesoft',
  title: 'API Visualizer (Formerly Anypoint Visualizer): Layers, Views, Policy Compliance and What the Graph Leaves Out',
  level: 'INTERMEDIATE',
  tags: ['observability', 'api-visualizer', 'api-management', 'api-manager', 'api-led', 'application-network', 'governance'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      detail: true,
      needsScenario: true,
      prompt: 'Match each need to the visualization.',
      pairs: [
        ['Export a diagram of the network for a design review, with no metrics', 'Architecture'],
        ['Find which connection has a high failure rate', 'Troubleshooting'],
        ['See which APIs do not have the policies InfoSec requires', 'Policies'],
      ],
      explain: 'API Visualizer has three visualizations. Architecture shows topology, Troubleshooting shows health and performance, and Policies shows the policy landscape.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Two apps are known to depend on each other, but no connection appears between them. The dependent batch runs once a month. What is the likely reason?',
      options: [
        'Connections are based on traffic in the last seven days, so a monthly call has no active edge most of the time',
        'API Visualizer shows only synchronous calls',
        'Monthly jobs must be registered by hand',
        'The apps must be in the same layer',
      ],
      answer: 0,
      explain: 'Edges are active, meaning that there has been traffic in the past seven days. The graph is built from real traffic, so it is not a complete design document.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A pipeline should place every app in its API-led layer automatically. How?',
      options: [
        'Set the application property `anypoint.platform.visualizer.layer` at deployment',
        'Set the layer as a server property in Runtime Manager',
        'Add the layer to the spec in Exchange',
        'Name the app with a sys-, prc- or exp- prefix, which sets the layer',
      ],
      answer: 0,
      explain: 'This is an application property, not a server property. The node appears in that layer, and the layer is created if it does not exist. The UI cannot then reassign the node.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'After a redeployment, an app node shows no inbound connections for a while. Why?',
      options: [
        'Redeploying removes all metadata collected for that app, and the inbound connection count resets',
        'Redeployment moves the app to another environment',
        'The Visualizer Editor permission expired',
        'Inbound connections are shown only for APIs',
      ],
      answer: 0,
      explain: 'The set-up page states this. New traffic rebuilds the picture.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'All consumers of an API appear under one **External Traffic** node. The team wants to see them by client application. What is needed?',
      options: [
        'The target must have the Client ID Enforcement policy, so that the ClientId can be detected',
        'Each consumer must be deployed to CloudHub',
        'Each consumer must add a custom tag',
        'The API must be in the Policies visualization',
      ],
      answer: 0,
      explain: 'When ClientId is detected, consumer nodes are grouped by it; otherwise they are grouped under External Traffic. The target must have the Client ID Enforcement policy.',
    },
    {
      type: 'single',
      prompt: 'API Visualizer builds a live graph of apps and APIs from real traffic. A product team wants a defined view, which is a saved set of environments, tags and services that others can open. Which permission does the person creating it need?',
      options: [
        'Visualizer Editor',
        'Read Applications',
        'View Policies',
        'Manage Policies',
      ],
      answer: 0,
      explain: 'Only users with the Visualizer Editor permission can create defined views. A defined view is visible to users who have access to the environments in it, and new services that match its environments and tags appear in it. Saving a view saves both its Production and Sandbox configurations. Read Applications is enough to see the graph, and View Policies or Manage Policies are relevant only to the Policy visualization. A private view cannot be deleted. It can be edited, renamed, discarded or exported as PNG.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Standalone Mule apps run on customer servers, but their connections do not render correctly. What do the docs require for standalone Mule?',
      options: [
        'The Anypoint Monitoring agent, with header injection enabled at the server level',
        'A public IP address for each server',
        'A CloudHub 2.0 private space',
        'Only a change in each app\'s pom.xml',
      ],
      answer: 0,
      explain: 'Header injection is needed so that deployments display the correct connections. It is set on the server, and so it affects all applications running there.',
    },
  ],
  description: `
A retailer has about 120 Mule apps on CloudHub, Runtime Fabric and standalone servers. The architecture board wants evidence that API-led rules are followed, and asks for these things:

1. A diagram of the real application network, grouped into Experience, Process and System layers, without showing performance numbers to outside auditors.
2. A list of APIs that do not have the policies InfoSec requires.
3. A way for the on-call engineer to see where the network is failing now.
4. A saved picture for each product team, so that nobody has to set filters every time.

Developers raise these complaints:
- Some layers were set by hand in the UI and are now wrong after a reorganisation.
- A monthly settlement job has no line to the bank adapter on the graph.
- All partners appear as one External Traffic node.
- Standalone apps show the wrong connections.

The team calls the product Anypoint Visualizer, but the docs now say API Visualizer.

**Questions**
1. How does the product build the graph, and what does it collect?
2. Which visualization serves each need?
3. How do layers, tags and views work, and how would you automate them?
4. Explain each complaint.
5. What are the limits of this graph as architecture evidence?
`,
  answerTemplate: `## How the graph is built

## Visualization per need

## Layers and views

## The complaints

## Limits of the graph
`,
  keyPoints: [
    'API Visualizer (formerly Anypoint Visualizer) builds a live graph of apps, APIs, proxies and the systems they call, with no prior configuration, from real traffic.',
    'Connections reflect traffic in the last seven days. An app in multiple workers appears as separate nodes.',
    'Three visualizations: Architecture (topology, no metrics), Troubleshooting (health and performance), Policies (overview and compliance modes).',
    'Assign layers with the application property anypoint.platform.visualizer.layer, or in the Architecture UI. A property-set layer cannot be changed in the UI.',
    'Defined views need the Visualizer Editor permission, which can be assigned only within the root organization. Private views belong to each user.',
    'ClientId grouping needs the Client ID Enforcement policy on the target; otherwise consumers group under External Traffic.',
    'Standalone Mule needs the Anypoint Monitoring agent and header injection, set at server level.',
    'Redeploying an app removes its collected metadata.',
  ],
  solution: `
**1. How the graph is built.** An embedded plugin discovers incoming and outgoing connections of Mule apps, APIs and proxies on CloudHub, standalone Mule and Runtime Fabric. It collects the IP address and URL (without parameters) of incoming requests, and the URL (without parameters) and some header values of outgoing requests. Outbound activity can be seen for Salesforce, HTTP/HTTPS, Database and Mule 4 extension connectors.

Consumers (only outbound connections) are at the top, and backends (only inbound connections) are at the bottom. Connections reflect traffic in the last seven days.

**2. Visualization per need.**
- Diagram with no metrics → **Architecture**. It can be exported as PNG.
- Missing policies → **Policies**. **Overview** mode shows the number of policies on each API. **Compliance** mode shows which APIs have the policies you select: a fraction means partly compliant, and green means all selected policies apply. Policy data comes from API Manager.
- Where it fails now → **Troubleshooting**. Metrics are average response time, throughput, failure rate, CPU and memory, shown on nodes and, where supported, on connections. It links to logs and dashboards, but these buttons are not available for apps on CloudHub 2.0. It is also not available on the Canada and Japan control planes.
- A saved picture per team → **defined views**.

**3. Layers and views.** A layer groups nodes on the canvas, in every view and visualization. Use the default layers or create custom ones. For automation, set \`anypoint.platform.visualizer.layer\` as an **application** property at deployment, through Runtime Manager, Maven or the API. If the layer does not exist, it is created.

**Tags** help you filter. A **defined view** saves environments, tags and selected services, and it picks up new services that match. It needs the Visualizer Editor permission, which can be assigned only within the root organization. Other users with access to the environments see it in their list. A **private view** is personal and cannot be deleted.

**4. The complaints.**
- Wrong layers: set the property in the pipeline for each app. Then the layer follows the code, and the UI can no longer change it.
- Monthly job: no traffic in seven days, so no active edge. This is expected.
- External Traffic: apply Client ID Enforcement on the target. Client app names then replace the IDs, and client apps that call the same app are grouped into one node.
- Standalone apps: install the Anypoint Monitoring agent and enable header injection on the server, with \`anypoint.platform.config.analytics.agent.header_injection.disabled=false\`. On older agents this is off by default. This setting affects all apps on that server, and the agent may have a performance impact.

**5. Limits of the graph.** It shows traffic, not intent. Rarely used paths disappear. Unsupported connectors do not appear as outbound connections, and metadata resets on redeploy. Use it to check the design, and keep the design record elsewhere. To see the graph, a user needs only **Read Applications**; **View Policies** or **Manage Policies** is relevant only to the Policy visualization.
`,
  followUps: [
    {
      q: 'Can you reduce the performance impact?',
      a: 'Yes. On CloudHub you can disable the Anypoint Monitoring agent for an app from the API Visualizer settings. On standalone Mule and Runtime Fabric you can disable header injection, or on standalone disable data collection for a whole server, which also disables monitoring for its apps.',
    },
    {
      q: 'Why does an app appear twice?',
      a: 'The overview says that if an application appears in multiple workers, it appears as distinct nodes in the graph.',
    },
    {
      q: 'Does the Application Network tab in Anypoint Monitoring need a higher tier?',
      a: 'In the usage-based packages, that tab is an Advanced feature. The API Visualizer product itself is listed as available to all core-based tiers: Gold, Platinum and Titanium.',
    },
    {
      q: 'Does the Policies visualization show automated policies?',
      a: 'Yes. In a node\'s card, policies are listed in the order they apply, and each is shown as applied at the API level or as an automated policy.',
    },
  ],
}
