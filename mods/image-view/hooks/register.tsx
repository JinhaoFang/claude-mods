import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Preview } from '../types'
import { base64Bytes, drawsPictures, fitOne, fitRow, pngSize, toolImages } from './images'
import type { TerminalEnv, ToolImage } from './images'
import { displayPath, draftRefs, fileUrl, resolvePath } from './paths'
import type { PathContext } from './paths'
import { base64ToBytes, blockCells, decodeThumb } from './png'
import type { Thumb } from './png'

const RETRY_MS = 200
const RETRIES = 10
const TRANSCRIPT_ROWS = 12
const TRANSCRIPT_MAX_COLUMNS = 80
const TRANSCRIPT_INDENT = 5
const MAX_READ_BYTES = 4 * 1024 * 1024
const MAX_TREE_BYTES = 2 * 1024 * 1024
const THUMBS_KEPT = 48

const draft = atom({ plugin: 'image-view', key: 'draft' } as const, [] as Preview[])
const readPaths = atom({ plugin: 'image-view', key: 'readPaths' } as const, {} as Record<string, string>)

let pictures: boolean | undefined
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
const pngSizes = new Map<string, ReturnType<typeof pngSize>>()
// Decoded thumbnails, newest last, for terminals that draw blocks instead of pictures.
const thumbs = new Map<string, Thumb | null>()

function keepThumb(key: string, thumb: Thumb | null) {
  thumbs.delete(key)
  thumbs.set(key, thumb)
  if (thumbs.size > THUMBS_KEPT) thumbs.delete(thumbs.keys().next().value!)
}

// Claude Code says nowhere whether its Image draws a picture, so go by the environment it
// decides from.
async function canDrawPictures($: EngineInterface): Promise<boolean> {
  if (pictures === undefined) {
    const env: TerminalEnv = {
      TERM: await $.env.get('TERM'),
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
      KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
      GHOSTTY_RESOURCES_DIR: await $.env.get('GHOSTTY_RESOURCES_DIR'),
      TMUX: await $.env.get('TMUX'),
      STY: await $.env.get('STY'),
      SSH_CONNECTION: await $.env.get('SSH_CONNECTION'),
      CLAUDE_CODE_SESSION_KIND: await $.env.get('CLAUDE_CODE_SESSION_KIND'),
      CLAUDE_CODE_FORCE_TERMINAL_IMAGES: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
    }
    pictures = drawsPictures(env)
  }
  return pictures
}

async function pathContext($: EngineInterface): Promise<PathContext> {
  const wslDistro = await $.env.get('WSL_DISTRO_NAME')
  context = { cwd: await $.session.cwd(), home: await $.env.get('HOME'), ...(wslDistro && { wslDistro }) }
  return context
}

// Claude Code caches each paste as <base>/claude-<uid>/<project>/<session>/images/<n>.<ext>,
// <base> being CLAUDE_CODE_TMPDIR or /tmp. The project folder is named after a working
// directory that may since have moved, so it is found by the session id.
async function imagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (sessionImages?.sessionId === sessionId) return sessionImages.dir
  if (tmpRoot === undefined) {
    const uid = await $.process.run(['id', '-u']).then(({ stdout }) => stdout.trim(), () => '')
    if (uid === '') return undefined
    tmpRoot = `${(await $.env.get('CLAUDE_CODE_TMPDIR')) ?? '/tmp'}/claude-${uid}`
  }
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
  const blocks = !(await canDrawPictures($))
  if ((!pngSizes.has(key) || (blocks && !thumbs.has(key))) && stat.size <= MAX_READ_BYTES) {
    const bytes = await $.fs.read(path, { as: 'bytes' }).then(({ base64 }) => base64, () => undefined)
    pngSizes.set(key, bytes === undefined ? null : pngSize(bytes))
    if (blocks && bytes !== undefined) keepThumb(key, decodeThumb(base64ToBytes(bytes)))
  }
  const size = pngSizes.get(key)
  if (size === null && stat.size <= MAX_READ_BYTES) return preview
  return {
    ...preview,
    ...(size && { size, detail: `${size.width}×${size.height}` }),
    picture: { file: path, format: 'png', generation: Math.floor(stat.mtimeMs) },
    ...(blocks && thumbs.get(key) && { thumb: key }),
  }
}

