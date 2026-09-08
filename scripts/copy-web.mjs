/**
 * 将 Vite 构建产物 dist/ 同步到 Flutter 外壳 assets/web/
 * 用法：npm run build && node scripts/copy-web.mjs
 * 之后再在 flutter_app/ 中执行 flutter build 即可打包。
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const target = path.join(root, 'flutter_app', 'assets', 'web')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(dist, target, { recursive: true })
console.log(`[copy-web] ${dist} -> ${target}`)