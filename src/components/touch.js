import { useEffect, useSyncExternalStore } from 'react'

const coarsePointer = window.matchMedia('(pointer: coarse)')
const subscribe = (notify) => {
  coarsePointer.addEventListener('change', notify)
  return () => coarsePointer.removeEventListener('change', notify)
}

// True on phones and tablets, where the main input is a finger.
export const useCoarsePointer = () => useSyncExternalStore(subscribe, () => coarsePointer.matches)

// Once the designers stack into one column, what you act on can be far off screen, so bring it into view.
// The width matches the stacked layout in styles.css.
export function useRevealWhenStacked(root, selector, trigger, block = 'center') {
  useEffect(() => {
    if (!trigger || !window.matchMedia('(max-width: 1000px)').matches) return
    root.current?.querySelector(selector)?.scrollIntoView({ block })
  }, [root, selector, trigger, block])
}
