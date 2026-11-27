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
import { defaultSalesforce } from '../../lab/platform-salesforce.js'
import { defaultSap } from '../../lab/platform-sap.js'
import { defaultRtf } from '../../lab/platform-rtf.js'
import { defaultFlex } from '../../lab/platform-flex.js'
import { defaultB2b } from '../../lab/platform-b2b.js'
import { defaultGovernance } from '../../lab/platform-governance.js'
import { defaultAccess } from '../../lab/platform-access.js'
import { defaultObservability } from '../../lab/platform-observability.js'
import { defaultRelease } from '../../lab/platform-release.js'
import { defaultEpic } from '../../lab/platform-epic.js'
import { defaultHl7 } from '../../lab/platform-hl7.js'
import { defaultWorkday } from '../../lab/platform-workday.js'
import { defaultServicenow } from '../../lab/platform-servicenow.js'
import { defaultSnowflake } from '../../lab/platform-snowflake.js'
import { defaultAws } from '../../lab/platform-aws.js'
import { defaultMsgraph } from '../../lab/platform-msgraph.js'
import { defaultShopify } from '../../lab/platform-shopify.js'
import { addEnterprise, enterpriseProjects, welcomeMail } from '../../lab/platform-enterprise.js'
import AnypointConsole from './AnypointConsole.jsx'
import { isState, read, useSaved } from './console-save.js'

// parts of the console added later, filled in for older saves
const LATER = { databases: defaultDatabases, mailServer: defaultMailServer, serviceBus: defaultServiceBus, jms: defaultJms, network: defaultNetwork, salesforce: defaultSalesforce, sap: defaultSap, rtf: defaultRtf, flex: defaultFlex, b2b: defaultB2b, governance: defaultGovernance, access: defaultAccess, observability: defaultObservability, release: defaultRelease, epic: defaultEpic, hl7: defaultHl7, workday: defaultWorkday, servicenow: defaultServicenow, snowflake: defaultSnowflake, aws: defaultAws, msgraph: defaultMsgraph, shopify: defaultShopify }
const OPEN_KEY = 'pl.lab.anypoint2'
const OLD_KEY = 'pl.lab.anypoint' // the console before it had the API-led project

// One practice environment for the Anypoint console tab and the Systems tab: both read and change this store.
let shared = null
const listeners = new Set()
const setShared = (fn) => {
  shared ??= loadConsole() // a screen can write before any reader loaded the store
  const next = typeof fn === 'function' ? fn(shared) : fn
  if (next === shared) return
  shared = next
  listeners.forEach((l) => l(next))
}
export function useOpenConsole() {
  const [state, setState] = useState(() => (shared ??= loadConsole()))
  useEffect(() => {
    listeners.add(setState)
    setState(shared)
    return () => void listeners.delete(setState)
  }, [])
  return [state, setShared]
}

function loadConsole() {
  {
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
  }
}

// saves the shared console; the Platform and systems tab calls it once, so a change made on any system is kept
export function useSaveConsole(state) {
  useSaved(OPEN_KEY, state)
}

// the Anypoint Platform entry of the Platform and systems tab, which saves for it
export default function OpenConsole() {
  const [state, setState] = useOpenConsole()
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
