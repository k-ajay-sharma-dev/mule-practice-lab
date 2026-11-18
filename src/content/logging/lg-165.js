import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-165',
  category: 'logging',
  title: "Writing Large Exports to the Share",
  level: 'ADVANCED',
  tags: ["logging","myproject","azure-file-share","large-files","range-writes"],
  estMinutes: 25,
  quiz: fromLogging(["log-13021","log-13022","log-13023","log-13024","log-13025"]),
  description: `
Larkfield Grocers writes a large export to the share in ranges under a temp name. Log the finish, the retries and the failure without leaking access.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log size, rows and duration when the export is renamed.",
    "Log a failed export with the offset and what was cleaned up.",
    "Never log the SAS token or a signed URL.",
  ],
}
