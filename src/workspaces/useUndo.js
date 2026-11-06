import { useCallback, useMemo, useState } from 'react'
import { record, redo, startHistory, undo } from '../study/undo.js'

// A state value with undo and redo. `history` goes to the designer for its toolbar and keyboard actions.
export function useUndo(initial) {
  const [h, setH] = useState(() => startHistory(initial()))
  const set = useCallback((value) => {
    const typing = Boolean(document.activeElement?.matches('input, textarea, select'))
    setH((x) => record(x, value, Date.now(), typing))
  }, [])
  const canUndo = h.past.length > 0
  const canRedo = h.future.length > 0
  const history = useMemo(() => ({ undo: () => setH(undo), redo: () => setH(redo), canUndo, canRedo }), [canUndo, canRedo])
  return [h.present, set, history]
}
