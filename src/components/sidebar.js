import { createContext, useContext, useEffect } from 'react'

export const SidebarRoom = createContext(null)

// A designer asks the sidebar to fold to icons on laptop screens, so the scenario and canvas fit side by side.
export function useSidebarRoom() {
  const setRoom = useContext(SidebarRoom)
  useEffect(() => {
    if (!setRoom) return undefined
    setRoom(true)
    return () => setRoom(false)
  }, [setRoom])
}

export const WideView = createContext(null)
const NO_WIDE_VIEW = { wide: false, toggle: () => {} }

// A page with a work area offers the wider view: the menu hides and the title shrinks to one line, so the work area
// gets the room. The choice is remembered, and only pages that offer it use it.
export function useWideView() {
  const ctx = useContext(WideView)
  const setRoom = ctx?.setRoom
  useEffect(() => {
    if (!setRoom) return undefined
    setRoom(true)
    return () => setRoom(false)
  }, [setRoom])
  return ctx ?? NO_WIDE_VIEW
}
