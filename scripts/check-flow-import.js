// Pasting Mule XML into the Flow Designer: every reference design must survive a trip through XML unchanged, every
// component must import, and real Studio-shaped XML must land in the right places.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { COMPONENTS } from '../src/flow/catalog.js'
import { fromXml, looksLikeMuleXml } from '../src/flow/import.js'
import { createFlow, createNode, restoreDesign, walk } from '../src/flow/model.js'
import { toXml } from '../src/flow/xml.js'
import { parseXml } from '../src/flow/xml-parse.js'

// the reader
const [doc] = parseXml(`<?xml version="1.0"?>
<!-- a comment -->
<a x="1 &amp; 2" y='two'><b:c>text &lt;here&gt;</b:c><d/><e><![CDATA[<raw> & more]]></e></a>`)
assert.deepEqual(doc.attrs, { x: '1 & 2', y: 'two' })
assert.equal(doc.children[0].name, 'b:c')
assert.equal(doc.children[0].text, 'text <here>')
assert.equal(doc.children[2].text, '<raw> & more')
assert.throws(() => parseXml('<a><b></a>'), /Expected <\/b> but found <\/a> \(line 1\)/)
assert.throws(() => parseXml('<a>\n<b>'), /<b> is never closed/)
assert.throws(() => parseXml('not xml'), /outside any element/)
assert.throws(() => parseXml('<a b=1/>'), /not valid XML/)

assert.ok(looksLikeMuleXml('<mule xmlns="x">'))
assert.ok(looksLikeMuleXml('<flow name="a">'))
assert.ok(!looksLikeMuleXml('just some text'))
assert.throws(() => fromXml('<mule xmlns="x"><http:listener-config name="c"/></mule>'), /No flows found/)
assert.throws(() => fromXml('   '), /No flows found/)
assert.throws(() => fromXml('<nothing-we-know/>'), /No flows found/)

// every component comes back as itself
const oneOf = (type) => {
  const flow = createFlow('flow', 'f')
  const node = createNode(type)
  if (COMPONENTS[type].kind === 'source') flow.source = node
  else if (COMPONENTS[type].kind === 'handler') flow.errorHandlers = [node]
  else flow.steps = [node]
  return { flows: [flow] }
}
const lost = []
for (const type of Object.keys(COMPONENTS)) {
  const before = toXml(oneOf(type))
  const { design, skipped } = fromXml(before)
  const after = toXml(design)
  if (skipped.length || before !== after) lost.push(type)
}
assert.deepEqual(lost, [], `these components do not survive: ${lost.join(', ')}`)

// and keeps what was typed into it, for every option of every field
const changed = []
for (const [type, def] of Object.entries(COMPONENTS)) {
  const typed = oneOf(type)
  const node = typed.flows[0].source ?? typed.flows[0].steps[0] ?? typed.flows[0].errorHandlers[0]
  const fill = (config) => {
    for (const f of def.fields ?? []) {
      if (f.type === 'number') config[f.key] = 77
      else if (f.type !== 'select') config[f.key] = `typed ${f.key} <&> "value"`
    }
  }
  const variants = [{}, ...(def.fields ?? []).flatMap((f) => (f.options ?? []).map((o) => ({ [f.key]: o })))]
  for (const variant of variants) {
    fill(node.config)
    Object.assign(node.config, variant)
    const before = toXml(typed)
    if (toXml(fromXml(before).design) !== before) changed.push(`${type} ${JSON.stringify(variant)}`)
  }
}
assert.deepEqual(changed, [], `typed values changed:\n${changed.join('\n')}`)

// every reference design survives the round trip, field for field
let designs = 0
const dir = resolve('src/content/flows')
for (const file of readdirSync(dir)) {
  const p = (await import(pathToFileURL(resolve(dir, file)).href)).default
  if (!p.referenceFlow) continue
  designs++
  const before = toXml(p.referenceFlow)
  const { design, skipped } = fromXml(before)
  assert.deepEqual(skipped, [], p.id)
  assert.equal(toXml(design), before, p.id)
  assert.equal(toXml(restoreDesign(structuredClone(design))), before, p.id)
}

