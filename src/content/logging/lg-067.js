import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-067',
  category: 'logging',
  title: "Watermarks in Object Store",
  level: 'INTERMEDIATE',
  tags: ["logging","watermark","object-store","sftp"],
  estMinutes: 15,
  quiz: fromLogging(["log-3031","log-3032","log-3033","log-3034","log-3035"]),
  description: `
Lakeside Energy reads meter files from SFTP that are newer than a watermark kept in Object Store. Log the watermark so a missed or repeated file can be explained.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the old and new watermark and the Object Store key.",
    "When a load fails, keep the watermark and say the files will be read again.",
    "A missing watermark is expected after a first deploy and suspicious at any other time.",
  ],
}
