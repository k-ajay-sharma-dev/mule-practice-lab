import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-094',
  category: 'logging',
  title: "Raise Error for Library Loans",
  level: 'ADVANCED',
  tags: ["raise-error","business-rules","error-handling"],
  estMinutes: 20,
  quiz: fromLogging(["log-5016","log-5017","log-5018","log-5019","log-5020"]),
  description: `
The Pinecrest Libraries Loans API refuses a loan when a member has too many books. Raise your own error for the rule and log the refusal well.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Raise errors in your own namespace, such as LOANS.",
    "A business refusal is WARN or INFO, not ERROR.",
    "Put the facts in the line: the count and the limit.",
  ],
}
