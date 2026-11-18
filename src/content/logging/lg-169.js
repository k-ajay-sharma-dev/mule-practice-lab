import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-169',
  category: 'logging',
  title: "Plans Back From the Planning Platform",
  level: 'ADVANCED',
  tags: ["logging","myproject","sftp","plans","planning-platform","oracle"],
  estMinutes: 25,
  quiz: fromLogging(["log-13041","log-13042","log-13043","log-13044","log-13045"]),
  description: `
Brindle Outdoor loads plan files from the planning platform into the store database with MERGE and a reject table. Log the load and each rejected row.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log rows, merged and rejected so they add up.",
    "Add the job ID to link the job log table.",
    "Log each rejected row with line, store, item and reason.",
  ],
}
