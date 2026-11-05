export default {
  id: 'inc-142',
  category: 'incidents',
  title: 'S3 Archive App Stops Responding After an AWS Service Role Is Enabled: Regional STS Blocked at the Private Space Firewall',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'aws', 's3', 'firewall', 'egress', 'private-space'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-08-11 10:05:33 INFO  [audit] private space prod-ap: AWS service role enabled, role name generated', relevant: true, why: 'The app moved from access keys to the service role, so it now depends on STS through the AWS SDK.' },
      { text: '2026-08-11 10:06:10 INFO  [firewall] outbound rules: HTTPS 443 to 10.0.0.0/8, TCP 1521 to 10.20.0.0/16 (no rule for internet destinations)', relevant: true, why: 'Tightened outbound rules leave no path to public AWS endpoints.' },
      { text: '2026-08-11 10:22:47 INFO  [deploy] doc-archive 2.4.0 STARTED, 2 replicas, property sts.endpoint=https://vpce-0a1b.sts.ap-southeast-2.vpce.amazonaws.com', relevant: true, why: 'The team set a custom STS endpoint in the app. The docs say the SDK credential provider ignores such settings.' },
      { text: '2026-08-11 10:23:15 ERROR [doc-archive] S3 connectivity test failed: unable to reach sts.ap-southeast-2.amazonaws.com:443 (connect timed out)', relevant: true, why: 'The SDK is calling the public regional STS endpoint, despite the custom setting.' },
      { text: '2026-08-11 10:24:02 WARN  [claims-portal] POST doc-archive/v1/documents timed out after 30000 ms', relevant: true, why: 'The docs state that applications stop responding when this connectivity is blocked.' },
      { text: '2026-08-11 10:25:00 INFO  [health] GET /api/health 200 (2 ms) replica doc-archive-5d9c', relevant: false },
      { text: '2026-08-11 11:40:18 INFO  [audit] App-level rule group grp-aws added: HTTPS to sts.ap-southeast-2.amazonaws.com', relevant: true, why: 'This attempted fix uses a layer the docs say does not support STS, and it cannot get past the private space firewall anyway.' },
      { text: '2026-08-11 11:45:51 INFO  [sys-oracle-claims] SELECT claim_status OK (12 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'With an AWS service role, the SDK credential provider always uses the public regional STS endpoint, and the private space firewall does not allow outbound traffic to it',
          'The IAM role name is wrong, so AWS returns 403 for each request',
          'The S3 bucket is in another region',
          'The custom `sts.endpoint` property is misspelt',
        ],
        answer: 0,
        explain: 'The docs say that when the service role is enabled, the cluster injects variables such as `AWS_STS_REGIONAL_ENDPOINTS=regional`, and the credential provider ignores custom STS endpoint settings in the Mule application. A blocked endpoint fails connectivity tests, and applications stop responding.',
      },
      {
        type: 'single',
        prompt: 'What is the documented fix if security accepts outbound access to the endpoint?',
        options: [
          'Allow outbound HTTPS on port 443 to the regional STS endpoint in the private space firewall rules, and do not use an application-level egress rule for STS',
          'Add `sts.ap-southeast-2.amazonaws.com` to an application-level egress rule group only',
          'Add `amazonaws.com` as an internal DNS domain',
          'Give the app a second AWS service role',
        ],
        answer: 0,
        explain: 'Application-level egress rules do not support AWS STS regional endpoints: the STS domain uses a 30-second TTL, and such rules can cause intermittent connection failures. Also, `amazonaws.com` is not allowed as an internal DNS domain, and each private space supports only one AWS service role.',
      },
      {
        type: 'single',
        prompt: 'Security refuses to open access to the public STS endpoint. What workaround do the docs give?',
        options: [
          'Set `AWS_ENDPOINT_URL` for the app to the STS endpoint URL, in Settings > Properties, then redeploy or restart',
          'Set `AWS_STS_REGIONAL_ENDPOINTS=legacy` in the Mule XML',
          'Disable the service role and hard-code access keys in the JAR',
          'There is no workaround',
        ],
        answer: 0,
        explain: 'An application property or environment variable makes the SDK use that URL. A value set only in a connector configuration was already shown to be ignored.',
      },
      {
        type: 'multi',
        prompt: 'Which statements belong in the review after the incident?',
        options: [
          'Outbound rules were tightened without listing the AWS SDK dependency on STS',
          'Connectivity for a new service role should be tested before production',
          'Allowing HTTPS to S3 through an application-level rule group is also a poor idea, because S3 regional endpoints are named as low-TTL domains to avoid',
          'A passing health check did not prove that the S3 path worked, so the health check should be improved',
          'Private space firewall rules should be removed to prevent this',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The firewall is doing its job. The gap is that a required destination was not in the design.',
      },
    ],
  },
  description: `
## Symptoms
- Tuesday 10:23: after a release, \`doc-archive\` fails its S3 connectivity test on the Amazon S3 Connector.
- Calls from \`claims-portal\` to \`doc-archive\` time out, and the app stops responding to upload requests. Its simple health endpoint still returns 200.
- Other apps in the private space are healthy.

## Change / Context
- Private space \`prod-ap\` is in Sydney (\`ap-southeast-2\`). To stop using long-lived access keys, the team enabled the **AWS service role** on the Advanced tab and created the matching role in AWS.
- Last month, security replaced the default outbound rules with rules for internal ranges only.
- A developer knew that public AWS endpoints were blocked, so she set a custom STS endpoint in the app, pointing to a private endpoint.
- At 11:40, after the outage began, a colleague added an application-level egress rule for the STS domain.

## Logs
\`\`\`
10:05:33 INFO  [audit] private space prod-ap: AWS service role enabled
10:06:10 INFO  [firewall] outbound rules: HTTPS 443 to 10.0.0.0/8, TCP 1521 to 10.20.0.0/16
10:22:47 INFO  [deploy] doc-archive 2.4.0 STARTED, property sts.endpoint=https://vpce-0a1b...
10:23:15 ERROR [doc-archive] S3 connectivity test failed:
         unable to reach sts.ap-southeast-2.amazonaws.com:443 (connect timed out)
10:24:02 WARN  [claims-portal] POST doc-archive/v1/documents timed out after 30000 ms
11:40:18 INFO  [audit] App-level rule group grp-aws added: HTTPS to sts.ap-southeast-2.amazonaws.com
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
    'Each private space supports one AWS service role, and outbound port 443 must be allowed to use it.',
    'With the service role enabled, the SDK credential provider ignores custom STS endpoint settings in the Mule app and uses the public regional STS endpoint.',
    'If the firewall blocks that endpoint, connectivity tests for the S3 Connector and other AWS SDK-based connectors fail, and applications stop responding.',
    'Allow outbound HTTPS 443 to the regional STS endpoint in private space firewall rules.',
    'Do not use application-level egress rules for STS; they do not support that endpoint and can cause intermittent failures.',
    'Workaround: set AWS_ENDPOINT_URL for the app, then redeploy or restart.',
    'Avoid application-level rules for S3 regional endpoints, which have low TTLs.',
  ],
  solution: `
