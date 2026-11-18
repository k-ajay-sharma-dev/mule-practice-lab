import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-167',
  category: 'logging',
  title: "The SFTP Listener",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","sftp","listener","cluster","duplicates"],
  estMinutes: 25,
  quiz: fromLogging(["log-13031","log-13032","log-13033","log-13034","log-13035"]),
  description: `
Brindle Outdoor reads store files with the SFTP listener in a cluster. Log each file picked and each duplicate skipped.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the partner, path, size and node for each file picked.",
    "Use the file attributes, not the content.",
    "Log a skipped duplicate with its checksum and first load time.",
  ],
}
