export default {
  id: 'inc-262',
  category: 'incidents',
  title: "The App Cannot Connect to SQL Server After a Driver Upgrade",
  level: 'BEGINNER',
  tags: ["myproject","sql-server","tls","driver"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 08:00:01 ERROR [order-db] Connection failed: The driver could not establish a secure connection. PKIX path building failed", relevant: true, why: "The driver now checks the server certificate." },
      { text: "2026-11-18 07:50:00 INFO  [deploy] mssql-jdbc upgraded to a major new version", relevant: true, why: "A driver upgrade went in." },
      { text: "2026-11-18 08:00:01 INFO  [order-db] url=jdbc:sqlserver://sqlprod01:1433;databaseName=orders", relevant: true, why: "No encryption settings in the URL." },
      { text: "2026-11-18 08:01:00 INFO  [dba] Server uses an internal CA certificate", relevant: true, why: "The certificate is from an internal CA." },
      { text: "2026-11-18 23:59:00 INFO  [order-db] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the connection fail?",
        options: [
          "Newer drivers encrypt by default and the app does not trust the internal CA",
          "The password expired",
          "The database is down",
          "Port 1433 is closed",
        ],
        answer: 0,
        explain: "PKIX errors mean the certificate is not trusted.",
      },
      {
        type: 'single',
        prompt: "What is the right fix?",
        options: [
          "Add the internal CA to the trust store used by the app",
          "Set trustServerCertificate=true forever",
          "Downgrade and forget",
          "Turn off TLS on the server",
        ],
        answer: 0,
        explain: "Trust the CA properly, keep encryption.",
      },
      {
        type: 'multi',
        prompt: "What should an upgrade test cover?",
        options: [
          "Connection with production like TLS settings",
          "A few typical queries",
          "Stored procedure calls",
          "Only the build",
        ],
        answer: [0,1,2],
        explain: "Driver upgrades change defaults.",
      },
      {
        type: 'single',
        prompt: "Why is trustServerCertificate=true risky?",
        options: [
          "It accepts any certificate, so a man in the middle is not detected",
          "It is slow",
          "It disables queries",
          "It is not supported",
        ],
        answer: 0,
        explain: "It is acceptable only as a short stopgap, if at all.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Roll back the driver to restore service",
          "Get the internal CA certificate",
          "Add it to the trust store",
          "Upgrade again and test",
          "Add TLS checks to upgrade tests",
        ],
        explain: "Restore, fix, redo, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- Orders stopped saving at 08:00 after a deploy.

## Change / Context
- The deploy upgraded the SQL Server JDBC driver.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 08:00:01 ERROR [order-db] Connection failed: The driver could not establish a secure connection. PKIX path building failed
2026-11-18 07:50:00 INFO  [deploy] mssql-jdbc upgraded to a major new version
2026-11-18 08:00:01 INFO  [order-db] url=jdbc:sqlserver://sqlprod01:1433;databaseName=orders
2026-11-18 08:01:00 INFO  [dba] Server uses an internal CA certificate
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
    "Newer drivers encrypt by default.",
    "The app must trust the server certificate.",
    "Use a trust store with the internal CA.",
    "Avoid trusting every certificate.",
    "Test upgrades with real TLS.",
    "Roll back fast if needed.",
  ],
  solution: `
**Diagnosis.** The new driver encrypts by default and cannot validate the internal CA certificate.

**Immediate mitigation.**
- Roll back the driver.

**Root cause.** The app trust store lacks the internal CA.

**Permanent fix.**
- Add the CA to the trust store and upgrade again.

**Prevention.** Upgrade tests against production like TLS.
`,
  followUps: [
    { q: "Where is the trust store set?", a: "In the JVM or app properties for the runtime." },
    { q: "What does encrypt=true do?", a: "It requests TLS for the connection." },
    { q: "Is the password protected without TLS?", a: "Not fully. Use TLS for all traffic." },
    { q: "How do you roll back fast?", a: "Redeploy the previous version." },
  ],
}
