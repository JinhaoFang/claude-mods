import type { Size } from '../types'

export type Cells = { columns: number; rows: number }

/** An image a tool returned: its bytes as the model got them, and the file it came from when there is one. */
export type ToolImage = { mediaType: string; base64: string; size: Size | undefined; path: string | undefined }

/** Width and height from a PNG's IHDR chunk, or null when the bytes aren't a PNG. */
export function pngSize(base64: string): Size | null {
  let head: string
  try {
    head = atob(base64.slice(0, 32))
  } catch {
    return null
  }
  if (head.length < 24 || !head.startsWith('\x89PNG\r\n\x1a\n') || head.slice(12, 16) !== 'IHDR') return null
  const at = (i: number) => ((head.charCodeAt(i) << 24) | (head.charCodeAt(i + 1) << 16) | (head.charCodeAt(i + 2) << 8) | head.charCodeAt(i + 3)) >>> 0
  const width = at(16)
  const height = at(20)
  return width > 0 && height > 0 ? { width, height } : null
}

export function base64Bytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}

/** The images in a tool's result: a Read of an image file, or the image blocks of an MCP result. */
export function toolImages(tool: string, output: unknown, path: string | undefined): ToolImage[] {
  if (tool === 'Read') {
    if (!isRecord(output) || output.type !== 'image' || !isRecord(output.file)) return []
    const { base64, type, dimensions } = output.file
    if (typeof base64 !== 'string' || typeof type !== 'string') return []
    const width = isRecord(dimensions) ? (dimensions.originalWidth ?? dimensions.displayWidth) : undefined
    const height = isRecord(dimensions) ? (dimensions.originalHeight ?? dimensions.displayHeight) : undefined
    const size = typeof width === 'number' && typeof height === 'number' ? { width, height } : undefined
    return [{ mediaType: type, base64, size: size ?? (type === 'image/png' ? (pngSize(base64) ?? undefined) : undefined), path }]
  }
  if (!tool.startsWith('mcp__')) return []
  const blocks = Array.isArray(output) ? output : isRecord(output) && Array.isArray(output.content) ? output.content : []
  return blocks.flatMap((block): ToolImage[] => {
    if (!isRecord(block) || block.type !== 'image') return []
    // MCP spells an image block { data, mimeType }; the Messages API { source: { data, media_type } }.
    const source = isRecord(block.source) ? block.source : block
    const base64 = source.data
    const mediaType = source.mimeType ?? source.media_type
    if (typeof base64 !== 'string' || typeof mediaType !== 'string') return []
    return [{ mediaType, base64, size: mediaType === 'image/png' ? (pngSize(base64) ?? undefined) : undefined, path: undefined }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// A terminal cell is about twice as tall as it is wide.
function columnsFor(size: Size | undefined, rows: number): number {
  return size === undefined ? rows * 2 : Math.round((rows * 2 * size.width) / size.height)
}

/** One picture's cells: at most `maxRows` tall and `maxColumns` wide, its shape kept. */
export function fitOne(size: Size | undefined, maxColumns: number, maxRows: number): Cells {
  const columns = columnsFor(size, maxRows)
  if (columns <= maxColumns) return { columns: Math.max(1, columns), rows: maxRows }
  const rows = size === undefined ? Math.round(maxColumns / 2) : Math.round((maxColumns * size.height) / (2 * size.width))
  return { columns: maxColumns, rows: Math.max(1, Math.min(maxRows, rows)) }
}

const TILE_ROWS = 8
const TILE_GAP = 2
const TILE_MIN_COLUMNS = 6
const TILE_MAX_COLUMNS = 48

/**
 * A row of tiles, each a picture over a one-row caption, that fits `columns` and `maxRows`:
 * every tile shares one height, shrunk until the row fits, its width following its shape.
 */
export function fitRow(sizes: readonly (Size | undefined)[], maxRows: number, columns: number): Cells[] {
  const tile = (size: Size | undefined, rows: number) =>
    Math.min(TILE_MAX_COLUMNS, Math.max(TILE_MIN_COLUMNS, columnsFor(size, rows)))
  let rows = Math.max(1, Math.min(TILE_ROWS, maxRows - 1))
  for (; rows > 1; rows--) {
    const width = sizes.reduce((sum, size) => sum + tile(size, rows), TILE_GAP * (sizes.length - 1))
    if (width <= columns) break
  }
  return sizes.map(size => ({ columns: tile(size, rows), rows }))
}

/** The variables Claude Code decides by whether its `Image` draws a picture or its alt. */
export type TerminalEnv = {
  [name in
    | 'TERM'
    | 'TERM_PROGRAM'
    | 'KITTY_WINDOW_ID'
    | 'GHOSTTY_RESOURCES_DIR'
    | 'TMUX'
    | 'STY'
    | 'SSH_CONNECTION'
    | 'CLAUDE_CODE_SESSION_KIND'
    | 'CLAUDE_CODE_FORCE_TERMINAL_IMAGES']?: string | undefined
}

/**
 * Whether Claude Code draws pictures here: kitty and Ghostty, but not inside tmux or screen,
 * over ssh (a file source is read by the terminal, on its own machine) or in a background
 * session, unless forced.
 */
export function drawsPictures(env: TerminalEnv): boolean {
  if (env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES === '1' || env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES === 'true') return true
  if (env.CLAUDE_CODE_SESSION_KIND === 'bg' || env.TMUX || env.STY || env.SSH_CONNECTION) return false
  if (env.TERM === 'xterm-kitty' || env.TERM === 'xterm-ghostty') return true
  // An editor's terminal started from kitty or Ghostty inherits their variables but not their pictures.
  if (env.TERM_PROGRAM !== undefined) return env.TERM_PROGRAM === 'ghostty'
  return env.KITTY_WINDOW_ID !== undefined || env.GHOSTTY_RESOURCES_DIR !== undefined
}
