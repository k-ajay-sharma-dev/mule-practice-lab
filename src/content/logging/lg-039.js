import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-039',
  category: 'logging',
  title: "Claim Documents: File Uploads over HTTP",
  level: 'INTERMEDIATE',
  tags: ["logging","multipart","uploads"],
  estMinutes: 15,
  quiz: fromLogging(["log-1041","log-1042","log-1043","log-1044","log-1045"]),
  description: `
Members of an invented health insurer upload claim documents to POST /claims/{claimId}/documents as multipart/form-data. Log each upload, and each upload the API refuses.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the file name, content type and size, never the content.",
    "A file that is too large or of the wrong type is a WARN with the status.",
    "Upload content can be health data, so it stays out at every level.",
  ],
}
