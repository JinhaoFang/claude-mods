// The detection engine: pure functions over a string, no engine calls.
//
// One pass, not a chain of replaces. Every detector runs over the original
// text and proposes spans; protected spans (DOIs, arXiv ids, ISBNs, UUIDs,
// timestamps) veto the personal-data categories that overlap them; the
// survivors are taken left to right, earlier detectors first where two start
// together, and the text is rebuilt once. Credentials ignore the veto: a key
// never looks like a DOI, and a secret pasted next to one must still go.
//
// Precision over recall. Each detector fires only on a shape it can stand
// behind — a phone number needs a country code, a mobile prefix, separators
// or a label, never a bare digit run; an IPv4 address followed by `-word` or
// a fifth dotted part is a version; an IPv6 candidate is parsed, not
// pattern-matched. A miss leaks one value; a false hit silently corrupts what
// the model reads and then writes back.
import type { RedactCategory } from '../types'

export type Category = RedactCategory

export interface Span {
  start: number
  end: number
}

interface Detector {
  category: Category
  find: (text: string) => Span[]
}

export type RowHits = Partial<Record<Category, number>>

export const PLACEHOLDER = /\[redact:(?:email|ipv4|ipv6|credential|address|phone)\]/g

export function placeholder(category: Category): string {
  return `[redact:${category}]`
}

// A regex whose match (or, when the regex has one, its first capture group)
// is the span to rewrite, kept only where `accept` agrees.
function spans(
  regex: RegExp,
  accept: (value: string, text: string, start: number) => boolean = () => true,
): (text: string) => Span[] {
  return text => {
    const out: Span[] = []
    for (const m of text.matchAll(regex)) {
      const whole = m.index ?? 0
      const group = m[1]
      const value = group ?? m[0]
      const start = group === undefined ? whole : whole + m[0].indexOf(group, 0)
      if (value.length > 0 && accept(value, text, start)) {
        out.push({ start, end: start + value.length })
      }
    }
    return out
  }
}

const digitsIn = (s: string) => s.replace(/\D/g, '').length

// ---------------------------------------------------------------- credentials

// A token the prefix alone does not vouch for must look random: letters and
// at least two digits. Keeps `sk-learn-tutorial-examples` out.
function looksRandom(value: string): boolean {
  return /[A-Za-z]/.test(value) && digitsIn(value) >= 2
}

const PLACEHOLDER_VALUE =
  /^(?:x{3,}|\*{3,}|\.{3,}|your[\w-]*|my[\w-]*|changeme|change[_-]?me|placeholder|example[\w-]*|sample[\w-]*|dummy[\w-]*|test[\w-]*|fake[\w-]*|redacted|secret|password|token|none|null|nil|undefined|true|false|string|required|optional|todo|tbd|n\/a)$/i

