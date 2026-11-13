import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-105',
  category: 'logging',
  title: "A Redeploy That Went Wrong",
  level: 'ADVANCED',
  tags: ["deployment","start-up","properties"],
  estMinutes: 20,
  quiz: fromLogging(["log-5071","log-5072","log-5073","log-5074","log-5075"]),
  description: `
The Granite Energy meter readings app is redeployed, and things go wrong. Use the deployment log and good start-up lines to find out why.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the app version and environment once at start-up.",
    "When an app fails to start, read the deployment log first.",
    "A check at start-up makes a wrong setting show at once.",
  ],
}
