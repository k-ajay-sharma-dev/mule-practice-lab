export default {
  id: 'ms-096',
  category: 'mulesoft',
  title: 'Runtime Fabric Installation Options, Ingress Templates and Resource Allocation',
  level: 'ADVANCED',
  tags: ['runtime-fabric', 'kubernetes', 'ingress', 'helm', 'resources', 'deployment'],
  estMinutes: 35,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each cluster to the installation method the docs describe for it.',
      pairs: [
        ['Amazon EKS, where the team wants a command-line install', '`rtfctl`'],
        ['VMware Tanzu, where only Helm-based management is supported at the runtime plane', 'Helm chart with `values.yml`'],
        ['Red Hat OpenShift', 'Kubernetes operator from OperatorHub'],
      ],
      explain: 'All three start by creating a Runtime Fabric in Runtime Manager to obtain the activation data. The `rtfctl` page also points larger deployments to Helm, so more resources can be allocated to the agent.',
    },
    {
      type: 'multi',
      prompt: 'Which items are real requirements before installing Runtime Fabric?',
      options: [
        'A provisioned, operational Kubernetes cluster on a supported version',
        'Worker nodes with the x86-64 architecture',
        'VM-based nodes, so Fargate does not qualify',
        'An ingress controller of your own to send external requests to apps',
        'Docker and Kubernetes supplied by the Runtime Fabric installer',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Kubernetes and Docker are not included: you provide them. ARM-based nodes are not supported.',
    },
    {
      type: 'single',
      prompt: 'Why must `spec.ingressClassName` in an ingress resource template start with `rtf-`, for example `rtf-nginx`?',
      options: [
        'The prefix marks the object as a template, consumed only by the Runtime Fabric agent and not by the actual ingress controller',
        'Ingress controllers only serve classes named `rtf-`',
        'It selects the Runtime Fabric version',
        'It is a naming convention with no effect',
      ],
      answer: 0,
      explain: 'Ingress controllers discover resources that use the vendor name, such as `nginx`. The template must also sit in the `rtf` namespace. The newer HTTP route template needs no such prefix.',
    },
    {
      type: 'single',
      prompt: 'An admin changes the base domain in the ingress template. Apps that are already deployed still use the old host. Why?',
      options: [
        'Ingress objects already created from the template are not updated; each app must be redeployed, removing the old endpoint and adding the new one',
        'The agent caches templates for 24 hours',
        'The new template failed Kubernetes validation',
        'Templates can only be changed by reinstalling Runtime Fabric',
      ],
      answer: 0,
      explain: 'A template guides future deployments. The same rule applies to HTTP route templates, which only affect resources created after the change.',
    },
    {
      type: 'single',
      prompt: 'A TLS certificate on a template is renewed. How do you get the new secret into all application namespaces without updating each one by hand?',
      options: [
        'Add the label `rtf.mulesoft.com/synchronized: "true"` to the secret in the agent namespace',
        'Run `rtfctl apply` once per application',
        'Redeploy every app, which copies the certificate',
        'Store the certificate in `values.yml`',
      ],
      answer: 0,
      explain: 'With the label, Runtime Fabric synchronizes the secret to application namespaces. Without it, you must manually update the secret in each namespace.',
    },
    {
      type: 'single',
      prompt: 'An app has `Reserved vCPU` 0.5 and `vCPU Limit` 1.0. How much CPU can it actually use?',
      options: [
        'Up to the vCPU limit or the amount of unreserved CPU on the worker node, whichever is less',
        'Always exactly 1.0',
        'Always exactly 0.5',
        'Any amount, because the limit only applies at startup',
      ],
      answer: 0,
      explain: 'Only the reserved amount is guaranteed. Setting reserved equal to limit gives the guaranteed model with no CPU contention; bursting competes for what is left on the node.',
    },
    {
      type: 'single',
      prompt: 'A developer moves an app from a CloudHub sizing guide and allocates memory on Runtime Fabric, expecting that full amount as heap. What should they plan for instead?',
      options: [
        'Runtime Fabric lists the total memory for the app, and available heap is approximately half of it',
        'All allocated memory is heap on both platforms',
        'Heap is a fixed amount regardless of allocation',
        'Heap is set by `Reserved vCPU`',
      ],
      answer: 0,
      explain: 'The two platforms describe memory differently: Runtime Fabric states total memory, and CloudHub describes minimum memory in terms of heap available to the app.',
    },
  ],
  description: `
A manufacturer's platform team will install Runtime Fabric on two clusters: Amazon EKS in AWS and Red Hat OpenShift in its factory data centre. About 30 Mule apps will move across, including several API proxies and a few memory-hungry transformation apps.

The team has these open items:

- Which installation method fits each cluster, and what do they need first?
- A security rule forbids pulling images directly from the internet at the factory.
- The team wants one wildcard domain, \`*.apps.example.com\`, for all apps with TLS, and wants app teams to pick hostnames themselves in Runtime Manager.
- App teams ask how to fill in the **Cores** and **Memory** sliders, and what \`Reserved vCPU\` and \`vCPU Limit\` really mean.
- One proposal is to give every app the minimum resources to fit more on the cluster.

**Questions**
1. Compare the installation options and list the prerequisites.
2. What does the factory rule change?
3. Explain ingress resource templates and HTTP route templates. How is TLS handled?
4. Explain vCPU and memory allocation, including what else consumes capacity on a worker node.
5. Respond to the "minimum resources for everything" proposal.
`,
  answerTemplate: `## Installation options

## Factory image rule

## Ingress and TLS

## Resource allocation

## Response to the minimum resources proposal
`,
  keyPoints: [
    'Install with rtfctl, Helm, or as a Kubernetes operator on OpenShift. Every route starts by creating a Runtime Fabric in Runtime Manager to get activation data.',
    'You provide a supported Kubernetes cluster on x86-64, VM-based nodes, and an ingress controller. Plan the network: outbound 443 from all nodes and the control-plane hostnames.',
    'Plan a local registry at installation: it needs a new instance, or an existing Helm-based one, the change is one-way, and it cannot serve the Runtime Fabric operator on OpenShift.',
    'Without an ingress resource template, you cannot add ingress endpoints at deployment. The template lives in the rtf namespace and uses an rtf- prefixed ingressClassName.',
    'HTTP route templates (httproutetemplates.rtf.mulesoft.com) also support OpenShift routes and the Gateway API, use {{ .ApplicationName }}-style placeholders, and are the recommended option.',
    'Template changes do not touch existing routing resources until redeployment. The synchronized label copies TLS secrets to application namespaces.',
    'Reserved vCPU is guaranteed; vCPU Limit is the burst ceiling on shared node CPU. Equal values give guaranteed performance. Available heap is about half of total memory.',
    'Each replica also has an Anypoint Monitoring sidecar, and Runtime Fabric runs its own services on worker nodes. Startup time rises sharply at low vCPU.',
  ],
  solution: `
**Installation options.**
| Option | Fits | Notes |
|---|---|---|
| \`rtfctl\` | EKS, EKS-A, AKS, GKE, OKE | Command-line tool. Always installs the latest agent version. The page points larger deployments to Helm |
| Helm | The same platforms, plus Tanzu, ACK and Rancher, which the overview limits to Helm-based management | \`values.yml\` with activation data and registry details; needs Helm 3 or later |
| Operator | Red Hat OpenShift editions | Installed from OperatorHub with manual approval; a separate page covers OpenShift routes |

For this estate, use Helm or \`rtfctl\` on EKS and the operator on OpenShift. Each one starts in Runtime Manager, where you create the Runtime Fabric and get the activation data. Helm and the operator also need a namespace and a Docker pull secret. Afterwards, insert the Mule license key, configure the ingress template and validate the installation.

Prerequisites: a supported Kubernetes version, x86-64 worker nodes, VM-based nodes, an ingress controller, and the ports and hostnames on the network configuration page. All nodes need outbound 443 for Anypoint Platform management, resource retrieval and monitoring. Use the node minimums in *Requirements and Limitations* as a floor, and size up for workload.

**Factory image rule.** Use a **local registry**, and plan it at installation: the docs support a new instance, or adding one to an existing Helm-based instance, and the change is one-way. On OpenShift the Runtime Fabric operator itself still comes from the Red Hat OperatorHub catalog, because a local registry cannot serve it, so check this with the security team early.

**Ingress and TLS.** Runtime Fabric supports any ingress controller that works in your cluster. You can configure ingress two ways.
- **Ingress resource template:** the admin applies a template in the \`rtf\` namespace with \`ingressClassName\` such as \`rtf-nginx\`. Runtime Fabric offers its hosts in Runtime Manager. At deployment it uses the template to create a corresponding ingress object in the cluster. The \`app-name\` placeholder keeps endpoint names unique.
- **HTTP route template** (\`httproutetemplates.rtf.mulesoft.com\`): recommended by the docs. It lists \`baseEndpoints\` and routing \`resources\`, works with Kubernetes ingress, OpenShift routes and the Gateway API, and uses \`{{ .Host }}\`-style placeholders. No \`rtf-\` prefix is needed. Non-standard resources may need a Role or RoleBinding for the agent service account.

Create the TLS secret in the \`rtf\` namespace and label it \`rtf.mulesoft.com/synchronized: "true"\` so it reaches application namespaces. Note that some controllers create a load balancer per app by default: the GKE controller does this, and AWS ALB does unless you use the \`group.name\` annotation.

**Resource allocation.**
- \`Reserved vCPU\`: guaranteed to the replica.
- \`vCPU Limit\`: the burst ceiling, drawn from shared CPU on the node. Actual bursting is the lesser of the limit and the unreserved CPU on the node.
- Equal values give the guaranteed model, with no contention. Use it for latency-critical apps.
- **Memory:** Runtime Fabric states total memory, and available heap is approximately half of it.
- Cores and memory apply to **each** replica.
- Other consumers: each replica has an Anypoint Monitoring sidecar that cannot be disabled, and Runtime Fabric runs its own services on worker nodes. The allocation page gives baseline figures for both.

**Minimum resources proposal.** The allocation page gives minimum values, but it also shows approximate startup time rising from under a minute at 1 vCPU to many minutes at the minimum limit. It also warns that resource-intensive apps may fail to deploy at the minimum. Apps that load keystores need enough CPU too: the page has a table of certificates per core. Applications also compete for unallocated CPU, so packing a node tightly can hurt performance. Size from load tests, and use bursting deliberately, for example by placing nightly batch apps alongside apps that peak during the day.
`,
  followUps: [
    {
      q: 'Can several Runtime Fabric instances share a cluster?',
      a: 'Yes, the installation docs describe installing multiple instances on a single cluster, with separate pages for standard Kubernetes and OpenShift.',
    },
    {
      q: 'What should you check when an app is deployed but its endpoint does not answer?',
      a: 'Port-forward to the service on 8081 and curl it, check that the ingress and service exist in the app namespace, and read the agent logs if the service was not created. If the ingress exists but returns 404, check the rendered host and path and the listener port in the app logs.',
    },
    {
      q: 'Which ingressClassName does the AWS Load Balancer Controller need in a template?',
      a: 'The troubleshooting section says to specify spec.ingressClassName: rtf-alb in the template, so the controller can discover the deployed ingress resources.',
    },
    {
      q: 'If an HTTP route template and an ingress template have the same base endpoints, which wins?',
      a: 'The HTTP route template takes precedence, and the older ingress template serves as a fallback.',
    },
  ],
}
