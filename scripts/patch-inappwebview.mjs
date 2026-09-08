/**
 * 兼容补丁：flutter_inappwebview_android 仍使用已废弃的
 * getDefaultProguardFile('proguard-android.txt')，AGP 9 会直接报错。
 * 将该引用替换为 proguard-android-optimize.txt（幂等，可重复执行）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

function pubCacheDir() {
  if (process.env.PUB_CACHE) return process.env.PUB_CACHE
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir(), 'Pub', 'Cache')
  }
  return join(os.homedir(), '.pub-cache')
}

const hostedDir = join(pubCacheDir(), 'hosted', 'pub.dev')

let patched = 0
let dirs
try {
  dirs = readdirSync(hostedDir)
} catch {
  console.warn(`[patch-inappwebview] pub cache dir not found: ${hostedDir}`)
  process.exit(0)
}

for (const entry of dirs) {
  if (!entry.startsWith('flutter_inappwebview_android-')) continue
  const file = join(hostedDir, entry, 'android', 'build.gradle')
  try {
    const raw = readFileSync(file, 'utf-8')
    const next = raw.replace(
      /getDefaultProguardFile\('proguard-android\.txt'\)/g,
      "getDefaultProguardFile('proguard-android-optimize.txt')"
    )
    if (next !== raw) {
      writeFileSync(file, next)
      patched++
      console.log(`[patch-inappwebview] patched ${entry}`)
    }
  } catch {
    /* 插件目录结构不同则跳过 */
  }
}

console.log(patched ? `[patch-inappwebview] done (${patched} patched)` : '[patch-inappwebview] nothing to patch')