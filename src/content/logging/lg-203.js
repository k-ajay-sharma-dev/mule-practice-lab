import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-203',
  category: 'logging',
  title: "Share Overwrites and Snapshots",
  level: 'ADVANCED',
  tags: ["logging","myproject","azure-file-share","snapshots","validation"],
  estMinutes: 25,
  quiz: fromLogging(["log-17011","log-17012","log-17013","log-17014","log-17015"]),
  description: `
Larkfield Grocers refuses to overwrite a plan with a suspicious file and restores from share snapshots. Log both.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the row counts and the rule when a write is refused.",
    "Log the snapshot used for a restore.",
    "Never log the SAS token.",
  ],
}
