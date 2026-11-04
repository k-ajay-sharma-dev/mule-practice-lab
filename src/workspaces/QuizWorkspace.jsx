import { useState } from 'react'
import ExplainPanel from '../components/ExplainPanel.jsx'
import Markdown from '../components/Markdown.jsx'
import QuizRunner from '../components/quiz/QuizRunner.jsx'
import { updateEntry, useEntry } from '../store/progress.js'

// Platform quizzes (`problem.quiz`) and incident investigations (`problem.investigation`):
// the scenario on the left, auto-graded questions on the right.
export default function QuizWorkspace({ problem }) {
  const entry = useEntry(problem.id)
  const [tab, setTab] = useState('scenario')
  const inv = problem.investigation
  const questions = inv ? inv.questions : problem.quiz

  return (
    <div className="workspace quiz-workspace">
      <section className="panel left-panel">
        <div className="panel-tabs">
          {[
            ['scenario', inv ? 'Incident' : 'Scenario'],
            ['explain', 'Explain it'],
            ['notes', 'Notes'],
          ].map(([key, label]) => (
            <button key={key} className={`panel-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === 'scenario' && <Markdown>{problem.description}</Markdown>}
          {tab === 'explain' && <ExplainPanel problem={problem} />}
          {tab === 'notes' && (
            <textarea
              className="notes"
              placeholder="Your notes for this problem…"
              value={entry.notes || ''}
              onChange={(e) => updateEntry(problem.id, { notes: e.target.value })}
            />
          )}
        </div>
      </section>

      <section className="panel right-panel self-panel">
        <div className="panel-tabs">
          <span className="panel-tab active">{inv ? 'Investigate' : 'Quiz'}</span>
          <span className="panel-tab-note muted small">auto-graded · progress saved</span>
        </div>
        <div className="panel-body">
          <QuizRunner
            problem={problem}
            questions={questions}
            logs={inv?.logs}
            intro={
              inv
                ? 'Work through the incident like on call: find the evidence in the logs, diagnose it, then decide how to fix it.'
                : null
            }
          />
        </div>
      </section>
    </div>
  )
}
