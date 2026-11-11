export type DraftRef = { kind: 'pasted'; n: number } | { kind: 'path'; written: string }

/** `wslDistro` names the WSL distribution the session runs in, absent outside WSL. */
export type PathContext = { cwd: string; home: string | undefined; wslDistro?: string }

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp)$/i
const TOKEN = /\[Image #(\d+)\]|"([^"\n]+)"|'([^'\n]+)'|((?:\\ |[^\s"'])+)/g

/** The pasted-image tags and image paths in a draft, in the order written, each once. */
export function draftRefs(draft: string): DraftRef[] {
  const refs: DraftRef[] = []
  const seen = new Set<string>()
  for (const match of draft.matchAll(TOKEN)) {
    const [, tag, doubleQuoted, singleQuoted, bare] = match
    const ref: DraftRef | undefined =
      tag !== undefined
        ? { kind: 'pasted', n: Number(tag) }
        : imagePath(doubleQuoted ?? singleQuoted ?? bare?.replaceAll('\\ ', ' ') ?? '')
    if (ref === undefined) continue
    const id = ref.kind === 'pasted' ? `#${ref.n}` : ref.written
    if (seen.has(id)) continue
    seen.add(id)
    refs.push(ref)
  }
  return refs
}

function imagePath(token: string): DraftRef | undefined {
  const written = token.replace(/^[@(<[]+/, '').replace(/[)>\]},.;:!?]+$/, '')
  return IMAGE_EXTENSION.test(written) ? { kind: 'path', written } : undefined
}

/** The absolute path a written path names, or undefined when it names none this machine can reach. */
export function resolvePath(written: string, context: PathContext): string | undefined {
  if (/^file:\/\//i.test(written)) {
    let path: string
    try {
      path = decodeURIComponent(new URL(written).pathname)
    } catch {
      return undefined
    }
    return resolvePath(/^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path, context)
  }
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(written)
  if (drive) {
    const [, letter = '', rest = ''] = drive
    return context.wslDistro !== undefined ? normalize(`/mnt/${letter.toLowerCase()}/${rest.replaceAll('\\', '/')}`) : undefined
  }
  const wslShare = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)$/i.exec(written)
  if (wslShare) return context.wslDistro !== undefined ? normalize((wslShare[1] ?? '').replaceAll('\\', '/')) : undefined
  if (written.startsWith('\\\\')) return undefined
  if (written.startsWith('~/')) return context.home === undefined ? undefined : normalize(`${context.home}/${written.slice(2)}`)
  if (written.startsWith('/')) return normalize(written)
  return normalize(`${context.cwd}/${written}`)
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

/** How a path reads in a caption: relative under the working directory, `~` under home. */
export function displayPath(path: string, context: PathContext): string {
  if (path.startsWith(`${context.cwd}/`)) return path.slice(context.cwd.length + 1)
  if (context.home !== undefined && path.startsWith(`${context.home}/`)) return `~${path.slice(context.home.length)}`
  return path
}

// On WSL a click is opened by Windows, which reaches the distribution's files through its
// \\wsl.localhost share, not by their Linux path.
export function fileUrl(path: string, wslDistro?: string): string {
  const host = wslDistro === undefined ? '' : `wsl.localhost/${encodeURIComponent(wslDistro)}`
  return `file://${host}${encodeURI(path).replaceAll('#', '%23').replaceAll('?', '%3F')}`
}
