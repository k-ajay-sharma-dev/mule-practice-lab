import { useState } from 'react'
import { updateEntry, useEntry } from '../store/progress.js'
import { useAutosave } from './useAutosave.js'

// A problem's notes. Typing changes only this box; the note is saved shortly after you stop, like the editors,
// so a key press does not redraw the whole app. Leaving the page or Ctrl+S saves what is still waiting.
export default function NotesBox({ problemId, placeholder = 'Your notes for this problem…' }) {
  const saved = useEntry(problemId).notes || ''
  const [text, setText] = useState(saved)
  useAutosave(text, (value) => updateEntry(problemId, { notes: value }))
  return <textarea className="notes" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
}
