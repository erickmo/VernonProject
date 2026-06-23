import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const src = '../vernon_project/public/frontend_web/index.html'
const dest = '../vernon_project/www/web.html'

if (!existsSync(src)) {
  console.error(`[copy-html] build output not found at ${src}`)
  process.exit(1)
}
mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log(`[copy-html] ${src} -> ${dest}`)