// what Studio really writes: doc attributes, globals, schema locations, payload and variables in one Transform
const studio = fromXml(`<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core" xmlns:http="http://www.mulesoft.org/schema/mule/http"
  xmlns:db="http://www.mulesoft.org/schema/mule/db" xmlns="http://www.mulesoft.org/schema/mule/core"
  xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
  xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd">
  <http:listener-config name="HTTP_Listener_config" doc:name="HTTP Listener config" doc:id="1">
    <http:listener-connection host="0.0.0.0" port="8081"/>
  </http:listener-config>
  <db:config name="Orders_DB" doc:name="Database Config">
    <db:oracle-connection host="h" user="u" password="never-imported" serviceName="s"/>
  </db:config>
  <flow name="orders-api" doc:id="2">
    <http:listener doc:name="Listener" doc:id="3" config-ref="HTTP_Listener_config" path="/orders" allowedMethods="POST">
      <http:response statusCode="#[vars.status default 200]"/>
    </http:listener>
    <logger level="WARN" doc:name="Logger" message="#[payload.id]"/>
    <ee:transform doc:name="Map" doc:id="4">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
payload]]></ee:set-payload>
      </ee:message>
      <ee:variables>
        <ee:set-variable variableName="orderId"><![CDATA[payload.id]]></ee:set-variable>
      </ee:variables>
    </ee:transform>
    <choice doc:name="Choice">
      <when expression="#[payload.ok]">
        <db:select doc:name="Select" config-ref="Orders_DB">
          <db:sql><![CDATA[SELECT * FROM orders]]></db:sql>
          <db:input-parameters><![CDATA[#[{}]]]></db:input-parameters>
        </db:select>
      </when>
      <otherwise>
        <raise-error doc:name="Raise" type="APP:BAD" description="nope"/>
      </otherwise>
    </choice>
    <try doc:name="Try">
      <http:request method="POST" doc:name="Call" config-ref="Req" url="https://example.com/a"/>
      <error-handler>
        <on-error-continue enableNotifications="true" logException="true" type="HTTP:TIMEOUT">
          <set-payload value="fallback"/>
        </on-error-continue>
      </error-handler>
    </try>
    <foreach collection="#[payload.lines]"><flow-ref name="audit"/></foreach>
    <custom:thing doc:name="Not on the palette"/>
    <error-handler>
      <on-error-propagate type="ANY"><logger message="failed"/></on-error-propagate>
    </error-handler>
  </flow>
  <sub-flow name="audit"><logger message="audit"/></sub-flow>
</mule>`)

assert.equal(studio.flows, 2)
assert.deepEqual(studio.skipped, [{ name: 'custom:thing', count: 1 }])
const [main, audit] = studio.design.flows
assert.equal(main.name, 'orders-api')
assert.equal(audit.kind, 'sub-flow')
assert.equal(main.source.type, 'http-listener')
assert.equal(main.source.config.path, '/orders')
assert.equal(main.source.config.allowedMethods, 'POST')
assert.deepEqual(main.steps.map((n) => n.type), ['logger', 'transform', 'transform', 'choice', 'try', 'foreach'])
assert.equal(main.steps[0].config.level, 'WARN')
assert.equal(main.steps[0].config.message, '#[payload.id]')
assert.ok(main.steps[1].config.script.startsWith('%dw 2.0'))
assert.equal(main.steps[2].config.target, 'variable')
assert.equal(main.steps[2].config.variableName, 'orderId')
const choice = main.steps[3]
assert.equal(choice.routes[0].config.expression, '#[payload.ok]')
assert.equal(choice.routes[0].steps[0].config.sql, 'SELECT * FROM orders')
assert.equal(choice.routes[0].steps[0].config.database, 'Oracle')
assert.equal(choice.otherwise[0].config.type, 'APP:BAD')
const attempt = main.steps[4]
assert.equal(attempt.steps[0].config.path, 'https://example.com/a')
assert.equal(attempt.errorHandlers[0].config.type, 'HTTP:TIMEOUT')
assert.equal(attempt.errorHandlers[0].steps[0].config.value, 'fallback')
assert.equal(main.steps[5].steps[0].config.name, 'audit')
assert.equal(main.errorHandlers[0].steps[0].config.message, 'failed')

// no secret from a global config reaches the design
assert.ok(!JSON.stringify(studio.design).includes('never-imported'))

// every id is unique, or the designer can't select things
const ids = []
walk(studio.design, (item) => ids.push(item.id))
assert.equal(new Set(ids).size, ids.length)

// a scheduler, a piece with no flow around it, and a shared error handler
const timed = fromXml(`<flow name="t"><scheduler><scheduling-strategy><cron expression="0 0 * * * ?"/></scheduling-strategy></scheduler></flow>`)
assert.equal(timed.design.flows[0].source.config.strategy, 'cron')
assert.equal(timed.design.flows[0].source.config.expression, '0 0 * * * ?')
const fixed = fromXml(`<flow name="t"><scheduler><scheduling-strategy><fixed-frequency frequency="5" timeUnit="MINUTES"/></scheduling-strategy></scheduler></flow>`)
assert.equal(fixed.design.flows[0].source.config.frequency, 5)
assert.equal(fixed.design.flows[0].source.config.timeUnit, 'MINUTES')
const piece = fromXml('<logger message="a"/><set-payload value="b"/>')
assert.equal(piece.design.flows[0].steps.length, 2)
assert.equal(piece.components, 2)
const shared = fromXml('<mule><error-handler name="g"/><flow name="a"><logger/><error-handler ref="g"/></flow></mule>')
assert.deepEqual(shared.skipped.map((s) => s.name).sort(), ['error-handler ref="g"', 'shared error-handler'])

console.log(`All flow import checks pass (${Object.keys(COMPONENTS).length} components, ${designs} reference designs).`)