// A value on the right of `password =` that is really code or a reference:
// `$VAR`, `${{ secrets.X }}`, `<your-key>`, `process.env.X`, a call.
function isReference(value: string): boolean {
  return (
    /^[$%<{[(!&*@]/.test(value) ||
    /[()[\]<>]/.test(value) ||
    value.startsWith('[redact:') ||
    /^(?:process\.env|os\.environ|os\.getenv|env|ENV|import\.meta\.env|config|settings|self|this)\b/.test(value) ||
    /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+$/.test(value)
  )
}

function plausibleSecret(name: string, value: string): boolean {
  if (isReference(value) || PLACEHOLDER_VALUE.test(value)) return false
  if (/^(.)\1+$/.test(value)) return false
  // A password-ish name vouches for any concrete value; key/token names ask
  // the value to look random, since `sort_key: createdAt` is not a secret.
  // A bare word (`PasswordField`, `hunter`) is more often a type or a name.
  if (/pass(?:word|wd)?|pwd|secret|credential/i.test(name)) {
    return value.length >= 6 && !/^[A-Za-z_]+$/.test(value)
  }
  return value.length >= 16 && looksRandom(value)
}

const LABELLED_SECRET =
  /(?<![A-Za-z0-9])([A-Za-z0-9_.-]*?(?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer[_-]?token|token|secret|password|passwd|pwd|credentials?))["']?[ \t]*(?:=|:(?!:))[ \t]*["'`]?([^\s"'`,;]+)/gi

function findLabelledSecrets(text: string): Span[] {
  const out: Span[] = []
  for (const m of text.matchAll(LABELLED_SECRET)) {
    const name = m[1] ?? ''
    const value = m[2] ?? ''
    if (!plausibleSecret(name, value)) continue
    const start = (m.index ?? 0) + m[0].length - value.length
    out.push({ start, end: start + value.length })
  }
  return out
}

const CREDENTIAL_DETECTORS: readonly Detector[] = [
  {
    category: 'credential',
    find: spans(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
    ),
  },
  {
    // Header and payload are both base64 JSON, so both open `eyJ`.
    category: 'credential',
    find: spans(/(?<![\w-])eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g),
  },
  {
    category: 'credential',
    find: spans(
      /(?<![\w-])(?:(?:AKIA|ASIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|glpat-[\w-]{20,}|xox[abposr]-[\w-]{10,}|AIza[\w-]{35}|(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}|hf_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{36}|SG\.[\w-]{16,}\.[\w-]{16,})(?![\w-])/g,
    ),
  },
  {
    // Anthropic and OpenAI style keys: the `sk-` prefix is common in prose,
    // so the body must look random as well.
    category: 'credential',
    find: spans(/(?<![\w-])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}(?![\w-])/g, looksRandom),
  },
  {
    category: 'credential',
    find: spans(/https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/g),
  },
  {
    // `Authorization: Bearer <token>` — the token alone.
    category: 'credential',
    find: spans(/\bBearer[ \t]+([A-Za-z0-9._~+/-]{16,}=*)/g, looksRandom),
  },
  {
    // `scheme://user:password@host` — the password alone.
    category: 'credential',
    find: spans(/\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s:/@]+)@[\w.-]/g, value => !isReference(value)),
  },
  { category: 'credential', find: findLabelledSecrets },
]

// ---------------------------------------------------------- protected spans

const PROTECTED: readonly RegExp[] = [
  // DOI: 10.<registrant>/<suffix>, bare or inside a doi.org URL.
  /\b10\.\d{4,9}\/[^\s"'<>\])}]+/g,
  /\barXiv:\s?\d{4}\.\d{4,5}(?:v\d+)?/gi,
  /\b(?:\d{4}\.\d{4,5}v\d+)\b/g,
  /\bISBN(?:-1[03])?:?\s?[\d -]{9,16}[\dX]\b/gi,
  /\bPMID:?\s?\d{1,9}\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  // ISO dates and timestamps, with an optional zone offset.
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
]

function findProtected(text: string): Span[] {
  const out: Span[] = []
  for (const regex of PROTECTED) out.push(...spans(regex)(text))
  return out
}

// ------------------------------------------------------------------- email

const FILE_EXTENSIONS = new Set(
  'png jpg jpeg gif svg webp ico bmp avif js mjs cjs ts mts cts tsx jsx json css scss less md mdx txt html htm xml yml yaml toml ini lock py rb go rs java kt swift c h cc cpp hpp cs php sh bash zsh ps1 zip tar gz tgz pdf csv vue svelte wasm map'.split(' '),
)

const EXAMPLE_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost|local)$/i

function plausibleEmail(value: string): boolean {
  const at = value.lastIndexOf('@')
  const local = value.slice(0, at).toLowerCase()
  const domain = value.slice(at + 1).toLowerCase()
  const tld = domain.slice(domain.lastIndexOf('.') + 1)
  if (FILE_EXTENSIONS.has(tld)) return false // icon@2x.png
  if (EXAMPLE_DOMAIN.test(domain)) return false // user@example.com is documentation
  if (local === 'git') return false // git@github.com:owner/repo is an SSH remote
  if (domain.endsWith('users.noreply.github.com')) return false
  if (/^(?:no-?reply|do-?not-?reply)$/.test(local)) return false
  return true
}

