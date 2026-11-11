export type Size = { width: number; height: number }

/** The two `Image` sources the mod draws: PNG bytes, or a PNG file the terminal reads. */
export type Picture = { png: string } | { file: string; format: 'png'; generation?: number }

/** Whether this terminal draws pictures, as the session's probe found; `unknown` until it answers. */
export type Pictures = 'unknown' | 'on' | 'off'

/** One image as the mod shows it: a caption that opens the file, over its picture where one can be drawn. */
export type Preview = {
  label: string
  /** A `file:` URL of the image, absent when no file holds it. */
  href?: string
  /** The pixel size, or why there is nothing to show. */
  detail?: string
  size?: Size
  picture?: Picture
}

declare module 'claude-code' {
  interface PluginState {
    'image-view': {
      pictures: Pictures
      draft: Preview[]
      readPaths: Record<string, string>
    }
  }
}
