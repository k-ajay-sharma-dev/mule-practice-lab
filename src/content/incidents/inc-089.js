export default {
  id: 'inc-089',
  category: 'incidents',
  title: 'Private-Space API Times Out From the Data Centre While Runtime Manager Shows Running',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'private-space', 'ingress', 'networking', 'vpn', 'deployment'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-02 08:01:10 INFO  [runtime] prc-stock-reservations: status RUNNING, 2 replicas STARTED', relevant: true, why: 'The app is up, so the fault lies between the client and the app.' },
      { text: '2026-11-02 08:03:42 ERROR [wms-gateway] POST http://prc-stock-reservations.internal-sxjsip.aus-s1.cloudhub.io:8081/api/reservations failed: connect timed out after 10000 ms', relevant: true, why: 'The client calls the internal endpoint on port 8081, which is the listener port, not a port on the internal load balancer.' },
      { text: '2026-11-02 08:03:50 INFO  [prc-stock-reservations] Oracle stock lookup via sys-stock-oracle OK (38 ms)', relevant: true, why: 'Mule to on-prem calls work, so the VPN path itself is carrying traffic.' },
      { text: '2026-11-02 08:05:02 WARN  [noc] ping 10.42.1.17: 100% packet loss', relevant: true, why: 'A misleading signal: ICMP ping is not a supported connectivity test for a private space.' },
      { text: '2026-11-02 08:05:30 INFO  [private-space] VPN dc1-primary: tunnel 1 UP, tunnel 2 UP', relevant: true, why: 'Both tunnels are up, which argues against a VPN failure.' },
      { text: '2026-11-02 08:06:15 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-02 08:09:44 INFO  [dc-firewall] ALLOW src=10.8.14.20 dst=10.42.1.17 dport=8081 proto=TCP (no reply seen)', relevant: true, why: 'The firewall passes the traffic, but nothing answers on that port.' },
      { text: '2026-11-02 08:14:12 INFO  [network-tools] Socket test prc-stock-reservations.internal-sxjsip.aus-s1.cloudhub.io:443 -> connected', relevant: true, why: 'Port 443 on the internal endpoint answers from inside the private space.' },
      { text: '2026-11-02 08:15:00 INFO  [scheduler] stock-snapshot run completed, 12,400 rows', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The client targets port 8081 on the internal endpoint, but the internal load balancer accepts traffic on port 443',
          'The VPN is down, as shown by the failed ping',
          'The app is not running',
          'Internal endpoints can only be reached from inside the private space, never over a VPN',
        ],
        answer: 0,
        explain: 'Internal endpoints are reachable from the private network, VPN or Transit Gateway, through a load balancer on 443. The docs list a port restriction as a common cause when traffic reaches the firewall but gets no response.',
      },
      {
        type: 'single',
        prompt: 'Why should the ping result not change your diagnosis?',
        options: [
          'ICMP ping is not a supported connectivity test, so a failed ping does not mean the application is down',
          'Ping only works on port 8081',
          'Ping works only from Runtime Manager',
          'A failed ping proves the tunnel is down',
        ],
        answer: 0,
        explain: 'Use the Network Tools application, whose socket test checks a real TCP connection.',
      },
      {
        type: 'single',
        prompt: 'What is the immediate fix?',
        options: [
          'Change the WMS gateway to call `https://prc-stock-reservations.internal-sxjsip.aus-s1.cloudhub.io/api/reservations`, then test one reservation',
          'Add an inbound firewall rule for port 8081 on the private space',
          'Re-create the external endpoint so the WMS can use the internet',
          'Restart both replicas',
        ],
        answer: 0,
        explain: 'Inbound ports under the platform\'s rules are 443 and 80 for HTTP traffic, and custom TCP is limited to 30500-32500. Opening the app to the internet would defeat the design.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix and prevention?',
        options: [
          'Publish a custom internal domain with a TLS context, with a CNAME to `internal-<space-id>.<region>.cloudhub.io`',
          'Document in the onboarding guide that clients use the endpoint URL, while `http.port` is only for the listener',
          'Run a Network Tools socket test as part of private-space connectivity checks',
          'Hard-code the listener to port 443 in the Mule app',
          'Add ping checks to the go-live runbook',
        ],
        answer: [0, 1, 2],
        explain: 'Apps must listen on `0.0.0.0` and `$\{http.port}`, a value MuleSoft allocates, so never hard-code the port. Ping is not a valid test.',
      },
      {
        type: 'order',
        prompt: 'Order the investigation steps.',
        items: [
          'Confirm in Runtime Manager that the app is running and replicas are started',
          'Check that the VPN tunnels are up and that Mule can already reach on-prem systems',
          'Compare the URL and port the client uses with the endpoints on the Ingress tab',
          'Run a Network Tools socket test against the internal endpoint on 443',
          'Correct the client URL and verify one real transaction',
        ],
        explain: 'Work from the app outwards. The endpoint shown in the Ingress tab is the truth, not a value copied from local development.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 08:00, first day of a migration: the warehouse system (WMS) cannot create stock reservations. Each call from its on-prem gateway fails with **connect timed out** after 10 seconds.
- Runtime Manager shows \`prc-stock-reservations\` as **Running** with 2 replicas started.
- No request appears in the Mule logs. A network engineer pings the app and gets 100% packet loss, and announces that the VPN is down.

## Change / Context
- The app moved to a CloudHub 2.0 private space on Friday. It connects to the data centre over an Anypoint VPN.
- For security the team deleted the external endpoint, so only the default internal endpoint remains.
- The WMS integration team was told the listener runs on 8081 and built the URL themselves:
  \`http://prc-stock-reservations.internal-sxjsip.aus-s1.cloudhub.io:8081/api/reservations\`
- Mule's own calls to the on-prem stock database work normally.

## Logs
\`\`\`
08:01:10 INFO  [runtime] prc-stock-reservations: status RUNNING, 2 replicas STARTED
08:03:42 ERROR [wms-gateway] POST http://prc-stock-reservations.internal-sxjsip.aus-s1
          .cloudhub.io:8081/api/reservations failed: connect timed out after 10000 ms
08:05:02 WARN  [noc] ping 10.42.1.17: 100% packet loss
08:05:30 INFO  [private-space] VPN dc1-primary: tunnel 1 UP, tunnel 2 UP
08:09:44 INFO  [dc-firewall] ALLOW src=10.8.14.20 dst=10.42.1.17 dport=8081 (no reply seen)
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
    'Running with no requests in the logs means traffic is not reaching the app: look at the path, not the code.',
    'Clients reach a private-space app through the load balancer, and the internal load balancer accepts traffic on port 443.',
    'The app listens on $\{http.port}, a value MuleSoft allocates; that is not a client-facing port.',
    'Internal endpoints work from the private network, VPN or Transit Gateway, and cannot be deleted.',
    'ICMP ping is not a supported test. Network Tools tests a real connection.',
    'Copy endpoints from the Ingress tab rather than building URLs by hand.',
  ],
  solution: `
**Diagnosis.** The app is running and healthy, and Mule's calls to on-prem succeed over the same VPN with both tunnels up, so the network path exists. The data-centre firewall allows the packets, but nothing answers on 8081. The Networking Architecture page gives this exact case: if traffic reaches the firewall but gets no response, a common cause is a port restriction, because the internal load balancer accepts traffic on port 443. The Network Tools socket test confirms that 443 answers.

**Immediate mitigation.**
- Copy the internal endpoint from the app's **Ingress** tab and update the WMS gateway to \`https://prc-stock-reservations.internal-sxjsip.aus-s1.cloudhub.io/api/reservations\`.
- Make sure the gateway's HTTP client trusts the certificate presented by the endpoint.
- Send one reservation and confirm it reaches the Mule logs, then let the WMS replay the failed calls.
- Tell the NOC that the VPN is fine.

**Root cause.** A client was built from knowledge of the app's listener rather than from its published endpoint. On CloudHub 2.0 the app listens on \`0.0.0.0\` and \`$\{http.port}\`, and the load-balancing service forwards traffic to it. Clients talk to the load balancer. A failed ping then sent the investigation in the wrong direction.

**Permanent fix.**
- Give consumers a stable name: a custom domain in a TLS context, with a CNAME to \`internal-<space-id>.<region>.cloudhub.io\`, and use it in the app's Ingress settings with internal access.
- Keep the external endpoint deleted, since clients only need private access.
- Update the integration guide with the correct URL pattern.

**Prevention.**
- Add a go-live step that tests each consumer path with a real transaction from the consumer's network.
- Deploy the **Network Tools** application in each private space, and use its socket test rather than ping.
- Document who owns each step: endpoint details from the platform team, firewall changes from the network team.
- Review the other common cause listed by the docs: a private-space network range that is not allowlisted on the connected network.
`,
  followUps: [
    { q: 'What would have been different with an HTTP listener bound to 127.0.0.1?', a: 'The load balancer could not reach the app, even on the right URL. The migration troubleshooting page says that surfaces as a 502, which is why apps must listen on 0.0.0.0.' },
    { q: 'Could a firewall rule on the private space cause a similar symptom?', a: 'Yes. Private space firewall rules control inbound traffic, and removing or narrowing the HTTPS rule blocks clients, so check the Firewall rules tab as part of the path review.' },
    { q: 'Why are there no entries in the Mule logs?', a: 'The connection never reached the load balancer listener, so the app received nothing. No app log is itself evidence that the problem is upstream of the app.' },
  ],
}
