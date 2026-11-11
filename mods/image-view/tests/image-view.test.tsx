import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { PromptChangeInput, PromptEditInput } from 'claude-code'

import { fitOne, fitRow, pngSize, toolImages } from '../hooks/images'
import { displayPath, draftRefs, fileUrl, resolvePath } from '../hooks/paths'

function pngBase64(width: number, height: number): string {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return btoa(String.fromCharCode(...bytes))
}

const WSL = { cwd: '/work/app', home: '/home/me', wslDistro: 'Ubuntu' }

test('a draft yields its pasted tags and image paths in order, each once', () => {
  const draft = `see [Image #2], @shots/a.png and "/tmp/my shot.PNG" or my\\ pic.jpg (b.webp). [Image #2] a.png notes.txt`
  expect(draftRefs(draft)).toEqual([
    { kind: 'pasted', n: 2 },
    { kind: 'path', written: 'shots/a.png' },
    { kind: 'path', written: '/tmp/my shot.PNG' },
    { kind: 'path', written: 'my pic.jpg' },
    { kind: 'path', written: 'b.webp' },
    { kind: 'path', written: 'a.png' },
  ])
  expect(draftRefs('[Image 1] [image #3] picture.pngx')).toEqual([])
})

test('written paths resolve against the working directory, home and Windows drives', () => {
  expect(resolvePath('shots/../a.png', WSL)).toBe('/work/app/a.png')
  expect(resolvePath('~/Pictures/a.png', WSL)).toBe('/home/me/Pictures/a.png')
  expect(resolvePath('/tmp/a.png', WSL)).toBe('/tmp/a.png')
  expect(resolvePath('C:\\Users\\me\\Desktop\\a.png', WSL)).toBe('/mnt/c/Users/me/Desktop/a.png')
  expect(resolvePath('\\\\wsl.localhost\\Ubuntu\\home\\me\\a.png', WSL)).toBe('/home/me/a.png')
  expect(resolvePath('file:///tmp/my%20shot.png', WSL)).toBe('/tmp/my shot.png')
  expect(resolvePath('file:///D:/pics/a.png', WSL)).toBe('/mnt/d/pics/a.png')
  expect(resolvePath('C:\\a.png', { cwd: '/work/app', home: '/home/me' })).toBeUndefined()
  expect(resolvePath('\\\\server\\share\\a.png', WSL)).toBeUndefined()
})

test('captions shorten paths and links escape what a URL reads specially', () => {
  expect(displayPath('/work/app/shots/a.png', WSL)).toBe('shots/a.png')
  expect(displayPath('/home/me/a.png', WSL)).toBe('~/a.png')
  expect(displayPath('/tmp/a.png', WSL)).toBe('/tmp/a.png')
  expect(fileUrl('/tmp/my shot #1?.png')).toBe('file:///tmp/my%20shot%20%231%3F.png')
  // On WSL, Windows opens the click, through the distribution's share.
  expect(fileUrl('/root/a.png', 'Ubuntu22.04')).toBe('file://wsl.localhost/Ubuntu22.04/root/a.png')
})

test('PNG size is read from the IHDR header', () => {
  expect(pngSize(pngBase64(1630, 632))).toEqual({ width: 1630, height: 632 })
  expect(pngSize(btoa('\xff\xd8\xff\xe0 this is a jpeg, not a png...'))).toBeNull()
})

test('images come from a Read of an image file and from MCP image blocks of either spelling', () => {
  const read = {
    type: 'image',
    file: { base64: 'AAAA', type: 'image/jpeg', originalSize: 3, dimensions: { originalWidth: 640, originalHeight: 480 } },
  }
  expect(toolImages('Read', read, '/w/a.jpg')).toEqual([
    { mediaType: 'image/jpeg', base64: 'AAAA', size: { width: 640, height: 480 }, path: '/w/a.jpg' },
  ])
  expect(toolImages('Read', { type: 'text', file: { content: 'hi' } }, '/w/a.txt')).toEqual([])
  expect(toolImages('Bash', read, undefined)).toEqual([])

  const png = pngBase64(100, 50)
  const blocks = [
    { type: 'text', text: 'done' },
    { type: 'image', data: png, mimeType: 'image/png' },
    { type: 'image', source: { type: 'base64', data: 'BBBB', media_type: 'image/webp' } },
  ]
  const expected = [
    { mediaType: 'image/png', base64: png, size: { width: 100, height: 50 }, path: undefined },
    { mediaType: 'image/webp', base64: 'BBBB', size: undefined, path: undefined },
  ]
  expect(toolImages('mcp__browser__screenshot', blocks, undefined)).toEqual(expected)
  expect(toolImages('mcp__browser__screenshot', { content: blocks, isError: false }, undefined)).toEqual(expected)
})

