import { checkAnswer } from '../study/answer-check.js'
import Markdown from './Markdown.jsx'

// Which points of the model answer were spoken. The text can be corrected, because speech to text mishears terms.
export default function AnswerCheck({ card, text = '', onEdit }) {
  const { points, covered, total } = checkAnswer(text, card.front, card.back)

  return (
    <div className="answer-check">
      <div className="section-title">
        {text.trim() ? `You covered ${covered} of ${total} ${total === 1 ? 'point' : 'points'}` : 'Nothing was heard for this answer'}
      </div>
      <ul className="answer-points">
        {points.map((p) => (
          <li key={p.text} className={p.covered ? 'ok-text' : p.opposite ? 'warn-text' : 'muted'}>
            <span role="img" aria-label={p.covered ? 'Covered' : p.opposite ? 'You may have said the opposite' : 'Not covered'}>
              {p.covered ? '✓' : p.opposite ? '✗' : '○'}
            </span>
            <Markdown>{p.text}</Markdown>
          </li>
        ))}
      </ul>
      {points.some((p) => p.opposite) && (
        <p className="warn-text small">✗ You used these words, but with a “not” or “never” the model answer does not have, or the other way round. Check you did not say the opposite.</p>
      )}
      <label className="field small">
        What was heard. Fix any wrong words, or type your answer.
        <textarea className="input" rows={3} value={text} onChange={(e) => onEdit(e.target.value)} />
      </label>
      <p className="muted small">This matches words, not meaning, so trust the model answer when you rate yourself.</p>
    </div>
  )
}
