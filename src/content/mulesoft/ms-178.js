export default {
  id: 'ms-178',
  category: 'mulesoft',
  title: 'TLS and FIPS at Runtime Level: tls-default.conf, tls:context, BCFKS Keystores, Licences and the Cluster Encryption Key',
  level: 'EXPERT',
  tags: ['deployment', 'security', 'tls', 'fips', 'java', 'clustering', 'runtime-fabric', 'on-prem'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'The Mule admin has limited `$MULE_HOME/conf/tls-default.conf`. A developer sets `enabledProtocols` in a `tls:context` to a protocol that the file does not include. What is the rule?',
      options: [
        'In `tls:context` you can only reference protocols or cipher suites included in the global TLS configuration or defaults: the app can narrow the list, not widen it',
        'The app setting overrides the global file',
        'The global file only applies to Runtime Manager',
        'The runtime merges both lists',
      ],
      answer: 0,
      explain: 'The admin file sets what is allowed, and the app specifies a subset. If a value is not enabled in both places, the default Java environment protocols and cipher suites are used.',
    },
    {
      type: 'single',
      prompt: 'Nobody has edited `tls-default.conf`. Who picks the protocols and cipher suites for an app?',
      options: [
        'Mule allows the configured security manager to select them',
        'The first app deployed',
        'The load balancer',
        'Runtime Manager',
      ],
      answer: 0,
      explain: 'The TLS and FIPS pages use this phrase. In `tls:context`, the value `default` means the global configuration if it exists, and otherwise the Java environment defaults.',
    },
    {
      type: 'multi',
      prompt: 'Which steps are part of running standalone Mule 4.9.8 or later in FIPS 140-2 mode?',
      options: [
        'Set up a certified security provider in the Java environment',
        'Install the FIPS license from the license `.zip` file',
        'Set `mule.security.model=fips140-2` through `wrapper.conf`',
        'Convert JKS and PKCS12 keystores and truststores to BCFKS',
        'Enable FIPS at the Red Hat operating system level',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Enabling FIPS at the OS level, such as on Red Hat, is not supported, because it causes cipher suite errors during license validation. The non-FIPS license in the package is not valid for FIPS mode.',
    },
    {
      type: 'single',
      prompt: 'FIPS mode is switched on for a two-node cluster, and apps fail to deploy with `Cluster key must be defined in FIPS mode.` What is missing?',
      options: [
        '`mule.cluster.network.encryption.key`, with the same value on every node and a key length of 16, 24 or 32 bytes',
        'The Runtime Manager agent `--fips` flag on one node only',
        'A BCFKS keystore for the load balancer',
        'A new `mule.clusterId`',
      ],
      answer: 0,
      explain: 'A cluster in FIPS mode must encrypt node communication. If the keys differ between nodes, the feature does not work. The docs also warn of a performance cost, because all traffic is encrypted and decrypted.',
    },
    {
      type: 'single',
      prompt: 'After enabling FIPS, an app fails with `Could not find encryption algorithm \'<algorithm-name>\'. You are running in FIPS mode...`. What is the cause?',
      options: [
        'The app uses an algorithm that is not approved for FIPS use, for example in the Cryptography Module or Secure Properties',
        'The Bouncy Castle JAR files are corrupt',
        'The license has expired',
        'The Mule clock is wrong',
      ],
      answer: 0,
      explain: 'Not all encryption schemes in those modules are FIPS compliant. Because environments can differ, the error may appear in only some of them, so test with FIPS on before production.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to its FIPS option.',
      pairs: [
        ['Mule 4.11.4 or later, with Java 17 or later', 'FIPS 140-3 on a standalone runtime'],
        ['`FIPS_ENABLED` key in the `custom-properties` secret', 'FIPS 140-2 on Runtime Fabric'],
        ['Configured for FIPS 140-2 by default', 'Government Cloud'],
        ['`-Dmule.security.model=fips140-2` in `wrapper.conf`', 'FIPS 140-2 on a standalone runtime'],
      ],
      explain: 'On Runtime Fabric, new or restarted apps pick up FIPS mode after the secret is patched, and you confirm it in the startup log. For earlier Mule versions, use the FIPS 140-2 path.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about FIPS 140-3 on Mule are documented?',
      options: [
        'It requires support for TLS 1.3 and TLS 1.2; earlier TLS versions are not supported',
        'Its cipher suites are configured in `${MULE_HOME}/conf/tls-fips140-3.conf`',
        'Only connectors tagged `fips-140-3-verified` in Anypoint Exchange are certified for such environments',
        'Every Anypoint Connector is automatically compliant',
      ],
      answer: [0, 1, 2],
      explain: 'Always check the Exchange tag. A connector approved for your Java version is not automatically certified for FIPS 140-3.',
    },
    {
      type: 'single',
      prompt: '`amc_setup` fails with `PKIX path building failed` behind a corporate TLS-inspecting proxy. What is the hardening guide\'s reading of this error?',
      options: [
        'TLS trust failed: import the issuing CA into the JVM truststore or configure the corporate proxy certificate; it is not a Mule flow failure',
        'The Mule application XML is invalid',
        'The cluster key is wrong',
        'Port 8081 is blocked',
      ],
      answer: 0,
      explain: 'The error comes from the JVM\'s trust decision, so fix the trust chain, not the app.',
    },
  ],
  description: `
A government contractor must harden a customer-hosted Mule estate: a **two-node cluster** running Mule 4.9 and a **Runtime Fabric** cluster. Security policy says:

- Only approved cipher suites and TLS 1.2 or later.
- A move to FIPS mode for regulated workloads.
- No use of root, and keystores must be changeable by operations without a redeploy.

The first attempt on a test node gave the following results:
- The team turned on FIPS in Red Hat, and Mule reported cipher suite errors during license validation.
- After that was reverted, keystores in JKS format were rejected as non-compliant by the assessor.
- One app with an old encrypted property file failed in test but not in development.
- The cluster refused to deploy apps.

**Questions**
1. How do global and per-app TLS settings work together?
2. List the steps for FIPS 140-2 on standalone Mule. What has changed from 4.9.8?
3. Explain each failure in the test.
4. What differs for Runtime Fabric, and what differs for FIPS 140-3?
5. What else belongs in runtime hardening?
6. What changes when an old server moves from Java 8 to Java 11 or later?
`,
  answerTemplate: `## TLS layers

## FIPS 140-2 steps

## Explaining the failures

## Runtime Fabric and FIPS 140-3

## Wider hardening

## Java effect on TLS
`,
  keyPoints: [
    '`tls-default.conf` is for non-FIPS mode and `tls-fips140-2.conf` for FIPS mode, both in `$MULE_HOME/conf`.',
    '`tls:context` can only narrow the allowed lists through `enabledProtocols` and `enabledCipherSuites`.',
    'Mule does not run in FIPS mode by default. It relies on a certified provider in the Java environment.',
    'From Mule 4.9.8, FIPS 140-2 requires the FIPS license from the MuleSoft license package.',
    'Do not enable FIPS at OS level. It is not supported.',
    'FIPS mode restricts TLS negotiation to approved cipher suites for all connectors that use TLS.',
    'JKS and PKCS12 are not FIPS compliant; convert to BCFKS and set the type in `tls:context`.',
    'A cluster needs the same `mule.cluster.network.encryption.key` on all nodes, 16, 24 or 32 bytes, or deployment fails.',
    'When registering with Runtime Manager in FIPS mode, pass `--fips` to `amc_setup` each time.',
    'Runtime Fabric: patch `FIPS_ENABLED` in `custom-properties`, then deploy or restart apps.',
    'FIPS 140-3 needs Mule 4.11.4 or later, Java 17 or later, BC-FJA and verified connectors.',
    'Harden: non-root user, service install, file permissions, external secrets. Root is only needed for ports below 1024.',
  ],
  solution: `
**1. TLS layers.** There are two levels. The Mule admin edits \`tls-default.conf\` (or \`tls-fips140-2.conf\` in FIPS mode) to set which protocols and cipher suites are allowed. Developers then use a subset with \`enabledProtocols\` and \`enabledCipherSuites\` in \`tls:context\`. Setting these to \`default\` means the global configuration if it exists, otherwise the Java defaults. With no changes in the files, Mule lets the configured security manager select.

**2. FIPS 140-2 on standalone Mule.**
1. Obtain a certified security provider and set it up in Java. The docs show Bouncy Castle: register it in \`java.security\` so that only those providers are set, and copy the JARs to \`/lib/boot\` and \`/mule-agent-plugin/lib\` on Java 11 and later.
2. Run \`amc_setup\` with \`--fips\` if you register the runtime, every time.
3. In \`wrapper.conf\`, set \`-Dmule.security.model=fips140-2\`, the Java 11 and later line, and the Bouncy Castle approved-only property. Use the next free index for each.
4. For a cluster, add the encryption key.
5. Start Mule and confirm from the startup log that FIPS mode is enabled.

Since Mule 4.9.8 you also must install the **FIPS license** from the license \`.zip\`. The non-FIPS license in the same package is not valid for FIPS mode.

**3. The failures.**
- *Cipher suite errors at license validation:* enabling FIPS at OS level on Red Hat is not supported, and this is exactly the documented symptom.
- *JKS keystores:* JKS and PKCS12 are not FIPS compliant. Convert them to \`BCFKS\` with \`keytool\` and the Bouncy Castle provider. On Java 17 add \`-J--add-exports=java.base/sun.security.provider=ALL-UNNAMED\` before \`-importkeystore\`, then set \`type="bcfks"\` in \`tls:context\`.
- *Encrypted property file:* the algorithm is not approved, which gives \`Could not find encryption algorithm...\`. The docs warn that environments can differ, which explains why development passed. Re-encrypt with an approved algorithm.
- *Cluster refusing to deploy:* \`Cluster key must be defined in FIPS mode.\` Define the same key on both nodes, and expect a performance cost.

**4. Runtime Fabric and FIPS 140-3.** On Runtime Fabric, skip the Java steps. Patch the secret, then deploy or restart apps and confirm in the logs:

\`\`\`bash
kubectl patch secret custom-properties -n rtf -p='{"stringData":{"FIPS_ENABLED": "true"}}'
\`\`\`

FIPS 140-3 needs Mule 4.11.4 or later, Java 17 or later and the FIPS license. It uses the BC-FJA provider with \`-Dmule.security.model=fips140-3\`, its own \`tls-fips140-3.conf\`, and TLS 1.2 or 1.3 only. Not all connectors are certified: check for the \`fips-140-3-verified\` tag in Exchange. This cluster is on Mule 4.9, so it stays on 140-2 until it is upgraded.

**5. Wider hardening.** Run as a non-root user that owns \`$MULE_HOME\` and can write the logs directory. Without root you cannot use ports below 1024. Install Mule as a service. Keep usernames, passwords and keystores outside the app archive so that DevOps can change them without a redeploy, protect them with file system permissions, and use secure configuration files. Harden in layers, starting with the operating system; the CIS benchmarks are a common guide.

**6. Java 8 to 11 or later.** With Java 11 and later, a TLS server decides cipher preference, and the client list only filters. A server moved from Java 8 can therefore negotiate a different cipher than before, which can affect the balance of security and performance. Specify protocols and suites explicitly if you need control.
`,
  followUps: [
    {
      q: 'Is the Bouncy Castle provider bundled with Mule FIPS certified?',
      a: 'No. It is not FIPS certified, and when Mule starts in FIPS mode it is not registered or used. You must install a certified provider.',
    },
    {
      q: 'Can a FIPS 140-3 runtime still read the default JKS Java truststore?',
      a: 'In FIPS-compliant environments keystores and truststores typically require BCFKS. The FIPS 140-3 page has a section with configuration options for legacy JKS stores such as `cacerts`, so read it for your version.',
    },
    {
      q: 'Which cipher list do you start from in FIPS mode?',
      a: 'Mule automatically restricts negotiation to the approved subset, and the compliance pages list the suites. Fine-tune with `tls-fips140-2.conf` if policy is stricter.',
    },
    {
      q: 'Does the TLS 1.0 and 1.1 removal in Mule 4.10 affect this design?',
      a: 'It supports the policy, but it also means an upgrade past 4.9 can break legacy endpoints that are not ready for TLS 1.2. Check every partner before upgrading.',
    },
  ],
}
