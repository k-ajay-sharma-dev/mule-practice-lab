import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-160',
  category: 'logging',
  title: "Storage Access Errors",
  level: 'ADVANCED',
  tags: ["logging","myproject","azure-blob","security","errors"],
  estMinutes: 25,
  quiz: fromLogging(["log-12046","log-12047","log-12048","log-12049","log-12050"]),
  description: `
Kestrel Logistics sees 403 and 404 errors from blob storage. Log the facts that tell a key problem from a network rule problem.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the account, container, status and the Azure error code.",
    "Log the operation that failed.",
    "Never log keys, SAS tokens or signed URLs.",
  ],
}
