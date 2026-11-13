import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-102',
  category: 'logging',
  title: "Log Volume and Cost",
  level: 'BEGINNER',
  tags: ["cloudhub","log-volume","cost"],
  estMinutes: 10,
  quiz: fromLogging(["log-5056","log-5057","log-5058","log-5059","log-5060"]),
  description: `
Tidewater Retail runs 40 apps on CloudHub and pays its log tool by volume. Cut the noise and keep the lines that matter.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Every line has a cost, at any level, once it is written.",
    "At high volume, log a count, not a list.",
    "CloudHub keeps logs for a limited time and size.",
  ],
}