// The draft arrives by event: an edit (keys, a text paste) or a change no edit carried,
// which is how a pasted image's [Image #n] tag lands.
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
  const cached = dir === undefined ? [] : await $.fs.list(dir).catch(() => [])
  const list: Preview[] = []
  let isComplete = true
  for (const ref of refs) {
    if (ref.kind === 'pasted') {
      const label = `[Image #${ref.n}]`
      const file = cached.find(entry => entry.kind === 'file' && new RegExp(`^${ref.n}\\.[A-Za-z0-9]+$`).test(entry.name))
      const preview = file && (await filePreview($, label, `${dir}/${file.name}`))
      if (!preview) isComplete = false
      list.push(preview || { label, detail: 'not found' })
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

type TerminalElements = Pick<Elements['terminal'], 'Box' | 'Image' | 'Link' | 'Raster' | 'Text'>

function caption({ Link, Text }: TerminalElements, preview: Preview) {
  return (
    <Text wrap="truncate">
      {preview.href ? <Link href={preview.href}>{preview.label}</Link> : preview.label}
      {preview.detail ? <Text dimColor>{`  ${preview.detail}`}</Text> : ''}
    </Text>
  )
}

/** A preview's picture in its cells: the image where the terminal draws one, else blocks. */
function picture({ Image, Raster }: TerminalElements, preview: Preview, key: string, columns: number, rows: number, canDraw: boolean) {
  if (canDraw && preview.picture) {
    return <Image key={`image-${key}`} source={preview.picture} columns={columns} rows={rows} alt={preview.label} />
  }
  const thumb = preview.thumb === undefined ? undefined : thumbs.get(preview.thumb)
  return thumb ? <Raster key={`blocks-${key}`} columns={columns} rows={rows} cells={blockCells(thumb, columns, rows)} /> : ''
}

// A tile is narrow: its caption names the file, and the link still opens the whole path.
function baseName(label: string): string {
  return label.startsWith('[') ? label : (label.split(/[\\/]/).pop() ?? label)
}

function hasPicture(preview: Preview, canDraw: boolean): boolean {
  return canDraw ? preview.picture !== undefined : preview.thumb !== undefined && Boolean(thumbs.get(preview.thumb))
}

function drawBelow(elements: TerminalElements, engine: RenderChildren, previews: Preview[], canDraw: boolean, viewColumns = 80) {
  const { Box } = elements
  const maxColumns = Math.max(10, Math.min(TRANSCRIPT_MAX_COLUMNS, viewColumns - TRANSCRIPT_INDENT - 1))
  return (
    <Box flexDirection="column">
      {engine}
      {previews.map((preview, i) => {
        if (!hasPicture(preview, canDraw)) return <Box paddingLeft={TRANSCRIPT_INDENT}>{caption(elements, preview)}</Box>
        const { columns, rows } = fitOne(preview.size, maxColumns, TRANSCRIPT_ROWS)
        return (
          <Box flexDirection="column" paddingLeft={TRANSCRIPT_INDENT}>
            {picture(elements, preview, String(i), columns, rows, canDraw)}
            {caption(elements, preview)}
          </Box>
        )
      })}
    </Box>
  )
}

// One tree carries at most 2 MiB of picture bytes; past that a PNG file is named instead.
function toolPreviews(id: string, tool: string, images: ToolImage[], canDraw: boolean, budget = { bytes: MAX_TREE_BYTES }): Preview[] {
  return images.map((image, i) => {
    const isPng = image.mediaType === 'image/png'
    let picture: Preview['picture']
    let thumb: string | undefined
    if (canDraw) {
      const bytes = base64Bytes(image.base64)
      if (isPng && bytes <= budget.bytes) {
        picture = { png: image.base64 }
        budget.bytes -= bytes
      } else if (image.path !== undefined && /\.png$/i.test(image.path)) {
        picture = { file: image.path, format: 'png' }
      }
    } else if (isPng) {
      thumb = `${id}:${i}`
      if (!thumbs.has(thumb)) keepThumb(thumb, decodeThumb(base64ToBytes(image.base64)))
      if (!thumbs.get(thumb)) thumb = undefined
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
      ...(thumb && { thumb }),
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
    const list = await read($, draft)
    if (list.length === 0) return next(e)

    const canDraw = await canDrawPictures($)
    const elements = $.ui.resolve(e)
    const { Box } = elements
    const drawn = list.filter(preview => hasPicture(preview, canDraw))
    const lines = list.filter(preview => !drawn.includes(preview))
    const cells = fitRow(drawn.map(preview => preview.size), e.props.maxRows, e.props.bodyColumns)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {drawn.length > 0 ? (
          <Box flexDirection="row" columnGap={2}>
            {drawn.map((preview, i) => {
              const { columns, rows } = cells[i] ?? { columns: 6, rows: 3 }
              return (
                <Box flexDirection="column" width={columns}>
                  {picture(elements, preview, String(i), columns, rows, canDraw)}
                  {caption(elements, { ...preview, label: baseName(preview.label), detail: undefined })}
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
    const canDraw = await canDrawPictures($)
    const path = (await read($, readPaths))[e.props.tool_use_id]
    const previews = toolPreviews(e.props.tool_use_id, e.props.tool, toolImages(e.props.tool, e.props.output, path), canDraw)
    return drawBelow($.ui.resolve(e), await next(e), previews, canDraw, e.viewport?.columns)
  })

  // A run of reads folds into one line, its calls' results with it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    const done = e.props.calls.filter(call => !call.isRunning && !call.isErrored)
    if (!done.some(call => toolImages(call.tool, call.output, undefined).length > 0)) return next(e)
    context ??= await pathContext($)
    const canDraw = await canDrawPictures($)
    const budget = { bytes: MAX_TREE_BYTES }
    const previews = done.flatMap((call, i) =>
      toolPreviews(
        call.tool_use_id ?? `${e.requestId}:${i}`,
        call.tool,
        toolImages(call.tool, call.output, readPathOf(call.input)),
        canDraw,
        budget,
      ),
    )
    return drawBelow($.ui.resolve(e), await next(e), previews, canDraw, e.viewport?.columns)
  })
}