test('a picture keeps its shape within its rows and columns', () => {
  // Cells are about twice as tall as wide, so a square takes twice as many columns as rows.
  expect(fitOne({ width: 500, height: 500 }, 100, 12)).toEqual({ columns: 24, rows: 12 })
  expect(fitOne({ width: 4000, height: 500 }, 60, 12)).toEqual({ columns: 60, rows: 4 })
  expect(fitOne(undefined, 100, 12)).toEqual({ columns: 24, rows: 12 })
})

test('a row of tiles shrinks until it fits the band', () => {
  const square = { width: 500, height: 500 }
  expect(fitRow([square], 20, 120)).toEqual([{ columns: 16, rows: 8 }])
  // The caption takes a row of the band.
  expect(fitRow([square], 5, 120)).toEqual([{ columns: 8, rows: 4 }])
  // Three 8-row squares need 3 * 16 + 2 * 2 = 52 columns; 40 forces 6 rows.
  expect(fitRow([square, square, square], 20, 40)).toEqual([
    { columns: 12, rows: 6 },
    { columns: 12, rows: 6 },
    { columns: 12, rows: 6 },
  ])
})

const BAND = {
  plugin: 'image-view',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  surface: 'terminal',
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

function engineBeneath(on: Parameters<TestBody>[1], deny: string | undefined, env: Record<string, string> = {}) {
  on('session.start', () => ({ cwd: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('prompt.edit', ($, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    return { text, cursor: e.start + e.inputText.length }
  })
  on('prompt.change', ($, e) => ({ text: e.text, cursor: e.cursor }))
  on('env.get', ($, e) => ({ value: { HOME: '/home/me', CLAUDE_CODE_TMPDIR: '/tmp/claude-501', ...env }[e.name] }))
  on('fs.list', () => ({ value: [{ name: '-work', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  on('fs.exists', ($, e) => ({ value: e.path === '/tmp/claude-501/-work/sess-1/images' }))
  on('fs.stat', ($, e) =>
    ['/tmp/claude-501/-work/sess-1/images/1.png', '/work/shots/a.png', '/work/b.jpg'].includes(e.path)
      ? { value: { kind: 'file', size: 64, mtimeMs: 1000, isLink: false } }
      : { deny: 'ENOENT: no such file' },
  )
  on('fs.read', () => ({ value: { base64: pngBase64(800, 400) } }))
  on('ui.blit', () => ({ value: deny === undefined ? {} : { deny } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

// The test engine raises the prompt box's events, but its types leave them out.
type PromptEvents = { edit: (e: PromptEditInput) => Promise<unknown>; change: (e: PromptChangeInput) => Promise<unknown> }
const prompt = ($: Parameters<TestBody>[0]) => $.prompt as unknown as PromptEvents

function typeInto($: Parameters<TestBody>[0], before: string, inputText: string) {
  return prompt($).edit({ origin: { kind: 'composer' }, text: before, cursor: before.length, start: before.length, end: before.length, inputText })
}

test('where the terminal draws its alt, the band lists each image as a link and draws no picture', async ($, on) => {
  // No session.start: a mod updated mid-session never sees one, and the band still follows the draft.
  const clock = mock.clock(on)
  engineBeneath(on, 'the Image draws its alt here: no placeholder images')

  const probing = await $.ui.mount(BAND)
  expect((await probing.find({ type: 'Image' }))?.props).toMatchObject({ columns: 1, rows: 1 })
  await probing.unmount()
  await clock.advance(2000)

  await typeInto($, '', 'compare shots/a.png and b.jpg')
  // A pasted path becomes a tag through a change no edit carried.
  await prompt($).change({ text: '[Image #1] compare shots/a.png and b.jpg', cursor: 0, origin: { kind: 'clear' } })
  await clock.advance(0)

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  const links = await ui.findAll({ type: 'Link' })
  expect(links.map(link => link.props.href)).toEqual([
    'file:///tmp/claude-501/-work/sess-1/images/1.png',
    'file:///work/shots/a.png',
    'file:///work/b.jpg',
  ])
  expect(await ui.find({ type: 'Text', text: /800×400/ })).toBeDefined()
  await ui.unmount()

  // Sending the prompt clears the box, and the band with it.
  await prompt($).change({ text: '', cursor: 0, origin: { kind: 'clear' } })
  await clock.advance(0)
  const after = await $.ui.mount(BAND)
  expect(await after.find({ type: 'Link' })).toBeUndefined()
  expect(await after.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await after.unmount()
})

test('where the terminal draws pictures, PNGs are tiles, other formats stay links, and WSL links go through its share', async ($, on) => {
  const clock = mock.clock(on)
  engineBeneath(on, undefined, { WSL_DISTRO_NAME: 'Ubuntu' })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await (await $.ui.mount(BAND)).unmount()
  await clock.advance(2000)
  await typeInto($, '', '[Image #1] b.jpg [Image #2]')
  await clock.advance(0)

  const ui = await $.ui.mount(BAND)
  const images = await ui.findAll({ type: 'Image' })
  expect(images.map(image => image.props)).toEqual([
    expect.objectContaining({
      source: { file: '/tmp/claude-501/-work/sess-1/images/1.png', format: 'png', generation: 1000 },
      columns: 32,
      rows: 8,
    }),
  ])
  expect((await ui.findAll({ type: 'Link' })).map(link => link.props.href)).toEqual([
    'file://wsl.localhost/Ubuntu/tmp/claude-501/-work/sess-1/images/1.png',
    'file://wsl.localhost/Ubuntu/work/b.jpg',
  ])
  // #2 has no cached file yet.
  expect(await ui.find({ type: 'Text', text: /not found/ })).toBeDefined()
  await ui.unmount()
})

function readResult(id: string, png: string) {
  return {
    plugin: 'image-view',
    component: 'ToolResult',
    requestId: id,
    surface: 'terminal',
    viewport: { columns: 100, rows: 40 },
    props: {
      tool_use_id: id,
      tool: 'Read',
      isErrored: false,
      output: { type: 'image', file: { base64: png, type: 'image/png', originalSize: 64, dimensions: { originalWidth: 800, originalHeight: 400 } } },
    },
  } as const
}

test('an image a Read returned shows under its result: a link before the probe, a picture after it', async ($, on) => {
  const clock = mock.clock(on)
  const png = pngBase64(800, 400)
  engineBeneath(on, undefined)
  on('tool.call', () => ({ result: { type: 'image', file: { base64: png, type: 'image/png', originalSize: 64 } } }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.call({ tool: 'Read', file_path: '/work/shots/a.png', tool_use_id: 'toolu_1' })

  const before = await $.ui.mount(readResult('toolu_1', png))
  expect(await before.find({ type: 'Text', text: 'engine' })).toBeDefined()
  expect(await before.find({ type: 'Image' })).toBeUndefined()
  expect((await before.find({ type: 'Link' }))?.props.href).toBe('file:///work/shots/a.png')
  expect(await before.find({ type: 'Text', text: /shots\/a\.png/ })).toBeDefined()
  await before.unmount()

  await (await $.ui.mount(BAND)).unmount()
  await clock.advance(2000)

  const after = await $.ui.mount(readResult('toolu_1', png))
  expect((await after.find({ type: 'Image' }))?.props).toMatchObject({ source: { png }, columns: 48, rows: 12 })
  await after.unmount()
})

test('a folded run of reads shows its images below the line, and leaves the expanded view to the engine', async ($, on) => {
  const png = pngBase64(800, 400)
  engineBeneath(on, undefined)
  const call = (id: string, file: string, output: unknown) => ({
    tool_use_id: id,
    tool: 'Read',
    input: { file_path: file },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    output,
  })
  const group = (isExpanded: boolean) =>
    ({
      plugin: 'image-view',
      component: 'ToolGroup',
      requestId: 'group-1',
      surface: 'terminal',
      viewport: { columns: 100, rows: 40 },
      props: {
        isActive: false,
        isExpanded,
        calls: [
          call('toolu_1', '/work/notes.md', { type: 'text', file: { content: 'x' } }),
          call('toolu_2', '/work/shots/a.png', { type: 'image', file: { base64: png, type: 'image/png', originalSize: 64 } }),
        ],
      },
    }) as const

  const folded = await $.ui.mount(group(false))
  expect((await folded.findAll({ type: 'Link' })).map(link => link.props.href)).toEqual(['file:///work/shots/a.png'])
  await folded.unmount()

  const expanded = await $.ui.mount(group(true))
  expect(await expanded.find({ type: 'Link' })).toBeUndefined()
  await expanded.unmount()
})
