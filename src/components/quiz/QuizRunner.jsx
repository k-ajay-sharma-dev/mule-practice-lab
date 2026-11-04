import { grade, isAnswered } from '../../quiz/quiz.js'
import { scheduleReview, updateEntry, useEntry, workedStatus } from '../../store/progress.js'
import QuestionCard, { fitsQuestion, initialResponse } from './QuestionCard.jsx'

// Runs a list of auto-graded questions, optionally preceded by a "pick the relevant log lines" step.
// State is saved on the problem's progress entry as `exercise: { responses, logs, submitted }`.
export default function QuizRunner({ problem, questions, logs, intro }) {
  const entry = useEntry(problem.id)
  const state = entry.exercise && typeof entry.exercise === 'object' ? entry.exercise : {}
  const submitted = Boolean(state.submitted)
  const responses = state.responses && typeof state.responses === 'object' ? state.responses : {}
  const pickedLogs = Array.isArray(state.logs) ? state.logs.filter((i) => Number.isInteger(i) && i < (logs?.length ?? 0)) : []

  const seedOf = (i) => `${problem.id}:${i}`
  const responseOf = (i) =>
    fitsQuestion(questions[i], responses[i]) ? responses[i] : initialResponse(questions[i], seedOf(i))

  const save = (patch) =>
    updateEntry(problem.id, { exercise: { ...state, ...patch }, status: workedStatus(problem.id) })

  const relevant = logs ? logs.map((l, i) => (l.relevant ? i : -1)).filter((i) => i >= 0) : []
  const logsCorrect = !logs || (pickedLogs.length === relevant.length && relevant.every((i) => pickedLogs.includes(i)))
  const results = questions.map((q, i) => grade(q, responseOf(i)))
  const score = results.filter(Boolean).length + (logs ? (logsCorrect ? 1 : 0) : 0)
  const total = questions.length + (logs ? 1 : 0)
  const ready = questions.every((q, i) => isAnswered(q, responseOf(i))) && (!logs || pickedLogs.length > 0)

  function submit() {
    const allRight = score === total
    updateEntry(problem.id, {
      exercise: { ...state, submitted: true, best: Math.max(state.best ?? 0, score) },
      status: allRight ? 'solved' : workedStatus(problem.id),
    }, { graded: allRight })
    if (!allRight) scheduleReview(problem.id) // missed questions come back for review
  }

  function retry() {
    // keep the right answers, clear the wrong ones
    const kept = {}
    questions.forEach((q, i) => {
      if (results[i]) kept[i] = responseOf(i)
    })
    save({ submitted: false, responses: kept, logs: logsCorrect ? pickedLogs : [] })
  }

  return (
    <div className="quiz">
      {intro && <p className="muted small quiz-intro">{intro}</p>}

      {logs && (
        <div className={`question${submitted ? (logsCorrect ? ' correct' : ' wrong') : ''}`}>
          <div className="question-head">
            <span className="question-num mono">Logs</span>
            <span className="question-hint muted small">Select every line that points to the problem</span>
            {submitted && (
              <span className={`question-mark ${logsCorrect ? 'ok-text' : 'err-text'}`}>
                {logsCorrect ? '✓ Correct' : '✗ Not quite'}
              </span>
            )}
          </div>
          <div className="log-lines">
            {logs.map((l, i) => {
              const picked = pickedLogs.includes(i)
              const state = submitted ? (l.relevant ? (picked ? 'is-answer' : 'is-missed') : picked ? 'is-wrong' : '') : ''
              return (
                <label key={i} className={`log-line ${picked ? 'chosen' : ''} ${state}`}>
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={submitted}
                    onChange={() => save({ logs: picked ? pickedLogs.filter((x) => x !== i) : [...pickedLogs, i] })}
                  />
                  <span className="log-text mono">{l.text}</span>
                  {submitted && l.why && (l.relevant || picked) && <span className="log-why small">{l.why}</span>}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {questions.map((q, i) => (
        <QuestionCard
          key={i}
          q={q}
          number={i + 1}
          seed={seedOf(i)}
          response={responseOf(i)}
          submitted={submitted}
          onChange={(r) => save({ responses: { ...responses, [i]: r } })}
        />
      ))}

      <div className="quiz-footer">
        {submitted ? (
          <>
            <div className={`match-banner ${score === total ? 'pass' : 'fail'}`}>
              {score} / {total} correct{score === total ? ' — solved!' : ''}
            </div>
            {score < total && (
              <button className="btn btn-primary" onClick={retry}>
                Try the wrong ones again
              </button>
            )}
            {score === total && (
              <button className="btn btn-ghost" onClick={() => save({ submitted: false, responses: {}, logs: [] })}>
                Start over
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={submit} disabled={!ready}>
              Check answers
            </button>
            {!ready && <span className="muted small">Answer every question to check.</span>}
          </>
        )}
      </div>
    </div>
  )
}
