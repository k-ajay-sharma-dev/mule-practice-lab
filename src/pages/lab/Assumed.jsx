export default function Assumed({ basis }) {
  if (basis && basis !== 'assumed') return null
  return (
    <span className="lab-assumed" title="The product docs do not state this. Treat it as the simulator's assumption.">
      Assumed
    </span>
  )
}
