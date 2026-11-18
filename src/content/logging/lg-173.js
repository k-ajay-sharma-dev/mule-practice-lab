import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-173',
  category: 'logging',
  title: "FTP Uploads to the Planning Platform",
  level: 'ADVANCED',
  tags: ["logging","myproject","ftp","planning-platform","idempotency"],
  estMinutes: 25,
  quiz: fromLogging(["log-14011","log-14012","log-14013","log-14014","log-14015"]),
  description: `
Marrow & Pine Home uploads sales to the planning platform over FTP. Log unknown results and the check that avoids a duplicate.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A timeout means the result is unknown.",
    "Log the run ID so the receiver can skip repeats.",
    "Log when a check finds the file already there.",
  ],
}
