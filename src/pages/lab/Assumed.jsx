const DEFAULT_NOTE = "The product docs do not state this. Treat it as the simulator's assumption."

export default function Assumed({ basis, note = DEFAULT_NOTE }) {
  if (basis && basis !== 'assumed') return null
  return (
    <span className="lab-assumed" title={note}>
      Assumed
    </span>
  )
}
