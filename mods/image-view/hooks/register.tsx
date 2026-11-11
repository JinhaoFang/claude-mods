import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Pictures, Preview } from '../types'
import { base64Bytes, fitOne, fitRow, pngSize, toolImages } from './images'
import type { ToolImage } from './images'
import { displayPath, draftRefs, fileUrl, resolvePath } from './paths'
import type { PathContext } from './paths'

const RETRY_MS = 200
const RETRIES = 10
const PROBE_DELAY_MS = 400
const PROBE_ATTEMPTS = 3
const TRANSCRIPT_ROWS = 12
const TRANSCRIPT_INDENT = 5
const MAX_READ_BYTES = 4 * 1024 * 1024
const MAX_TREE_BYTES = 2 * 1024 * 1024

const pictures = atom({ plugin: 'image-view', key: 'pictures' } as const, 'unknown' as Pictures)
const draft = atom({ plugin: 'image-view', key: 'draft' } as const, [] as Preview[])
const readPaths = atom({ plugin: 'image-view', key: 'readPaths' } as const, {} as Record<string, string>)

let context: PathContext | undefined
let tmpRoot: string | undefined
let sessionImages: { sessionId: string; dir: string } | undefined
let latestDraft = ''
// The draft last shown; undefined while a pasted image's file is still missing, so a
// retry looks again.
let shownDraft: string | undefined
let shownJson = '[]'
let isChecking = false
let retries = 0
let isProbing = false
const pngSizes = new Map<string, ReturnType<typeof pngSize>>()

async function pathContext($: EngineInterface): Promise<PathContext> {
  const wslDistro = await $.env.get('WSL_DISTRO_NAME')
  context = { cwd: await $.session.cwd(), home: await $.env.get('HOME'), ...(wslDistro && { wslDistro }) }
  return context
}

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.png. The project
// folder is named after a working directory that may since have moved, so it is found by
// the session id.
async function imagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (sessionImages?.sessionId === sessionId) return sessionImages.dir
  tmpRoot ??= (await $.env.get('CLAUDE_CODE_TMPDIR')) ?? `/tmp/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`
  for (const entry of await $.fs.list(tmpRoot).catch(() => [])) {
    const dir = `${tmpRoot}/${entry.name}/${sessionId}/images`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      sessionImages = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

async function filePreview($: EngineInterface, label: string, path: string): Promise<Preview | undefined> {
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat?.kind !== 'file') return undefined
  const preview: Preview = { label, href: fileUrl(path, context?.wslDistro) }
  if (!/\.png$/i.test(path)) return preview
  const key = `${path}:${stat.size}:${stat.mtimeMs}`
  if (!pngSizes.has(key) && stat.size <= MAX_READ_BYTES) {
    const head = await $.fs.read(path, { as: 'bytes' }).then(({ base64 }) => pngSize(base64), () => null)
    pngSizes.set(key, head)
    if (head === null) return preview
  }
  const size = pngSizes.get(key) ?? undefined
  return {
    ...preview,
    ...(size && { size, detail: `${size.width}×${size.height}` }),
    picture: { file: path, format: 'png', generation: Math.floor(stat.mtimeMs) },
  }
}

// The draft arrives by event, not by polling: an edit (keys, a text paste) or a change no
// edit carried, which is how a pasted image's [Image #n] tag lands.
function draftChanged($: EngineInterface, text: string) {
  latestDraft = text
  retries = 0
  void check($)
}

async function check($: EngineInterface) {
  if (isChecking) return
  isChecking = true
  try {
    let text: string
    do {
      text = latestDraft
      await show($, text)
    } while (text !== latestDraft)
  } finally {
    isChecking = false
  }
  // A pasted image's file may land after its tag does.
  if (shownDraft === undefined && retries < RETRIES) {
    retries += 1
    $.clock.after(RETRY_MS, () => check($))
  }
}

async function show($: EngineInterface, text: string) {
  if (text === shownDraft) return
  const refs = draftRefs(text)
  const where = refs.some(ref => ref.kind === 'path') ? await pathContext($) : (context ??= await pathContext($))
  const dir = refs.some(ref => ref.kind === 'pasted') ? await imagesDir($) : undefined
  const list: Preview[] = []
  let isComplete = true
  for (const ref of refs) {
    if (ref.kind === 'pasted') {
      const label = `[Image #${ref.n}]`
      const preview = dir === undefined ? undefined : await filePreview($, label, `${dir}/${ref.n}.png`)
      if (preview === undefined) isComplete = false
      list.push(preview ?? { label, detail: 'not found' })
    } else {
      const path = resolvePath(ref.written, where)
      const preview = path && (await filePreview($, ref.written, path))
      if (preview) list.push(preview)
    }
  }
  shownDraft = isComplete ? text : undefined
  const json = JSON.stringify(list)
  if (json === shownJson) return
  shownJson = json
  await update($, draft, () => list)
}

// No call says whether the terminal draws pictures, but a blit to a mounted Image is denied
// where it draws its alt instead. The probe is a file source, so `on` means file and byte
// sources alike are drawn.
function probeSource($: EngineInterface) {
  return { file: `${$.plugin.root}/assets/probe.png`, format: 'png' } as const
}

function probe($: EngineInterface, requestId: string, attempt = 1) {
  $.clock.after(PROBE_DELAY_MS, async () => {
    const { deny } = await $.ui.blit({ requestId, key: 'probe', source: probeSource($) })
    if (deny?.startsWith('no-surface')) {
      isProbing = false
      return
    }
    // An early deny may only mean the probe is not mounted yet; a steady one is the alt.
    if (deny !== undefined && attempt < PROBE_ATTEMPTS) return probe($, requestId, attempt + 1)
    await update($, pictures, () => (deny === undefined ? 'on' : 'off'))
  })
}

