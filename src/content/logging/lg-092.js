import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-092',
  category: 'logging',
  title: "Secure Properties at a Credit Union",
  level: 'BEGINNER',
  tags: ["security","secure-properties","start-up"],
  estMinutes: 10,
  quiz: fromLogging(["log-5006","log-5007","log-5008","log-5009","log-5010"]),
  description: `
The Thistlebank Credit Union Member Notifications app reads its mail and partner credentials from secure properties. Log what it loaded without ever writing a secret.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A Logger does not mask secure properties.",
    "Log the host, the environment or a key version, never the value.",
    "DEBUG lines can reach production, so secrets stay out at every level.",
  ],
}
