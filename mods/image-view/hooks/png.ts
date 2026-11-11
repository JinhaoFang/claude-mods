// A PNG decoder small enough to live in the mod: a hooks module has no zlib, so it carries its
// own inflate, and it averages the picture down to a thumbnail as it unfilters each row.

/** A small picture: one `0x00RRGGBB` color per pixel, `TRANSPARENT` where it shows through. */
export type Thumb = { width: number; height: number; colors: Uint32Array }

export const TRANSPARENT = 0x01000000

const THUMB_WIDTH = 128
const THUMB_HEIGHT = 96
const MAX_PIXELS = 50_000_000

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const LENGTHS_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

type Huffman = { counts: Uint16Array; symbols: Uint16Array }

function huffman(lengths: ArrayLike<number>): Huffman {
  const counts = new Uint16Array(16)
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]!]!++
  counts[0] = 0
  const offsets = new Uint16Array(16)
  for (let len = 1; len < 15; len++) offsets[len + 1] = offsets[len]! + counts[len]!
  const symbols = new Uint16Array(lengths.length)
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const len = lengths[symbol]!
    if (len !== 0) symbols[offsets[len]!++] = symbol
  }
  return { counts, symbols }
}

const FIXED_LITERALS = huffman(Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)))
const FIXED_DISTANCES = huffman(new Array<number>(30).fill(5))

class Corrupt extends Error {}

