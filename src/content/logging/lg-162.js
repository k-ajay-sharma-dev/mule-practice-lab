import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-162',
  category: 'logging',
  title: "Loading Files From the Share",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","azure-file-share","trailer","reconciliation"],
  estMinutes: 25,
  quiz: fromLogging(["log-13006","log-13007","log-13008","log-13009","log-13010"]),
  description: `
Larkfield Grocers loads each sales file into staging and checks the trailer row count. Log enough to prove each file loaded completely.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log rows read, the trailer count and rejects.",
    "Log a count mismatch at ERROR and move the file to the error folder.",
    "Keep the rows out of the log.",
  ],
}