**Diagnosis.** The error names \`sts.ap-southeast-2.amazonaws.com\`, not the private endpoint the team configured. That matches the documented behaviour: the credential provider ignores custom STS settings in the application. The outbound rules show no path to that public endpoint.

**Immediate mitigation.**
- Remove the application-level rule for STS, since it does not fix the problem and can cause intermittent failures.
- With security approval, allow outbound HTTPS on 443 to the regional STS endpoint in the private space firewall rules.
- If approval is refused, set \`AWS_ENDPOINT_URL\` for the app in **Settings > Properties** to the permitted STS endpoint URL, apply and redeploy or restart.
- Retest the connector, then have \`claims-portal\` retry its failed uploads.

**Root cause.** The new service role added a hidden dependency on a public AWS endpoint, and the outbound rules did not allow it. The custom setting looked like a solution but has no effect on this credential provider.

**Permanent fix.** Record the STS requirement in the private space design, with the firewall rule or the \`AWS_ENDPOINT_URL\` setting as a standard. Check how S3 itself is reached: the same outbound rules apply to it, and S3 regional endpoints should not be handled through application-level rules.

**Prevention.**
- Test the role in a non-production private space with production-like firewall rules.
- Improve the health check so that it tests dependencies.
- Keep a list of outbound dependencies for each app.
- Include the Advanced tab in change reviews for the private space.
`,
  followUps: [
    { q: 'Does the service role replace the need for an IAM setup in AWS?', a: 'No. Use the unique role name that Anypoint Platform generates and the organization ID to configure the role in AWS. Role generation takes a few minutes.' },
    { q: 'Could the same problem affect other connectors?', a: 'Yes. The docs refer to the AWS S3 Connector and other AWS SDK-based connectors.' },
    { q: 'Why does the app report healthy while uploads fail?', a: 'The simple health endpoint only proves that the HTTP listener answers. It does not exercise the S3 dependency.' },
  ],
}
