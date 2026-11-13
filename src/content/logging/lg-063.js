import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-063',
  category: 'logging',
  title: "Enrolment Records in a Batch Job",
  level: 'INTERMEDIATE',
  tags: ["logging","batch"],
  estMinutes: 15,
  quiz: fromLogging(["log-3011","log-3012","log-3013","log-3014","log-3015"]),
  description: `
Northbridge College loads a CSV of course enrolments with a Batch Job. Log the start of the job, the records that fail and the end of the run.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the record count once, before the job starts.",
    "Inside a batch step the payload is one record. Keep per-record lines at DEBUG and free of personal data.",
    "In On Complete, log the counts from the BatchJobResult.",
  ],
}