const EMAIL_DETECTORS: readonly Detector[] = [
  {
    category: 'email',
    find: spans(
      /(?<![\w.%+-])[A-Za-z0-9][A-Za-z0-9._%+-]*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}(?![\w-])/g,
      plausibleEmail,
    ),
  },
]

// --------------------------------------------------------------------- ipv6

function plausibleIpv6(value: string): boolean {
  const halves = value.split('::')
  if (halves.length > 2) return false
  const groups = halves.flatMap(half => (half === '' ? [] : half.split(':')))
  if (!groups.every(g => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false
  if (halves.length === 1 ? groups.length !== 8 : groups.length > 7) return false
  // Real addresses are written in one case and carry digits; `Face::Add`
  // and `beef::cafe` are code. `1::2` is a slice; `::1` is loopback.
  if (/[a-f]/.test(value) && /[A-F]/.test(value)) return false
  if (!/\d/.test(value)) return false
  if (groups.length < 3 && !groups.some(g => g.length >= 3)) return false
  if (groups.length === 0) return false
  return true
}

const IPV6_DETECTORS: readonly Detector[] = [
  {
    category: 'ipv6',
    find: spans(/(?<![\w:.])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:]|\.\d)/g, plausibleIpv6),
  },
]

// --------------------------------------------------------------------- ipv4

const VERSION_LEAD = /(?:\bv|\bver(?:sion)?\.?\s*[:=]?\s*)$/i

function plausibleIpv4(value: string, text: string, start: number): boolean {
  const octets = value.split('.')
  if (!octets.every(o => /^(?:0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255)) return false
  const [a, b, c] = octets.map(Number)
  if (a === 0 || a === 127) return false // unspecified, loopback
  if (value === '255.255.255.255') return false
  if (a === 255) return false // a netmask, not a host
  // Documentation ranges (RFC 5737).
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) {
    return false
  }
  if (VERSION_LEAD.test(text.slice(Math.max(0, start - 12), start))) return false
  return true
}

const IPV4_DETECTORS: readonly Detector[] = [
  {
    // Not part of a longer dotted run, not followed by `-word` (a kernel or
    // package version such as `5.15.167.4-microsoft`).
    category: 'ipv4',
    find: spans(/(?<![\w.-])\d{1,3}(?:\.\d{1,3}){3}(?![\w-]|\.\d)/g, plausibleIpv4),
  },
]

// ------------------------------------------------------------------ address

const ADDRESS_DETECTORS: readonly Detector[] = [
  {
    // `221 Baker Street`, `1600 Amphitheatre Pkwy Apt 4` — the street words
    // capitalised, so `5 files to Google Drive` stays prose.
    category: 'address',
    find: spans(
      /\b\d{1,5}(?:[ \t]+[A-Z][a-z]+){1,3}[ \t]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Parkway|Pkwy|Highway|Hwy)\b\.?(?:,?\s+(?:Apt|Unit|Suite|Ste)\.?\s*[A-Za-z0-9-]+)?/g,
    ),
  },
  {
    // A Chinese address needs a road and a door number: `建国路88号`, with
    // an optional building and room after it. `1号线` or `3号` alone is not one.
    category: 'address',
    find: spans(
      /[\u4e00-\u9fa5A-Za-z\d]{1,12}(?:路|街|大道|大街|巷|弄|胡同)\d{1,5}(?:-\d{1,5})?号(?:院|楼)?(?:[\dA-Za-z一二三四五六七八九十]{1,4}(?:栋|幢|座|单元|层|楼|室))*/g,
    ),
  },
]

// -------------------------------------------------------------------- phone

