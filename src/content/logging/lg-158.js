import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-158',
  category: 'logging',
  title: "Listing New Blobs",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","azure-blob","listing","paging","scheduler"],
  estMinutes: 25,
  quiz: fromLogging(["log-12036","log-12037","log-12038","log-12039","log-12040"]),
  description: `
A Kestrel Logistics scheduler lists new blobs every 5 minutes. Log the runs that matter and prove paging was followed.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log empty runs at DEBUG.",
    "Log the number found and the pages read.",
    "Log when a blob is moved to the processed prefix.",
  ],
}
