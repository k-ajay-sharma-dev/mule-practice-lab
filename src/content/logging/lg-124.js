import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-124',
  category: 'logging',
  title: "OAuth Tokens Without Leaks",
  level: 'ADVANCED',
  tags: ["logging","oauth","security","secrets"],
  estMinutes: 20,
  quiz: fromLogging(["log-7016","log-7017","log-7018","log-7019","log-7020"]),
  description: `
The Kestrel Insurance claims app calls the Claims Core API with an OAuth access token it fetches every 55 minutes. One night the token call failed and claims stopped for an hour. Log token fetches and failures so the cause shows at once, without ever logging a token or secret.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log when a token was fetched and when it expires, never the token.",
    "On a failed token call, log the client ID, status and provider error at ERROR.",
    "The client ID is fine to log. The client secret and the token are not.",
  ],
}
