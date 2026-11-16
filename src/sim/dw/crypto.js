// Small synchronous hash functions for dw::Crypto (the browser's SubtleCrypto is async, so it cannot be used here).
import { SimUnsupported } from '../errors.js'

const rotl = (x, n) => (x << n) | (x >>> (32 - n))
const rotr = (x, n) => (x >>> n) | (x << (32 - n))

function pad64(bytes, littleEndian) {
  const len = bytes.length
  const total = (((len + 8) >> 6) + 1) << 6
  const out = new Uint8Array(total)
  out.set(bytes)
  out[len] = 0x80
  const bits = len * 8
  const view = new DataView(out.buffer)
  if (littleEndian) {
    view.setUint32(total - 8, bits >>> 0, true)
    view.setUint32(total - 4, Math.floor(bits / 2 ** 32), true)
  } else {
    view.setUint32(total - 8, Math.floor(bits / 2 ** 32))
    view.setUint32(total - 4, bits >>> 0)
  }
  return out
}

function sha1(bytes) {
  const m = pad64(bytes, false)
  const view = new DataView(m.buffer)
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  const w = new Int32Array(80)
  for (let off = 0; off < m.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(off + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      let f, k
      if (i < 20) [f, k] = [(b & c) | (~b & d), 0x5a827999]
      else if (i < 40) [f, k] = [b ^ c ^ d, 0x6ed9eba1]
      else if (i < 60) [f, k] = [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
      else [f, k] = [b ^ c ^ d, 0xca62c1d6]
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = t
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }
  return words([h0, h1, h2, h3, h4], false)
}

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function sha256(bytes) {
  const m = pad64(bytes, false)
  const view = new DataView(m.buffer)
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const w = new Int32Array(64)
  for (let off = 0; off < m.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K256[i] + w[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    h[0] = (h[0] + a) | 0
    h[1] = (h[1] + b) | 0
    h[2] = (h[2] + c) | 0
    h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0
    h[5] = (h[5] + f) | 0
    h[6] = (h[6] + g) | 0
    h[7] = (h[7] + hh) | 0
  }
  return words(h, false)
}

const S_MD5 = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
const K_MD5 = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0)

function md5(bytes) {
  const m = pad64(bytes, true)
  const view = new DataView(m.buffer)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let off = 0; off < m.length; off += 64) {
    const M = Array.from({ length: 16 }, (_, i) => view.getInt32(off + i * 4, true))
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F, g
      if (i < 16) [F, g] = [(B & C) | (~B & D), i]
      else if (i < 32) [F, g] = [(D & B) | (~D & C), (5 * i + 1) % 16]
      else if (i < 48) [F, g] = [B ^ C ^ D, (3 * i + 5) % 16]
      else [F, g] = [C ^ (B | ~D), (7 * i) % 16]
      F = (F + A + K_MD5[i] + M[g]) | 0
      A = D
      D = C
      C = B
      B = (B + rotl(F, S_MD5[i])) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }
  return words([a0, b0, c0, d0], true)
}

function words(ws, littleEndian) {
  const out = new Uint8Array(ws.length * 4)
  const view = new DataView(out.buffer)
  ws.forEach((w, i) => view.setInt32(i * 4, w, littleEndian))
  return out
}

const HASHES = {
  MD5: md5,
  'SHA-1': sha1,
  SHA1: sha1,
  SHA: sha1,
  'SHA-256': sha256,
  SHA256: sha256,
}

export function hash(bytes, algorithm = 'SHA-1') {
  const fn = HASHES[String(algorithm).toUpperCase()]
  if (!fn) throw new SimUnsupported(`the ${algorithm} hash algorithm`)
  return fn(bytes)
}

export function hmac(key, data, algorithm = 'HmacSHA1') {
  const name = String(algorithm).replace(/^hmac/i, '').toUpperCase()
  const fn = HASHES[name] || HASHES[name.replace(/^SHA/, 'SHA-')]
  if (!fn) throw new SimUnsupported(`the ${algorithm} HMAC algorithm`)
  const block = 64
  let k = key.length > block ? fn(key) : key
  const kp = new Uint8Array(block)
  kp.set(k)
  const ipad = kp.map((b) => b ^ 0x36)
  const opad = kp.map((b) => b ^ 0x5c)
  const inner = fn(concat(ipad, data))
  return fn(concat(opad, inner))
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
