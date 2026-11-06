export default {
  id: 'ms-200',
  category: 'mulesoft',
  title: 'Omni Gateway Choices: Managed or Self-Managed, Connected Mode or Local Mode',
  level: 'BEGINNER',
  tags: ['ai-agents', 'omni-gateway', 'api-manager'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A small retail team wants Omni Gateway but has nobody to run servers. It wants someone else to handle patches, scaling and availability. Which option fits?',
      options: [
        'Self-Managed Omni Gateway in Connected Mode',
        'Self-Managed Omni Gateway in Local Mode',
        'Managed Omni Gateway on CloudHub 2.0',
        'Mule Gateway inside a Mule application',
      ],
      answer: 2,
      explain: 'Managed Omni Gateway is hosted on CloudHub 2.0 or Runtime Fabric and managed by MuleSoft, so patching and scaling are not the job of the team. Self-Managed means your team runs the infrastructure.',
    },
    {
      type: 'single',
      prompt: 'A bank must install and run Omni Gateway itself, on its own Kubernetes cluster. Its API team still wants to apply policies through API Manager and manage the gateway through Runtime Manager. Which option fits?',
      options: [
        'Self-Managed Omni Gateway in Connected Mode',
        'Self-Managed Omni Gateway in Local Mode',
        'Managed Omni Gateway on CloudHub 2.0',
        'Managed Omni Gateway in Local Mode',
      ],
      answer: 0,
      explain: 'Installing and running it yourself means Self-Managed. Connected Mode keeps it fully connected to the control plane, so API Manager and Runtime Manager work through the UI. Connected Mode and Local Mode are choices within Self-Managed only.',
    },
    {
      type: 'single',
      prompt: 'A logistics company keeps all gateway settings in Git and rolls them out with its CI/CD pipeline as declarative files, on servers it runs itself. Which option fits?',
      options: [
        'Managed Omni Gateway on Runtime Fabric',
        'Self-Managed Omni Gateway in Connected Mode',
        'Managed Omni Gateway on CloudHub 2.0',
        'Self-Managed Omni Gateway in Local Mode',
      ],
      answer: 3,
      explain: 'Local Mode reads its configuration and policies from local declarative files, which suits a CI/CD pipeline. It is mostly disconnected from the control plane.',
    },
    {
      type: 'single',
      prompt: 'A warehouse network runs Self-Managed Omni Gateway in Local Mode. The firewall team asks why the gateway needs to reach the control plane at all. What is the right answer?',
      options: [
        'It checks each incoming request against the policies held in API Manager',
        'It connects only for registration and for sending usage metrics',
        'It downloads the policies that were applied in the API Manager UI',
        'It needs no connection at all, as Local Mode is fully disconnected',
      ],
      answer: 1,
      explain: 'Local Mode is mostly disconnected, not fully. Configuration and policies come from local files, and the gateway connects only for registration and usage metrics.',
    },
    {
      type: 'single',
      prompt: 'An HR team runs Self-Managed Omni Gateway in Local Mode. It now wants a Model Proxy, which is one governed endpoint for many large language model providers. What has to change?',
      options: [
        'Nothing, as a Model Proxy can be declared in the local files like an API',
        'A Model Proxy must run in a Mule app, so the team has to deploy one first',
        'It needs Managed Omni Gateway, or Self-Managed Omni Gateway in Connected Mode',
        'It needs Mule Gateway, as Omni Gateway has no support for Model Proxy at all',
      ],
      answer: 2,
      explain: 'Model Proxy is available on Managed Omni Gateway and on Self-Managed Omni Gateway in Connected Mode. So a choice of mode can decide which features you can use later.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The Omni Gateway overview page gives one name to each runtime unit of a Managed Omni Gateway, and another to each runtime unit of a Self-Managed Omni Gateway. What are the two names?',
      options: [
        'Replica for Managed, and gateway instance for Self-Managed',
        'Worker for Managed, and replica for Self-Managed',
        'Gateway instance for Managed, and node for Self-Managed',
        'Gateway instance for Managed, and replica for Self-Managed',
      ],
      answer: 3,
      explain: 'The overview calls a Managed runtime unit a gateway instance and a Self-Managed runtime unit a replica. Pages on Managed Omni Gateway also say replicas, so the word alone does not tell you which kind someone runs.',
    },
  ],
  description: `
Three teams at one company all want **Omni Gateway (formerly Flex Gateway)**.

- The **ecommerce team** has no one to run servers.
- The **banking team** must install and run the gateway itself on its own Kubernetes cluster, and likes working in the API Manager UI.
- The **warehouse team** runs its own servers and keeps every setting in Git, deployed by a CI/CD pipeline.

There are two decisions to make. First, who runs the infrastructure: **Managed** or **Self-Managed**? Second, for Self-Managed only, how closely is the gateway tied to the control plane: **Connected Mode** or **Local Mode**? The **control plane** is the MuleSoft hosted part where you add policies and monitor.

**Questions**
1. What is the difference between Managed and Self-Managed?
2. What is the difference between Connected Mode and Local Mode?
3. Which option fits each team?
`,
  answerTemplate: `## Managed and Self-Managed

## Connected Mode and Local Mode

## Which option fits each team
`,
  keyPoints: [
    'Managed Omni Gateway is hosted on CloudHub 2.0 or Runtime Fabric and managed by MuleSoft. Its unit is a gateway instance.',
    'Self-Managed Omni Gateway runs in your own environment, and you manage the infrastructure. Its unit is a replica.',
    'Connected Mode gives full UI management through API Manager and Runtime Manager.',
    'Local Mode is mostly disconnected and uses local declarative files, which suits CI/CD. It connects only for registration and usage metrics.',
    'Modes apply to Self-Managed only, and the choice can limit features: Model Proxy needs Managed, or Self-Managed in Connected Mode.',
  ],
  solution: `
**Managed or Self-Managed.** This decides who runs the infrastructure.

| | Managed | Self-Managed |
|---|---|---|
| Where it runs | CloudHub 2.0 or Runtime Fabric | Your own environment |
| Who manages it | MuleSoft | You |
| Runtime unit | Gateway instance | Replica |

**Connected Mode or Local Mode.** This choice exists for Self-Managed only.

| | Connected Mode | Local Mode |
|---|---|---|
| Link to the control plane | Fully connected | Mostly disconnected: registration and usage metrics only |
| Policies come from | API Manager | Local declarative files |
| Good for | Teams that work in the UI | CI/CD pipelines |

**The three teams**
- **Ecommerce:** Managed Omni Gateway, as it has nobody to run servers.
- **Banking:** Self-Managed in Connected Mode, as it needs its own cluster and the UI.
- **Warehouse:** Self-Managed in Local Mode, as its settings live in Git.

Before settling on Local Mode, check the features you need. For example, Model Proxy is not available there.
`,
  followUps: [
    {
      q: 'Can a Managed Omni Gateway run in Local Mode?',
      a: 'No. Connected Mode and Local Mode are the two ways to run Self-Managed Omni Gateway. Managed Omni Gateway is hosted and managed by MuleSoft.',
    },
    {
      q: 'Where do policies come from in Local Mode?',
      a: 'From local declarative files, not from API Manager. That is why it suits a pipeline that deploys from Git.',
    },
    {
      q: 'What can you ask before choosing a mode?',
      a: 'Who will run the infrastructure, whether the team wants the UI or files in Git, and whether every feature it needs is available in that mode.',
    },
  ],
}
