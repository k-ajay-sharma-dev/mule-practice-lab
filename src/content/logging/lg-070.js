import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-070',
  category: 'logging',
  title: "Large Files and Streaming",
  level: 'INTERMEDIATE',
  tags: ["logging","streaming","sftp","large-files"],
  estMinutes: 20,
  quiz: fromLogging(["log-3046","log-3047","log-3048","log-3049","log-3050"]),
  description: `
Larkfield Media loads gzipped ad impression files of 2 GB, streamed from SFTP. A careless logger can read the whole stream or fill the log. Log these files safely.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Take the file size from attributes.size. It costs nothing.",
    "sizeOf(payload) on a stream reads, decompresses and parses the whole file, and a non-repeatable stream is then used up.",
    "Log a few records only at DEBUG while you build.",
  ],
}