/** Inflates a zlib stream into exactly `size` bytes, or null when it is not one. */
export function inflate(input: Uint8Array, size: number): Uint8Array | null {
  const out = new Uint8Array(size)
  let at = 2
  let bitBuffer = 0
  let bitCount = 0
  let written = 0

  const bits = (n: number) => {
    while (bitCount < n) {
      if (at >= input.length) throw new Corrupt()
      bitBuffer |= input[at++]! << bitCount
      bitCount += 8
    }
    const value = bitBuffer & ((1 << n) - 1)
    bitBuffer >>>= n
    bitCount -= n
    return value
  }
  const decode = ({ counts, symbols }: Huffman) => {
    let code = 0
    let first = 0
    let index = 0
    for (let len = 1; len < 16; len++) {
      code |= bits(1)
      const count = counts[len]!
      if (code - first < count) return symbols[index + code - first]!
      index += count
      first = (first + count) << 1
      code <<= 1
    }
    throw new Corrupt()
  }
  const push = (byte: number) => {
    if (written >= size) throw new Corrupt()
    out[written++] = byte
  }

  try {
    if (input.length < 2 || (input[0]! & 0x0f) !== 8) return null
    let isLast = 0
    do {
      isLast = bits(1)
      const type = bits(2)
      if (type === 0) {
        bitBuffer = 0
        bitCount = 0
        if (at + 4 > input.length) return null
        const len = input[at]! | (input[at + 1]! << 8)
        at += 4
        if (at + len > input.length) return null
        for (let i = 0; i < len; i++) push(input[at++]!)
        continue
      }
      let literals = FIXED_LITERALS
      let distances = FIXED_DISTANCES
      if (type === 2) {
        const literalCount = bits(5) + 257
        const distanceCount = bits(5) + 1
        const codeCount = bits(4) + 4
        const codeLengths = new Uint8Array(19)
        for (let i = 0; i < codeCount; i++) codeLengths[LENGTHS_ORDER[i]!] = bits(3)
        const lengthCode = huffman(codeLengths)
        const lengths = new Uint8Array(literalCount + distanceCount)
        for (let i = 0; i < lengths.length; ) {
          const symbol = decode(lengthCode)
          if (symbol < 16) {
            lengths[i++] = symbol
            continue
          }
          const [repeat, value] =
            symbol === 16 ? [3 + bits(2), i > 0 ? lengths[i - 1]! : -1] : symbol === 17 ? [3 + bits(3), 0] : [11 + bits(7), 0]
          if (value < 0 || i + repeat > lengths.length) return null
          lengths.fill(value, i, i + repeat)
          i += repeat
        }
        literals = huffman(lengths.subarray(0, literalCount))
        distances = huffman(lengths.subarray(literalCount))
      } else if (type !== 1) {
        return null
      }
      for (;;) {
        const symbol = decode(literals)
        if (symbol < 256) push(symbol)
        else if (symbol === 256) break
        else {
          const lengthIndex = symbol - 257
          if (lengthIndex >= LENGTH_BASE.length) return null
          const length = LENGTH_BASE[lengthIndex]! + bits(LENGTH_EXTRA[lengthIndex]!)
          const distanceIndex = decode(distances)
          if (distanceIndex >= DISTANCE_BASE.length) return null
          const distance = DISTANCE_BASE[distanceIndex]! + bits(DISTANCE_EXTRA[distanceIndex]!)
          if (distance > written) return null
          for (let i = 0; i < length; i++) push(out[written - distance]!)
        }
      }
    } while (!isLast)
  } catch (error) {
    if (error instanceof Corrupt) return null
    throw error
  }
  return written === size ? out : null
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/**
 * A PNG's picture box-averaged down to at most 128 × 96, its shape kept; null for what this
 * decoder does not read (not a PNG, interlaced, corrupt, too large).
 */
export function decodeThumb(png: Uint8Array): Thumb | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  if (png.length < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return null
  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  let palette: Uint8Array | undefined
  let paletteAlpha: Uint8Array | undefined
  const data: Uint8Array[] = []
  for (let at = 8; at + 8 <= png.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(png[at + 4]!, png[at + 5]!, png[at + 6]!, png[at + 7]!)
    const body = png.subarray(at + 8, at + 8 + length)
    if (body.length < length) return null
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      depth = png[at + 16]!
      colorType = png[at + 17]!
      if (png[at + 20] !== 0) return null
    } else if (type === 'PLTE') palette = body
    else if (type === 'tRNS') paletteAlpha = body
    else if (type === 'IDAT') data.push(body)
    else if (type === 'IEND') break
    at += 12 + length
  }
  const channels = CHANNELS[colorType]
  if (channels === undefined || width === 0 || height === 0 || width * height > MAX_PIXELS) return null
  if (colorType === 3 && palette === undefined) return null

  const joined = new Uint8Array(data.reduce((sum, chunk) => sum + chunk.length, 0))
  data.reduce((offset, chunk) => (joined.set(chunk, offset), offset + chunk.length), 0)
  const bitsPerPixel = channels * depth
  const stride = Math.ceil((width * bitsPerPixel) / 8)
  const raw = inflate(joined, (stride + 1) * height)
  if (raw === null) return null

  const scale = Math.min(1, THUMB_WIDTH / width, THUMB_HEIGHT / height)
  const thumbWidth = Math.max(1, Math.round(width * scale))
  const thumbHeight = Math.max(1, Math.round(height * scale))
  // Per thumb pixel: alpha-weighted red, green, blue, then alpha and the pixel count.
  const sums = new Float64Array(thumbWidth * thumbHeight * 5)
  const step = Math.max(1, bitsPerPixel >> 3)
  const maxSample = (1 << Math.min(depth, 8)) - 1
  let previous = new Uint8Array(stride)
  let row = new Uint8Array(stride)

  const sample = (x: number, channel: number) => {
    if (depth === 8) return row[x * channels + channel]!
    if (depth === 16) return row[(x * channels + channel) * 2]!
    const bit = (x * channels + channel) * depth
    return ((row[bit >> 3]! >> (8 - depth - (bit & 7))) & maxSample) * (colorType === 3 ? 1 : 255 / maxSample)
  }

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    row.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let i = 0; i < stride; i++) {
      const left = i >= step ? row[i - step]! : 0
      const up = previous[i]!
      const corner = i >= step ? previous[i - step]! : 0
      if (filter === 1) row[i] = row[i]! + left
      else if (filter === 2) row[i] = row[i]! + up
      else if (filter === 3) row[i] = row[i]! + ((left + up) >> 1)
      else if (filter === 4) {
        const p = left + up - corner
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)]
        row[i] = row[i]! + (pa <= pb && pa <= pc ? left : pb <= pc ? up : corner)
      } else if (filter !== 0) return null
    }
    const ty = Math.min(thumbHeight - 1, Math.floor((y * thumbHeight) / height))
    for (let x = 0; x < width; x++) {
      let r: number
      let g: number
      let b: number
      let a = 255
      if (colorType === 3) {
        const index = sample(x, 0)
        r = palette![index * 3] ?? 0
        g = palette![index * 3 + 1] ?? 0
        b = palette![index * 3 + 2] ?? 0
        a = paletteAlpha?.[index] ?? 255
      } else if (channels <= 2) {
        r = g = b = sample(x, 0)
        if (channels === 2) a = sample(x, 1)
      } else {
        r = sample(x, 0)
        g = sample(x, 1)
        b = sample(x, 2)
        if (channels === 4) a = sample(x, 3)
      }
      const tx = Math.min(thumbWidth - 1, Math.floor((x * thumbWidth) / width))
      const cell = (ty * thumbWidth + tx) * 5
      sums[cell] = sums[cell]! + r * a
      sums[cell + 1] = sums[cell + 1]! + g * a
      sums[cell + 2] = sums[cell + 2]! + b * a
      sums[cell + 3] = sums[cell + 3]! + a
      sums[cell + 4] = sums[cell + 4]! + 1
    }
    ;[previous, row] = [row, previous]
  }

  const colors = new Uint32Array(thumbWidth * thumbHeight)
  for (let i = 0; i < colors.length; i++) {
    const [r, g, b, a, count] = [sums[i * 5]!, sums[i * 5 + 1]!, sums[i * 5 + 2]!, sums[i * 5 + 3]!, sums[i * 5 + 4]!]
    colors[i] = count === 0 || a / count < 128 ? TRANSPARENT : (Math.round(r / a) << 16) | (Math.round(g / a) << 8) | Math.round(b / a)
  }
  return { width: thumbWidth, height: thumbHeight, colors }
}

