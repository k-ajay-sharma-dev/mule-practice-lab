export default {
  id: 'ms-120',
  category: 'mulesoft',
  title: 'Sizing CloudHub 1.0 Workers: vCores, Heap, Disk, Ports and the 300-Second Idle Timeout',
  level: 'INTERMEDIATE',
  tags: ['cloudhub', 'deployment', 'workers', 'vcores', 'sizing', 'load-balancer'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'The claims intake API runs on one 0.1 vCore worker. It is fast at start-up and during occasional bursts, but response times are uneven under the steady daytime load. What do the docs say about this size?',
      options: [
        '0.1 and 0.2 vCore workers give limited CPU and I/O and can only burst for a short time; workers with 1 or more vCores provide performance consistency',
        '0.1 vCore workers are throttled only during the first hour after deployment',
        'All worker sizes have identical CPU, and only the memory differs',
        'Bursting is permanent as long as the worker has spare heap',
      ],
      answer: 0,
      explain: 'Bursting helps start-up times and infrequent, large workloads. It is not sustained capacity, so a steady load that needs consistent performance belongs on 1 vCore or more.',
    },
    {
      type: 'match',
      prompt: 'Match each CloudHub 1.0 worker size to its heap memory.',
      pairs: [
        ['0.1 vCores', '500 MB heap'],
        ['0.2 vCores', '1 GB heap'],
        ['1 vCore', '2 GB heap'],
        ['2 vCores', '4 GB heap'],
      ],
      explain: 'Heap is about half of the worker memory: a 1 vCore worker has 4 GB of memory and 2 GB of heap, while a 0.1 vCore worker has 1 GB and 500 MB.',
    },
    {
      type: 'single',
      prompt: 'The document rendering app writes large temporary files and logs verbosely on a 0.2 vCore worker, and storage is the constraint. What is the documented way to get more disk?',
      options: [
        'Use a worker with two or more vCores: 0.1, 0.2 and the 1 vCore worker stop at 8 to 12 GB, while 2 vCores gives 40 GB',
        'Add a second 0.2 vCore worker, because the disks of all workers are pooled',
        'Raise the disk size in the application properties',
        'Enable persistent queues, which moves local files off the worker',
      ],
      answer: 0,
      explain: 'Disk comes with the worker size, and about 3.0 GB of the minimum 8 GB goes to the OS and Mule components. The docs name verbose logging as a reason to move to two or more vCores.',
    },
    {
      type: 'single',
      prompt: 'A developer sets `http.port=9090` in `mule-app.properties` and points the HTTP Listener at `localhost:9090`. What should the listener use on CloudHub 1.0?',
      options: [
        'Host `0.0.0.0` and the reserved property `${http.port}` (or `${https.port}` for HTTPS); other values in mule-app.properties are overwritten at deployment',
        'Host `localhost` and any port above 1024, which the load balancer discovers',
        'Host `0.0.0.0` and port 80, because the load balancer forwards port 80 unchanged',
        'Host `0.0.0.0` and `${http.port}` with HTTPS, since the two reserved ports are interchangeable',
      ],
      answer: 0,
      explain: 'The worker is assigned `http.port` 8081 and `https.port` 8082, and the load balancer forwards 80 and 443 to them. Forwarded traffic keeps its protocol, so an HTTPS listener cannot sit on `${http.port}` here.',
    },
    {
      type: 'single',
      prompt: 'A synchronous reconciliation call sends no data for six minutes while the app works, then the client sees the connection closed. What is the documented cause and advice?',
      options: [
        'The load balancer closes both connections after 300 seconds with no data on either one; handle work that long asynchronously',
        'The worker restarts any request after 300 seconds',
        'The HTTP Listener has a hard limit of 60 seconds on 1 vCore workers',
        'The shared load balancer has returned 429 because the request is too slow',
      ],
      answer: 0,
      explain: 'The load balancer holds one connection from the client and one to the worker, with a 300-second idle timeout. Accepting the request, returning a reference and finishing the work asynchronously avoids it.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about CloudHub 1.0 workers and vCores are correct?',
      options: [
        'Only running applications count toward worker usage',
        'If not enough vCores are available you can create the application, but you cannot start it until vCores become available',
        'Calling `mule-worker-internal-myapp.region.cloudhub.io` works only from inside a customer Anypoint VPC, and it gives up the load balancing layer',
        'Zero-downtime restarts also work for durable subscribers, because both versions subscribe at once',
        'The internal HTTP and HTTPS ports default to 8091 and 8092 and can be changed per application',
      ],
      answer: [0, 1, 2],
      explain: 'A durable subscriber is a documented zero-downtime limitation, because only one unique subscriber can be active at a time. The defaults 8091 and 8092 cannot be changed.',
    },
  ],
  description: `
An insurer still runs 14 Mule applications on **CloudHub 1.0** and has a review of its vCore subscription next quarter. The platform lead asks you to look at three applications:

- **claims-intake-api**: 0.1 vCore, one worker, about 40 requests per second all day. Latency is uneven.
- **document-render**: 0.2 vCore, writes large temporary PDF files and logs verbosely. It runs short of disk.
- **reconciliation-api**: 1 vCore. One synchronous call takes up to six minutes and clients report dropped connections.

A new developer has also hard-coded \`localhost:9090\` in a listener, and another has proposed calling workers directly on their internal DNS names to "skip the load balancer".

**Questions**
1. What do the worker sizes give you, and how do you pick one for each application?
2. How must HTTP listeners be configured on CloudHub 1.0, and what are the DNS names for?
3. Why is the six-minute call dropped, and what is the fix?
4. How do vCore limits behave when the subscription is full?
`,
  answerTemplate: `## Worker sizing per application

## Listener ports and DNS records

## The six-minute call

## vCore limits
`,
  keyPoints: [
    'Worker sizes run from 0.1 to 16 vCores; each has fixed memory, heap and disk (1 vCore: 4 GB memory, 2 GB heap, 12 GB disk).',
    '0.1 and 0.2 vCore workers have limited CPU and I/O and only burst briefly; 1 vCore and above give consistent performance.',
    'Each worker has at least 8 GB of storage, with about 3.0 GB used by the OS and Mule; more storage means two or more vCores.',
    'Listeners use host 0.0.0.0 and ${http.port} (8081) or ${https.port} (8082); other values are overwritten at deployment.',
    'The load balancer idle timeout is 300 seconds on each connection; longer work should be asynchronous.',
    'Only running apps use vCores; an app can be created but not started when none are free.',
  ],
  solution: `
**1. Sizing.**

| Size | Memory | Heap | Disk |
|---|---|---|---|
| 0.1 vCores | 1 GB | 500 MB | 8 GB |
| 0.2 vCores | 2 GB | 1 GB | 8 GB |
| 1 vCore | 4 GB | 2 GB | 12 GB |
| 2 vCores | 8 GB | 4 GB | 40 GB |
| 4 vCores | 16 GB | 8 GB | 88 GB |

- **claims-intake-api**: steady load needs consistent performance, so move to 1 vCore. Bursting on 0.1 vCore suits start-up and infrequent large workloads, not all-day traffic.
- **document-render**: the problem is disk, so move to 2 vCores (40 GB) and reduce the verbose logging.
- **reconciliation-api**: size is not the issue here.

**2. Listeners and DNS.** Use host \`0.0.0.0\` with \`$\{http.port}\` or \`$\{https.port}\`. Each app gets these records:
- \`myapp.region.cloudhub.io\`: the load balancer; ports 80 and 443 forward to the worker.
- \`mule-worker-myapp.region.cloudhub.io\`: the external IP of the workers.
- \`mule-worker-internal-myapp.region.cloudhub.io\`: the internal IP, reachable only inside a customer Anypoint VPC, on \`$\{http.private.port}\` and \`$\{https.private.port}\` (8091 and 8092).

Calling workers directly loses the load distribution of the CloudHub load balancing layer, so it is not a free optimisation.

**3. The six-minute call.** The load balancer keeps one connection from the client and one to the worker. If no data moves on either for 300 seconds it closes both. Accept the request, return a reference, do the work asynchronously and let the client poll or receive a callback.

**4. vCore limits.** Only running applications count. If the subscription lacks vCores you can create an application but not start it until you stop another application or increase the allocation.
`,
  followUps: [
    { q: 'Is a bigger worker always better than two smaller ones?', a: 'No. More workers give availability and spread requests round robin, while a bigger worker gives heap, disk and consistent CPU. Choose from the constraint: two workers do not pool their disk or heap.' },
    { q: 'What happens to the metaspace on CloudHub 1.0?', a: 'The docs state the metaspace limit is currently unlimited regardless of worker size, with an initial size of 128 MB. Garbage collection of metaspace begins after it reaches that threshold.' },
    { q: 'Can autoscaling fix the sizing for you?', a: 'Only for organizations entitled to it: it needs an Enterprise License Agreement and is not available for Usage-based Pricing organizations. Policies have a maximum of 4 workers and 16 vCores worker size.' },
  ],
}
