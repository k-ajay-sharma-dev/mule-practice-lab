export default {
  id: 'inc-192',
  category: 'incidents',
  title: 'A Second App on the Same Mule Server Fails to Start: Both Listen on Port 8081',
  level: 'BEGINNER',
  tags: ['http-listener', 'ports', 'deployment', 'on-premises', 'domains'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '2026-11-18 09:12:01 INFO  [mule] Deploying app returns-api-1.0.0', relevant: false },
      { text: '2026-11-18 09:12:07 ERROR [returns-api] Could not create server for 0.0.0.0:8081: Address already in use', relevant: true, why: 'Another process already listens on 8081 on this server.' },
      { text: '2026-11-18 09:12:07 ERROR [mule] Failed to deploy returns-api-1.0.0', relevant: true, why: 'The app cannot start without its listener.' },
      { text: '2026-11-18 09:12:20 INFO  [orders-api] GET /orders/88120 200 durationMs=41', relevant: true, why: 'orders-api is running on the same server and serving traffic, so it holds the port.' },
      { text: '2026-11-18 09:13:00 INFO  [mule] Heartbeat ok', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does returns-api fail to start?',
        options: [
          'orders-api already listens on port 8081 on the same server, and two separate listener configs cannot bind one port',
          'Port 8081 is blocked by the firewall',
          'returns-api has a RAML error',
          'The server has no memory left',
        ],
        answer: 0,
        explain: 'On one server, one process owns a port. The second app tries to open the same port and the operating system refuses.',
      },
      {
        type: 'single',
        prompt: 'Is orders-api affected?',
        options: ['No, it keeps its port and serves traffic', 'Yes, it stops too', 'Yes, it moves to another port', 'It restarts'],
        answer: 0,
        explain: 'The log shows orders-api answering normally. Only the new app failed.',
      },
      {
        type: 'multi',
        prompt: 'Which are good fixes?',
        options: [
          'Give returns-api its own port from a property, such as 8082, and update the load balancer',
          'Put both apps in a domain project with one shared listener config, with different base paths',
          'Stop orders-api while returns-api runs',
          'Change orders-api to the same base path',
        ],
        answer: [0, 1],
        explain: 'Each app needs its own port, or both must share one listener through a domain. Stopping orders-api trades one outage for another.',
      },
      {
        type: 'single',
        prompt: 'Why did this work on CloudHub but not here?',
        options: [
          'On CloudHub each app runs on its own replica, so each can use the same port. Here two apps share one server',
          'CloudHub has no ports',
          'CloudHub ignores listener configs',
          'It was luck',
        ],
        answer: 0,
        explain: 'Each CloudHub app has its own runtime. On a shared on-premises server, apps compete for ports.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm which process holds the port',
          'Choose a free port or a shared domain listener',
          'Set the port from a property per server',
          'Redeploy returns-api and update the load balancer',
          'Keep a port register for each shared server',
        ],
        explain: 'Find the owner, pick the fix, make it configurable, deploy, then stop the next clash.',
      },
    ],
  },
  description: `
## Symptoms
- \`returns-api\` deploys fine to CloudHub, but fails on the on-premises Mule server it now shares with \`orders-api\`.
- \`orders-api\` keeps working.

## Change / Context
- Both apps were built from the same project template with an HTTP Listener on port 8081.
- The on-premises server runs several apps in one Mule runtime.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:12:07 ERROR [returns-api] Could not create server for 0.0.0.0:8081: Address already in use
2026-11-18 09:12:07 ERROR [mule] Failed to deploy returns-api-1.0.0
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Two separate listener configs cannot bind one port on one server.',
    'The first app keeps working. Only the new one fails.',
    'Set the port from a property, so each server can choose.',
    'A domain project lets apps share one listener with different paths.',
    'CloudHub replicas each have their own port space, a shared server does not.',
    'Keep a register of ports on shared servers.',
  ],
  solution: `
**Diagnosis.** Both apps declare an HTTP Listener on 8081. \`orders-api\` started first and owns the port, so \`returns-api\` cannot bind it.

**Immediate mitigation.** Deploy \`returns-api\` with another port, such as 8082, and point the load balancer route at it.

**Root cause.** The template hard coded 8081, which is fine where each app has its own runtime but clashes on a shared server.

**Permanent fix.**
- Read the port from a property such as \`\${http.port}\`, set per server.
- Or move shared listener settings into a domain project, so the apps share one listener and differ by base path.

**Prevention.** A port register for each shared server, and a deployment check that the chosen port is free.
`,
  followUps: [
    { q: 'What is a domain project for?', a: 'It holds shared resources, such as a listener config, that several apps on the same runtime can use.' },
    { q: 'How do you find which process holds a port?', a: 'Use the operating system tools, such as netstat or lsof, on the server.' },
    { q: 'Why did tests not catch it?', a: 'Tests ran each app alone. The clash appears only when two apps share a server.' },
    { q: 'Should every app use the same port on CloudHub?', a: 'On CloudHub the platform sets the port through a property. Keep reading it from that property.' },
  ],
}
