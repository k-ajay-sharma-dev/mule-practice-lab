// The open practice console of the Platform Lab. Kept apart from the guided labs, so opening it does not load every lab.
import { useEffect, useState } from 'react'
import { defaultHybrid, openConsole } from '../../lab/platform-project.js'
import { defaultSystems } from '../../lab/platform-systems.js'
import { harborKafka } from '../../lab/platform-kafka.js'
import { defaultDatabases } from '../../lab/platform-db.js'
import { defaultMailServer } from '../../lab/platform-mailserver.js'
import { defaultServiceBus } from '../../lab/platform-servicebus.js'
import { defaultJms } from '../../lab/platform-jms.js'
import { defaultNetwork } from '../../lab/platform-network.js'
import { addEnterprise, enterpriseProjects, welcomeMail } from '../../lab/platform-enterprise.js'
import AnypointConsole from './AnypointConsole.jsx'
import { isState, read, useSaved } from './console-save.js'

// parts of the console added later, filled in for older saves
const LATER = { databases: defaultDatabases, mailServer: defaultMailServer, serviceBus: defaultServiceBus, jms: defaultJms, network: defaultNetwork }
const OPEN_KEY = 'pl.lab.anypoint2'
const OLD_KEY = 'pl.lab.anypoint' // the console before it had the API-led project

export default function OpenConsole() {
  const [state, setState] = useState(() => {
    const saved = read(OPEN_KEY)
    // a console saved before the data center or the outside systems existed gets them
    if (!isState(saved)) return openConsole()
    const withHybrid = saved.hybrid ? saved : { ...saved, hybrid: defaultHybrid() }
    const withSystems = withHybrid.systems ? withHybrid : { ...withHybrid, systems: defaultSystems(withHybrid.clock) }
    // and a console saved before Kafka gets the harbor-events cluster
    const withKafka = withSystems.kafka ? withSystems : { ...withSystems, kafka: harborKafka(withSystems.clock) }
    const withLater = Object.entries(LATER).reduce((x, [k, make]) => (x[k] ? x : { ...x, [k]: make(x.clock) }), withKafka)
    // a console saved before the Harbor enterprise landscape gets its APIs, apps and the welcome mail once
    if (withLater.apps.some((a) => a.name === 'mobile-app-exp-api')) return enterpriseProjects(withLater)
    try {
      return welcomeMail(addEnterprise(withLater))
    } catch {
      return withLater
    }
  })
  useSaved(OPEN_KEY, state)
  useEffect(() => {
    try {
      localStorage.removeItem(OLD_KEY)
    } catch {
      // storage blocked
    }
  }, [])
  return (
    <div className="pc-wrap">
      <div className="lab-row-head">
        <p className="muted small lab-grow">A working practice environment with the pages and steps of Anypoint Platform. The order project of Harbor Foods runs in it with three API layers: open Visualizer to see it. Change anything, break anything, then reset it.</p>
        <button className="btn btn-sm btn-ghost" onClick={() => setState(openConsole())}>
          Reset the console
        </button>
      </div>
      <AnypointConsole state={state} onChange={setState} title="Practice console" />
    </div>
  )
}
