import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-134',
  category: 'logging',
  title: "Sending Files to a Partner",
  level: 'BEGINNER',
  tags: ["myproject", "logging","sftp","files","partners"],
  estMinutes: 20,
  quiz: fromLogging(["log-9016","log-9017","log-9018","log-9019","log-9020"]),
  description: `
Sandford Pharmaceuticals uploads a nightly orders file to a distributor over SFTP. When the distributor says a file was wrong or missing, the logs must settle it in minutes.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the file name, size in bytes, checksum, remote path and duration of each upload.",
    "A failed upload is an ERROR that says where the file waits and when it will be retried.",
    "Never log passwords or file contents.",
  ],
}
