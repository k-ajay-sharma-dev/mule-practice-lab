import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-104',
  category: 'logging',
  title: "Security Errors and Attacks",
  level: 'ADVANCED',
  tags: ["security","authentication","log-injection"],
  estMinutes: 20,
  quiz: fromLogging(["log-5066","log-5067","log-5068","log-5069","log-5070"]),
  description: `
Orbit Mobile has a sign-in API and calls a Billing System API. Log refused sign-ins, blocked clients and rejected credentials safely.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Text a caller controls can forge log lines, so log your own IDs.",
    "A 401 to your own call is an ERROR: your settings need a fix.",
    "Log a client ID, never a key, a secret or a credential.",
  ],
}
