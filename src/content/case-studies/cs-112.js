export default {
  id: 'cs-112',
  category: 'case-studies',
  title: 'Logistics Group Moving 45 On-Premises Mule Apps to Runtime Fabric',
  level: 'INTERMEDIATE',
  tags: ['runtime-fabric', 'migration', 'kubernetes', 'deployment', 'ci-cd', 'capacity-planning', 'logistics'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'Data must stay in the company data centres, and the platform team already runs Red Hat OpenShift there. Where do you run the Mule apps?',
      options: [
        'Runtime Fabric installed on the existing OpenShift clusters, managed from the Anypoint control plane',
        'CloudHub 2.0 shared space, with the data centre opened to the internet',
        'New standalone Mule servers, one per app, registered in Runtime Manager',
        'Docker containers built by the team with a Mule runtime inside, outside Runtime Fabric',
      ],
      answer: 0,
      explain: 'Runtime Fabric on self-managed Kubernetes keeps workloads and data on premises, reuses the platform team’s clusters, and keeps deployment, monitoring and API management in Anypoint. CloudHub moves workloads out of the data centre, more standalone servers repeat today’s problems, and home-made Mule containers are not a supported deployment model.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each part of the current standalone setup to how it is handled on Runtime Fabric.',
      pairs: [
        ['Two-server Mule cluster per app group', 'Two or more replicas per app, with clustering enabled where the app needs it'],
        ['Domain project with a shared HTTP listener', 'No domain projects: each app has its own listener, and ingress routes by host or path'],
        ['Object Store persisted on the server disk', 'Persistence gateway backed by a database'],
        ['Log files on each server, collected by a script', 'Log forwarding to the central logging platform, and Anypoint Monitoring'],
      ],
      explain: 'Runtime Fabric runs each app as its own set of containers. Domain projects are not supported, local disk is not durable, so object stores use the persistence gateway, and logs leave the container through forwarding.',
    },
    {
      type: 'single',
      prompt: 'Twelve apps poll a folder on the Mule server where the mainframe drops files over NFS. How do you handle them on Runtime Fabric?',
      options: [
        'Have the mainframe deliver to an SFTP server and change the apps to read with the SFTP connector, with one replica doing the polling',
        'Keep the File connector and point it at /data/in inside the container',
        'Copy the files into the container image during each build',
        'Run the apps with ten replicas so files are picked up faster',
      ],
      answer: 0,
      explain: 'Containers are replaced at any time and have no shared local folder, so a file must come from a network source. Polling several replicas without coordination reads the same file twice, so polling runs on one replica (primary node only) or uses locking.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to move one app.',
      items: [
        'Remove the domain dependency and local paths, and upgrade to a supported Mule 4 runtime',
        'Add the Runtime Fabric deployment settings (replicas, reserved and limit vCores, memory) to the CI pipeline',
        'Deploy to Runtime Fabric beside the standalone app and run the regression and load tests',
        'Switch the load balancer pool from the standalone servers to the Runtime Fabric ingress',
        'Keep the standalone app stopped but ready for two weeks, then remove it',
      ],
      explain: 'Fix what Runtime Fabric cannot run, automate the deployment, prove it beside the old app, switch traffic in one place, and keep a rollback path for a short period.',
    },
    {
      type: 'multi',
      prompt: 'Which three facts do you measure on the current servers before sizing each app on Runtime Fabric?',
      options: [
        'Peak CPU used by the app over a busy month',
        'Heap and total memory used at peak',
        'Peak requests or messages per second and their response time',
        'How many DataWeave scripts the app has',
      ],
      answer: [0, 1, 2],
      explain: 'Reserved CPU, the CPU limit, memory and replica count all come from measured load. The number of DataWeave scripts says nothing about the resources the app needs.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The platform team is worried that one busy app could starve the others on a shared node. What do you agree with them?',
      options: [
        'Each app gets reserved CPU and memory sized from measurements, with a CPU limit for bursts, and load tests prove the node capacity before each wave',
        'Every app gets the largest size available so none can be starved',
        'All apps share one replica to save capacity',
        'No limits at all, and Kubernetes will sort it out',
      ],
      answer: 0,
      explain: 'Reservations guarantee each app its share, limits cap bursts, and testing shows how many apps fit on a node. The largest size for every app wastes capacity, and no limits lets one app take a whole node.',
    },
  ],
  description: `
**Context.** A logistics group runs 45 Mule 4 apps on **standalone Mule servers** in two data centres: six servers per data centre, grouped in Mule clusters, with an F5 load balancer in front. The apps connect warehouses, a TMS, an Oracle ERP and an IBM mainframe.

**Problems**
- Servers are patched by hand twice a year; four servers are still on Mule 4.3.
- Apps share servers, so one memory leak last spring took down 11 apps.
- Adding capacity takes six weeks (order, install, register in Runtime Manager).
- Deployments are copied by a script that differs per data centre.

**Setup details**
- Three domain projects provide shared HTTP listeners and shared Oracle connection configs.
- Twelve apps poll an NFS folder mounted on the servers where the mainframe drops files.
- Eight apps use a persistent Object Store on local disk for idempotency and watermarks.
- Logs are files on each server, collected nightly by a script into Splunk.

**Decision so far.** Data must stay on premises. The platform team runs **Red Hat OpenShift** in both data centres and offers it as the standard for all containers.

**Constraints**
- Move all 45 apps within 9 months.
- No change to the URLs that warehouses and partners call.
- Capacity on OpenShift is charged back per reserved vCore.

**Your task.** Plan the move to Runtime Fabric: target setup, what must change in the apps, sizing, and the order of the move.
`,
  answerTemplate: `## Target Runtime Fabric setup

## Changes needed in the apps

## Sizing

## Waves and cutover

## Risks
`,
  keyPoints: [
    'Runtime Fabric on the existing OpenShift clusters in both data centres, managed from the Anypoint control plane.',
    'Domain projects are removed: each app gets its own HTTP listener and connection configs, and ingress routes by host or path.',
    'Local disk is not durable: NFS folder polling moves to SFTP, and persistent Object Stores use the persistence gateway.',
    'Each app is sized from measured CPU, memory and throughput, with reserved CPU, a CPU limit and at least two replicas for production.',
    'Apps move in waves through CI/CD with parallel running and a load balancer switch, so callers keep the same URLs.',
  ],
  solution: `
**Target.** One Runtime Fabric per data centre on OpenShift, with production and non-production separated (separate clusters or at least separate namespaces and nodes). Ingress uses the cluster's ingress controller with the company certificates. The F5 keeps the public hostnames and sends traffic to the ingress, so callers see no change.

**App changes.**
- Domain projects: move shared listeners and configs into each app; keep shared settings in a common parent POM and properties.
- File polling: the mainframe drops files on an SFTP server; apps read with the SFTP connector, polling on the primary node only.
- Object Store: enable the persistence gateway with a database, so watermarks and idempotency keys survive restarts.
- Logging: forward logs to Splunk from the containers; add correlation IDs.
- Runtime: upgrade to a supported Mule 4 version first.

**Sizing.** Measure peak CPU, memory and throughput for a month. Start with reserved vCores near average use, a limit near peak, two replicas in production. Load test each wave.

**Waves.** Wave 1: three low-risk internal apps to prove the setup. Then waves of about eight, System APIs before their callers, file-based apps after SFTP is ready. Each app runs on both platforms until the F5 pool is switched, with the old app kept for two weeks.

**Risks.** Hidden domain dependencies, the mainframe team's lead time for SFTP delivery, and charge-back costs if apps are oversized.
`,
  followUps: [
    { q: 'Why are domain projects a problem on Runtime Fabric?', a: 'Runtime Fabric deploys each app as its own containers, with no shared runtime to hold a domain. Shared listeners and configs must move into each app.' },
    { q: 'How does Runtime Fabric reduce the impact of one leaking app?', a: 'Each app has its own containers with memory limits. A leak restarts that app’s replica, while other apps keep their reserved resources.' },
    { q: 'Why keep the F5 in front?', a: 'Warehouses and partners call hostnames that resolve to the F5. Switching its pool to the ingress moves traffic without any caller changing a URL, and switching back is the rollback.' },
    { q: 'Why poll on the primary node only?', a: 'With several replicas, each would pick up the same file. Primary node polling, or a lock, makes one replica read each file once.' },
  ],
}
