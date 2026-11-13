import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-098',
  category: 'logging',
  title: "Reconnecting to LDAP",
  level: 'INTERMEDIATE',
  tags: ["reconnection","ldap","connectivity"],
  estMinutes: 15,
  quiz: fromLogging(["log-5036","log-5037","log-5038","log-5039","log-5040"]),
  description: `
The Silverline Telecom staff app looks up staff in LDAP and has a reconnection strategy. Log the connection problems, the failures and the recovery.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A reconnection strategy retries the connection, not the request.",
    "When it runs out, log the CONNECTIVITY error with what the caller got.",
    "Log when a connection comes back and how long it was down.",
  ],
}
