import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.resolve(here, '../../package.json'), 'utf8'))
const publicDir = path.resolve(here, '../public')
mkdirSync(publicDir, { recursive: true })
writeFileSync(
  path.join(publicDir, 'version.json'),
  JSON.stringify({ version: pkg.version }, null, 2) + '\n',
)
console.log(`version.json -> ${pkg.version}`)
