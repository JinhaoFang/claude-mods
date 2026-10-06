// Repo verification seam: validates every mod, the root manifest, and folder/entry agreement.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const MODS_DIR = path.join(ROOT, 'mods')
const MARKETPLACE_MANIFEST = path.join(ROOT, '.claude-plugin', 'marketplace.json')

export function findAgreementProblems(folders, entries) {
  const problems = []
  const folderNames = new Set(folders.map((folder) => folder.name))

  for (const folder of folders) {
    const source = `./mods/${folder.name}`
    const matches = entries.filter((entry) => entry.source === source)

    if (matches.length === 0) {
      problems.push(`mods/${folder.name} has no manifest entry`)
      continue
    }

    if (matches.length > 1) {
      problems.push(`mods/${folder.name} has ${matches.length} manifest entries`)
    }

    for (const entry of matches) {
      if (entry.name !== folder.name) {
        problems.push(`mods/${folder.name} is listed under the name "${entry.name}"`)
      }
      if (entry.name !== folder.pluginName) {
        problems.push(
          `mods/${folder.name} entry "${entry.name}" does not match its plugin.json name "${folder.pluginName}"`,
        )
      }
    }
  }

  for (const entry of entries) {
    const folderName = (entry.source ?? '')
      .replace(/^\.\//, '')
      .replace(/^mods\//, '')
      .replace(/\/$/, '')

    if (!folderNames.has(folderName)) {
      problems.push(
        `manifest entry "${entry.name}" points at "${entry.source}", which has no mod folder`,
      )
    }
  }

  return problems
}

function readPluginName(modFolder) {
  const manifestPath = path.join(modFolder, '.claude-plugin', 'plugin.json')
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')).name
  } catch {
    return null
  }
}

function readModFolders() {
  return readdirSync(MODS_DIR, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => ({
      name: item.name,
      pluginName: readPluginName(path.join(MODS_DIR, item.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function readManifestEntries() {
  const manifest = JSON.parse(readFileSync(MARKETPLACE_MANIFEST, 'utf8'))
  return (manifest.plugins ?? []).map((plugin) => ({
    name: plugin.name,
    source: plugin.source,
  }))
}

function runClaude(args) {
  const result = spawnSync('claude', args, { cwd: ROOT, stdio: 'inherit' })
  return result.status === 0
}

function main() {
  const failures = []
  const modFolders = readModFolders()

  for (const folder of modFolders) {
    const modDir = path.join('mods', folder.name)
    if (!runClaude(['plugin', 'validate', '--strict', modDir])) {
      failures.push(`claude plugin validate --strict ${modDir} failed`)
    }
    if (!runClaude(['plugin', 'test', modDir])) {
      failures.push(`claude plugin test ${modDir} failed`)
    }
  }

  if (!runClaude(['plugin', 'validate', '--strict', '.'])) {
    failures.push('claude plugin validate --strict . failed')
  }

  failures.push(...findAgreementProblems(modFolders, readManifestEntries()))

  if (failures.length > 0) {
    console.error('\ncheck failed:')
    for (const failure of failures) {
      console.error(`  - ${failure}`)
    }
    process.exitCode = 1
    return
  }

  console.log('\ncheck passed')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