function startProbe($: EngineInterface, requestId: string): true {
  if (!isProbing) {
    isProbing = true
    probe($, requestId)
  }
  return true
}

type TerminalElements = Pick<Elements['terminal'], 'Box' | 'Image' | 'Link' | 'Text'>

function caption({ Link, Text }: TerminalElements, preview: Preview) {
  return (
    <Text wrap="truncate">
      {preview.href ? <Link href={preview.href}>{preview.label}</Link> : preview.label}
      {preview.detail ? <Text dimColor>{`  ${preview.detail}`}</Text> : ''}
    </Text>
  )
}

// Rows printed above the live area stay as printed, so a picture is drawn under a tool's
// result only once the probe has seen the terminal draw one: never an empty box where the
// alt went.
function drawBelow(elements: TerminalElements, engine: RenderChildren, previews: Preview[], mode: Pictures, viewColumns = 80) {
  const { Box, Image } = elements
  const maxColumns = Math.max(10, viewColumns - TRANSCRIPT_INDENT - 1)
  return (
    <Box flexDirection="column">
      {engine}
      {previews.map((preview, i) => {
        if (mode !== 'on' || preview.picture === undefined) {
          return <Box paddingLeft={TRANSCRIPT_INDENT}>{caption(elements, preview)}</Box>
        }
        const { columns, rows } = fitOne(preview.size, maxColumns, TRANSCRIPT_ROWS)
        return (
          <Box flexDirection="column" paddingLeft={TRANSCRIPT_INDENT}>
            <Image key={`image-${i}`} source={preview.picture} columns={columns} rows={rows} alt={preview.label} />
            {caption(elements, preview)}
          </Box>
        )
      })}
    </Box>
  )
}

// One tree carries at most 2 MiB of picture bytes; past that a PNG file is named instead.
function toolPreviews(tool: string, images: ToolImage[], budget = { bytes: MAX_TREE_BYTES }): Preview[] {
  return images.map((image, i) => {
    const bytes = base64Bytes(image.base64)
    let picture: Preview['picture']
    if (image.mediaType === 'image/png' && bytes <= budget.bytes) {
      picture = { png: image.base64 }
      budget.bytes -= bytes
    } else if (image.path !== undefined && /\.png$/i.test(image.path)) {
      picture = { file: image.path, format: 'png' }
    }
    const label =
      image.path !== undefined
        ? context ? displayPath(image.path, context) : image.path
        : `${tool.split('__').slice(2).join('__')} image${images.length > 1 ? ` ${i + 1}` : ''}`
    return {
      label,
      ...(image.path !== undefined && { href: fileUrl(image.path, context?.wslDistro) }),
      ...(image.size && { size: image.size, detail: `${image.size.width}×${image.size.height}` }),
      ...(picture && { picture }),
    }
  })
}

function readPathOf(input: unknown): string | undefined {
  const path = typeof input === 'object' && input !== null ? (input as { file_path?: unknown }).file_path : undefined
  return typeof path === 'string' ? path : undefined
}

export const register: Register = on => {
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    draftChanged($, box.text)
    return box
  })

  on('prompt.change', async ($, e, next) => {
    draftChanged($, e.text)
    return next(e)
  })

  // A ToolResult carries no input, so the path a Read of an image opened is kept by its call.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const result = await next(e)
    const output = 'result' in result ? (result.result as { type?: unknown }) : undefined
    const path = readPathOf(e)
    if (output?.type === 'image' && path !== undefined) {
      await update($, readPaths, paths => ({ ...paths, [e.tool_use_id]: path }))
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const mode = await read($, pictures)
    const list = await read($, draft)
    const isProbe = mode === 'unknown' && startProbe($, e.requestId)
    if (list.length === 0 && !isProbe) return next(e)

    const elements = $.ui.resolve(e)
    const { Box, Image } = elements
    const drawn = mode === 'on' ? list.filter(preview => preview.picture) : []
    const lines = list.filter(preview => !drawn.includes(preview))
    const cells = fitRow(drawn.map(preview => preview.size), e.props.maxRows, e.props.bodyColumns)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {isProbe ? <Image key="probe" source={probeSource($)} columns={1} rows={1} alt=" " /> : ''}
        {drawn.length > 0 ? (
          <Box flexDirection="row" columnGap={2}>
            {drawn.map((preview, i) => {
              const { columns, rows } = cells[i] ?? { columns: 6, rows: 3 }
              return (
                <Box flexDirection="column" width={columns}>
                  <Image key={`image-${i}`} source={preview.picture!} columns={columns} rows={rows} alt={preview.label} />
                  {caption(elements, { ...preview, detail: undefined })}
                </Box>
              )
            })}
          </Box>
        ) : ''}
        {lines.map(preview => caption(elements, preview))}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isErrored || e.props.isExpanded) return next(e)
    if (toolImages(e.props.tool, e.props.output, undefined).length === 0) return next(e)
    context ??= await pathContext($)
    const path = (await read($, readPaths))[e.props.tool_use_id]
    const previews = toolPreviews(e.props.tool, toolImages(e.props.tool, e.props.output, path))
    return drawBelow($.ui.resolve(e), await next(e), previews, await read($, pictures), e.viewport?.columns)
  })

  // A run of reads folds into one line, its calls' results with it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    context ??= await pathContext($)
    const budget = { bytes: MAX_TREE_BYTES }
    const previews = e.props.calls.flatMap(call =>
      call.isRunning || call.isErrored
        ? []
        : toolPreviews(call.tool, toolImages(call.tool, call.output, readPathOf(call.input)), budget),
    )
    if (previews.length === 0) return next(e)
    return drawBelow($.ui.resolve(e), await next(e), previews, await read($, pictures), e.viewport?.columns)
  })
}
