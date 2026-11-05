// A small XML reader, because the browser's DOMParser isn't there for scripts/check-flow-import.js and Mule
// configuration needs nothing beyond elements, attributes, text and CDATA.
// An element is { name, attrs, children, text }. Prefixes stay in the name: <db:select> is "db:select".

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code) => {
    if (code[0] !== '#') return ENTITIES[code] ?? whole
    return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
  })

const OPEN_TAG = /<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export function parseXml(xml) {
  const root = { name: '', attrs: {}, children: [], text: '' }
  const open = [root]
  const lineAt = (i) => xml.slice(0, i).split('\n').length
  const fail = (message, i) => {
    throw new Error(`${message} (line ${lineAt(i)})`)
  }
  const skipTo = (marker, i, what) => {
    const end = xml.indexOf(marker, i)
    if (end < 0) fail(`${what} is never closed`, i)
    return end
  }

  let i = 0
  while (i < xml.length) {
    const current = open.at(-1)
    const next = xml.indexOf('<', i)
    const plain = xml.slice(i, next < 0 ? xml.length : next)
    if (plain.trim()) {
      if (current === root) fail('Text outside any element', i)
      current.text += decode(plain.trim())
    }
    if (next < 0) break
    i = next

    if (xml.startsWith('<!--', i)) i = skipTo('-->', i, 'A comment') + 3
    else if (xml.startsWith('<![CDATA[', i)) {
      const end = skipTo(']]>', i, 'A CDATA section')
      current.text += xml.slice(i + 9, end)
      i = end + 3
    } else if (xml.startsWith('<?', i)) i = skipTo('?>', i, 'A declaration') + 2
    else if (xml.startsWith('<!', i)) i = skipTo('>', i, 'A declaration') + 1
    else if (xml.startsWith('</', i)) {
      const end = skipTo('>', i, 'A closing tag')
      const name = xml.slice(i + 2, end).trim()
      if (open.length === 1) fail(`</${name}> has no opening tag`, i)
      if (current.name !== name) fail(`Expected </${current.name}> but found </${name}>`, i)
      open.pop()
      i = end + 1
    } else {
      OPEN_TAG.lastIndex = i
      const tag = OPEN_TAG.exec(xml)
      if (!tag) fail('This tag is not valid XML', i)
      const attrs = {}
      for (const [, key, double, single] of tag[2].matchAll(ATTRIBUTE)) attrs[key] = decode(double ?? single)
      const element = { name: tag[1], attrs, children: [], text: '' }
      current.children.push(element)
      if (!tag[3]) open.push(element)
      i = OPEN_TAG.lastIndex
    }
  }
  if (open.length > 1) throw new Error(`<${open.at(-1).name}> is never closed`)
  return root.children
}
