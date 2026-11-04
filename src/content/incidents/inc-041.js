export default {
  id: 'inc-041',
  category: 'incidents',
  title: 'Containerised Mule Replicas Restart in a Loop Under Load',
  level: 'ADVANCED',
  tags: ['kubernetes', 'health-checks', 'replicas', 'performance', 'resilience'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '08:41:01.900 INFO  [stock-papi] GET /stock/SKU-221 200 (220 ms)', relevant: false },
      { text: '08:41:02.118 INFO  [stock-papi] GET /health -> calling erp-sapi /ping', relevant: true, why: 'The health check path calls downstream systems, including the ERP.' },
      { text: '08:41:09.902 INFO  [stock-papi] GET /health -> 200 (7784 ms)', relevant: true, why: 'At peak the ERP is slow, so the health check itself takes almost 8 s.' },
      { text: '08:41:32.004 WARN  [stock-papi] GET /health -> calling erp-sapi /ping (still waiting)', relevant: false },
      { text: '08:41:40.001 WARN  [kubelet] Liveness probe failed for pod stock-papi-7c9d...: context deadline exceeded; container will be restarted', relevant: true, why: 'The probe timed out, so the platform restarts a replica that could still serve traffic.' },
      { text: '08:41:40.510 INFO  [stock-papi] Application stopping', relevant: false },
      { text: '08:42:15.300 WARN  [stock-papi-5b1a] threads.busy=96% p95=4.1 s (single replica serving)', relevant: true, why: 'With one replica gone the other takes double load and slows down: a cascade towards its own restart.' },
      { text: '08:42:20.000 INFO  [scheduler] stock snapshot export completed', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why do replicas restart?',
        options: [
          'The liveness check calls slow downstream systems; at peak the probe times out and the platform restarts healthy replicas',
          'The replicas run out of memory',
          'Kubernetes restarts pods automatically every few minutes',
          'The ERP sends a shutdown signal',
        ],
        answer: 0,
        explain: 'A dependency slowdown fails the liveness probe. Restarts reduce capacity and the surviving replica degrades too.',
      },
      {
        type: 'single',
        prompt: 'What do you do **immediately**?',
        options: [
          'Point the health check to a trivial endpoint (200 if the app serves HTTP), redeploy and temporarily add replicas',
          'Increase the ERP timeout in /health to 60 s',
          'Disable health checks completely forever',
          'Restart the ERP',
        ],
        answer: 0,
        explain: 'Decouple the probe from dependencies and add capacity for the peak; a longer timeout keeps threads busy and still risks restarts.',
      },
      {
        type: 'match',
        prompt: 'Match each check to its purpose.',
        pairs: [
          ['Liveness', 'Should this instance be restarted? No external calls'],
          ['Readiness', 'Should this instance receive traffic right now?'],
          ['Deep health (/health/deep)', 'Dependency status for monitoring, with cached results'],
        ],
        explain: 'Only liveness drives restarts, so it must never depend on other systems.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in **prevention**?',
        options: [
          'Liveness/readiness/deep-health standard in the template project',
          'Load tests with a deliberately slowed dependency',
          'Alerts on replica restart count',
          'Add the database and every SAPI to the liveness probe for completeness',
        ],
        answer: [0, 1, 2],
        explain: 'Standards, fault-injection tests and restart alerts. Adding more dependencies to liveness repeats the incident.',
      },
    ],
  },
  description: `
## Symptoms
- \`stock-papi\` runs as a standalone Mule 4 runtime image on the company's own Kubernetes cluster with 2 replicas (pods). During the morning peak, \`kubectl get pods\` shows the pods **restarting** every few minutes, and clients see bursts of 502/503.
- After a restart the replica is fine for a while, then restarts again as load climbs.
- Off-peak, no restarts.

## Change / Context
- Two weeks ago a developer added a custom \`GET /health\` endpoint and configured it as the pod's **livenessProbe** path. The endpoint checks the DB, calls two downstream SAPIs and the ERP (each with a 10 s timeout) and returns 200 only if all succeed.
- At peak the ERP becomes slow (3–8 s per call). The health check probe timeout and failure threshold are short.

## Logs
\`\`\`
08:41:02.118 INFO  [stock-papi] GET /health -> calling erp-sapi /ping
08:41:09.902 INFO  [stock-papi] GET /health -> 200 (7784 ms)
08:41:32.004 WARN  [stock-papi] GET /health -> calling erp-sapi /ping (still waiting)
08:41:40.001 WARN  [kubelet] Liveness probe failed for pod stock-papi-7c9d...: context deadline exceeded; container will be restarted
08:41:40.510 INFO  [stock-papi] Application stopping
\`\`\`

## Your tasks
1. Why do replicas restart?
2. What do you do immediately?
3. How should health checks be designed?
4. How do you prevent this?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The liveness check depends on slow downstream systems; when they slow down, the probe times out and the platform kills a healthy replica.',
    'Restarts reduce capacity, increasing load on the other replica — a cascading failure that makes the outage worse.',
    'Immediate: point the health check to a lightweight endpoint (or remove downstream calls from it) and redeploy; scale out temporarily.',
    'Liveness = "is this process alive?" (no dependencies); readiness = "can I take traffic?" — deep dependency checks belong in monitoring, not liveness.',
    'Health endpoints must be cheap and fast, run on their own path, and never consume the same constrained resources as business traffic.',
  ],
  solution: `
## Diagnosis
The platform uses the health check to decide whether a replica is **alive**. The new \`/health\` does deep checks against the DB, two SAPIs and the ERP. At peak the ERP takes several seconds, so the probe exceeds its timeout; after a few failures the platform **restarts a replica that was actually fine**. With one replica down, the other gets double load, gets slower, and fails its probe too — a self-inflicted cascade. Off-peak the ERP is fast, so everything looks healthy.

## Immediate mitigation
Change the health check path to a trivial endpoint (returns 200 if the app can serve HTTP) and redeploy; temporarily add replicas to absorb the peak. Tell the ERP team about the slowness.

## Root cause
A liveness probe coupled to downstream dependencies. A dependency slowdown should degrade responses, not trigger restarts that remove capacity.

## Permanent fix
- **Liveness**: lightweight, no external calls.
- **Readiness/dependency status**: a separate endpoint (e.g. \`/health/deep\`) used by monitoring dashboards and alerts, with short timeouts and cached results, not by the platform restart logic.
- Short timeouts and circuit breaking on ERP calls so slowness does not exhaust threads.

## Prevention
- Design standard: liveness vs readiness vs deep health documented in the template project.
- Load test with a slowed dependency (fault injection) before releases.
- Alert on replica restart count.
`,
  followUps: [
    { q: 'What is the difference between liveness and readiness?', a: 'Liveness answers "should this instance be restarted?" and must not depend on others; readiness answers "should this instance receive traffic right now?" and can temporarily remove it from the load balancer without restarting.' },
    { q: 'Should a health check ever call downstream systems?', a: 'A deep health/status endpoint for monitoring can, ideally with cached results and short timeouts; the probe the platform uses to restart instances should not.' },
  ],
}
