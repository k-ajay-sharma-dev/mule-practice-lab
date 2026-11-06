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
