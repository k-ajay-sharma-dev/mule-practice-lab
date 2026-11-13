import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-014',
  category: 'logging',
  title: "When a File Goes Wrong",
  level: 'INTERMEDIATE',
  tags: ["logging","files","streaming"],
  estMinutes: 10,
  quiz: fromLogging(["log-113","log-206","log-416","log-048","log-318"]),
  description: `
Files arrive with the wrong type, the partner server is down, a row cannot be read, and a 50 MB file passes through the flow. Log each case without breaking the flow or the log.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A bad file moved aside for a person is WARN or ERROR with the file name and the reason.",
    "Logging a whole large or streamed payload can use it up or fill the log. Log its size or a few fields.",
    "A connection failure that the next run retries is WARN.",
  ],
}