// Digits around a phone candidate must not continue an identifier, a path, a
// URL segment, a dotted number or a hash; the lookarounds below say so.
const PHONE_DETECTORS: readonly Detector[] = [
  {
    // International: +<country code> then grouped digits, 8 to 15 in all.
    // At the start of a line an unseparated run is likely a diff's added line.
    category: 'phone',
    find: spans(
      /(?<![\w+/.-])\+\d{1,3}(?:[ .-]?\(?\d{1,4}\)?){2,5}(?![\w/-]|\.\d)/g,
      (value, text, start) => {
        const n = digitsIn(value)
        if (n < 8 || n > 15) return false
        const atLineStart = start === 0 || text[start - 1] === '\n'
        return !(atLineStart && /^\+\d+$/.test(value))
      },
    ),
  },
  {
    // Chinese mobile: 1[3-9]x xxxx xxxx, optionally +86 / 86 in front.
    category: 'phone',
    find: spans(/(?<![\w+/.#-])(?:\+?86[ -]?)?1[3-9]\d(?:[ -]?\d{4}){2}(?![\w/-]|\.\d)/g),
  },
  {
    // North American with separators: (212) 555-1234, 212-555-1234, 212.555.1234.
    category: 'phone',
    find: spans(/(?<![\w+/.-])(?:\([2-9]\d{2}\)[ ]?[2-9]\d{2}-\d{4}|[2-9]\d{2}-[2-9]\d{2}-\d{4}|[2-9]\d{2}\.[2-9]\d{2}\.\d{4})(?![\w/-]|\.\d)/g),
  },
  {
    // Chinese landline: 010-12345678, 0755-1234567.
    category: 'phone',
    find: spans(/(?<![\w+/.-])0\d{2,3}-[1-9]\d{6,7}(?![\w/-]|\.\d)/g),
  },
  {
    // A labelled number of any common shape: `Tel: 020 7946 0958`, `电话：12345678`.
    category: 'phone',
    find: spans(
      /(?:电话|手机|手机号|联系电话|座机|传真|\b(?:Tel|Phone|Mobile|Cell|Fax)\b)\.?[ \t]*(?:[:：]|number|no\.?|#)?[ \t]*(\+?\(?\d[\d ()-]{5,18}\d)(?![\w/-]|\.\d)/gi,
      value => {
        const n = digitsIn(value)
        return n >= 7 && n <= 15
      },
    ),
  },
]

// ------------------------------------------------------------------- engine

// Order matters only where two spans start at the same place: earlier wins.
const ALL_DETECTORS: readonly Detector[] = [
  ...CREDENTIAL_DETECTORS,
  ...EMAIL_DETECTORS,
  ...IPV6_DETECTORS,
  ...IPV4_DETECTORS,
  ...ADDRESS_DETECTORS,
  ...PHONE_DETECTORS,
]

export type Detectors = readonly Detector[]

export function detectorsFor(categories: ReadonlySet<Category>): Detectors {
  return ALL_DETECTORS.filter(d => categories.has(d.category))
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end

export function washText(text: string, detectors: Detectors, hits: RowHits): string {
  if (detectors.length === 0 || text.length === 0) return text
  const guarded = [...findProtected(text), ...[...text.matchAll(PLACEHOLDER)].map(m => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }))]

  const found: (Span & { category: Category; rank: number })[] = []
  detectors.forEach((detector, rank) => {
    for (const span of detector.find(text)) {
      if (detector.category !== 'credential' && guarded.some(g => overlaps(g, span))) continue
      found.push({ ...span, category: detector.category, rank })
    }
  })
  if (found.length === 0) return text

  found.sort((a, b) => a.start - b.start || a.rank - b.rank || b.end - a.end)
  let out = ''
  let at = 0
  for (const span of found) {
    if (span.start < at) continue
    out += text.slice(at, span.start) + placeholder(span.category)
    at = span.end
    hits[span.category] = (hits[span.category] ?? 0) + 1
  }
  return out + text.slice(at)
}

export function countPlaceholders(text: string): number {
  return [...text.matchAll(PLACEHOLDER)].length
}