export function base64ToBytes(base64: string): Uint8Array {
  const text = atob(base64)
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

function average(thumb: Thumb, x0: number, x1: number, y0: number, y1: number): number {
  let r = 0
  let g = 0
  let b = 0
  let opaque = 0
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const color = thumb.colors[y * thumb.width + x]!
      count++
      if (color === TRANSPARENT) continue
      opaque++
      r += color >> 16
      g += (color >> 8) & 0xff
      b += color & 0xff
    }
  }
  if (opaque * 2 < count || opaque === 0) return TRANSPARENT
  return (Math.round(r / opaque) << 16) | (Math.round(g / opaque) << 8) | Math.round(b / opaque)
}

/** A Raster's cells drawing `thumb` in `columns` × `rows`: two pixels a cell, `▀` over its background. */
export function blockCells(thumb: Thumb, columns: number, rows: number): string {
  const pixel = (px: number, py: number) => {
    const x0 = Math.floor((px * thumb.width) / columns)
    const y0 = Math.floor((py * thumb.height) / (rows * 2))
    const x1 = Math.max(x0 + 1, Math.floor(((px + 1) * thumb.width) / columns))
    const y1 = Math.max(y0 + 1, Math.floor(((py + 1) * thumb.height) / (rows * 2)))
    return average(thumb, x0, Math.min(x1, thumb.width), y0, Math.min(y1, thumb.height))
  }
  const words = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const top = pixel(column, row * 2)
      const bottom = pixel(column, row * 2 + 1)
      const cell = (row * columns + column) * 3
      if (top === TRANSPARENT && bottom === TRANSPARENT) words.set([SPACE, TRANSPARENT, TRANSPARENT], cell)
      else if (top === TRANSPARENT) words.set([LOWER_HALF, bottom, TRANSPARENT], cell)
      else words.set([UPPER_HALF, top, bottom], cell)
    }
  }
  const bytes = new Uint8Array(words.buffer)
  // Raster cells are little-endian words; swap them where this machine is not.
  if (new Uint8Array(Uint32Array.of(1).buffer)[0] !== 1) {
    for (let i = 0; i < bytes.length; i += 4) bytes.subarray(i, i + 4).reverse()
  }
  return bytesToBase64(bytes)
}
