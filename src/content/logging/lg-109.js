import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-109',
  category: 'logging',
  title: "Logging Choice Routes",
  level: 'BEGINNER',
  tags: ["logging","choice","routing"],
  estMinutes: 10,
  quiz: fromLogging(["log-6016","log-6017","log-6018","log-6019","log-6020"]),
  description: `
The Wyecombe Loan Application API sends each application to one of three loan teams with a Choice router. Log which route ran, and what happened when no route matched.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The route taken is DEBUG detail, or a field on one INFO line.",
    "The otherwise route that answers 400 is WARN.",
    "Log the value that matched no route.",
  ],
}
