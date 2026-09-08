// CloudPivot 品牌图标生成脚本（纯 Node + sharp）
// 生成：浏览器 favicon / Electron ico+png / Android 各密度 launcher 图标
// 运行：node scripts/gen-icons.js
const sharp = require('sharp')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

function iconSvg() {
  return `
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1f2937"/>
        <stop offset="1" stop-color="#0b1220"/>
      </linearGradient>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#22c55e"/>
        <stop offset="1" stop-color="#16a34a"/>
      </linearGradient>
    </defs>
    <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="url(#bg)"/>
    <g fill="url(#grad)">
      <ellipse cx="190" cy="240" rx="95" ry="70"/>
      <ellipse cx="262" cy="200" rx="85" ry="78"/>
      <ellipse cx="336" cy="236" rx="82" ry="64"/>
      <rect x="150" y="230" width="230" height="88" rx="44"/>
    </g>
    <circle cx="256" cy="158" r="26" fill="#ffffff"/>
    <circle cx="256" cy="158" r="12" fill="#22c55e"/>
    <g stroke="#ffffff" stroke-width="12" stroke-linecap="round">
      <line x1="256" y1="184" x2="256" y2="236"/>
      <line x1="186" y1="270" x2="256" y2="236"/>
      <line x1="326" y1="270" x2="256" y2="236"/>
    </g>
    <circle cx="256" cy="258" r="14" fill="#22c55e" stroke="#fff" stroke-width="6"/>
    <circle cx="158" cy="306" r="12" fill="#22c55e" stroke="#fff" stroke-width="6"/>
    <circle cx="354" cy="306" r="12" fill="#22c55e" stroke="#fff" stroke-width="6"/>
  </svg>`
}

async function png(svg, size) {
  return sharp(Buffer.from(svg), { failOn: 'none' }).resize(size, size).png().toBuffer()
}

async function buildIco(svg) {
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const entries = []
  for (const s of sizes) entries.push({ size: s, data: await png(svg, s) })
  const count = entries.length
  const headerSize = 6 + 16 * count
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  let dataStart = headerSize
  const blobs = [header]
  for (let i = 0; i < count; i++) {
    const e = entries[i]
    const off = 6 + i * 16
    header.writeUInt8(e.size >= 256 ? 0 : e.size, off)
    header.writeUInt8(e.size >= 256 ? 0 : e.size, off + 1)
    header.writeUInt8(0, off + 2)
    header.writeUInt8(0, off + 3)
    header.writeUInt16LE(1, off + 4)
    header.writeUInt16LE(32, off + 6)
    header.writeUInt32LE(e.data.length, off + 8)
    header.writeUInt32LE(dataStart, off + 12)
    dataStart += e.data.length
    blobs.push(e.data)
  }
  return Buffer.concat(blobs)
}

async function run() {
  const svg = iconSvg()

  // 1) 浏览器 favicon（public/）
  const publicDir = path.join(ROOT, 'public')
  fs.mkdirSync(publicDir, { recursive: true })
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svg)
  for (const s of [16, 32, 64, 128]) {
    fs.writeFileSync(path.join(publicDir, `favicon-${s}.png`), await png(svg, s))
  }

  // 2) Electron（electron/assets/）
  const assetsDir = path.join(ROOT, 'electron', 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), await png(svg, 512))
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), await buildIco(svg))

  // 3) Android launcher（android/app/src/main/res/mipmap-*dpi/）
  const androidBase = path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
  const map = [
    ['mipmap-mdpi', 48],
    ['mipmap-hdpi', 72],
    ['mipmap-xhdpi', 96],
    ['mipmap-xxhdpi', 144],
    ['mipmap-xxxhdpi', 192]
  ]
  for (const [dir, size] of map) {
    const d = path.join(androidBase, dir)
    fs.mkdirSync(d, { recursive: true })
    const buf = await png(svg, size)
    fs.writeFileSync(path.join(d, 'ic_launcher.png'), buf)
    fs.writeFileSync(path.join(d, 'ic_launcher_round.png'), buf)
  }

  console.log('ICONS generated -> public/ electron/assets/ android mipmap/')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})