import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-040',
  category: 'logging',
  title: "Statements API: Accepted Now, Done Later",
  level: 'INTERMEDIATE',
  tags: ["logging","async","http-202"],
  estMinutes: 15,
  quiz: fromLogging(["log-1046","log-1047","log-1048","log-1049","log-1050"]),
  description: `
The Statements API of an invented bank answers POST /statements/exports with 202 Accepted and builds the file in an Async scope. Clients poll for the result. Log the start, the polls and the end.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A 202 line says accepted, never done.",
    "The job ID in every line joins the request to the later work.",
    "Repeated polls with the same answer belong at DEBUG.",
  ],
}
