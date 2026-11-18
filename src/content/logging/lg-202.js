import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-202',
  category: 'logging',
  title: "Blob Cleanup and Restore",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","azure-blob","soft-delete","cleanup"],
  estMinutes: 25,
  quiz: fromLogging(["log-17006","log-17007","log-17008","log-17009","log-17010"]),
  description: `
Kestrel Logistics runs a blob cleanup job and once deleted live files. Log cleanups and restores so a wrong rule shows at once.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log container, prefix, age rule and count on every cleanup.",
    "Log restores with the count and the replay step.",
    "Do not list every blob name.",
  ],
}
