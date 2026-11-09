// The detection engine, tested as a matrix: each category's real shapes are
// rewritten, and the look-alikes that tripped the earlier rule table — DOIs,
// commit hashes, kernel versions, slices, timestamps, type annotations —
// are left alone.
import { expect, test } from 'claude-code/testing'
import { countPlaceholders, detectorsFor, washText } from './rules'
import type { Category, RowHits } from './rules'

const ALL = detectorsFor(new Set<Category>(['email', 'ipv4', 'ipv6', 'credential', 'address', 'phone']))

function wash(text: string): string {
  return washText(text, ALL, {})
}

function kept(text: string): void {
  expect(wash(text)).toBe(text)
}

// ---------------------------------------------------------------- phone

test('phone numbers with a structure are rewritten', () => {
  expect(wash('call +1 (415) 555-0132 now')).toBe('call [redact:phone] now')
  expect(wash('call +44 20 7946 0958 now')).toBe('call [redact:phone] now')
  expect(wash('call +8613812345678 now')).toBe('call [redact:phone] now')
  expect(wash('手机 13812345678。')).toBe('手机 [redact:phone]。')
  expect(wash('mobile 138-1234-5678')).toBe('mobile [redact:phone]')
  expect(wash('office (415) 555-0132')).toBe('office [redact:phone]')
  expect(wash('office 415-555-0132')).toBe('office [redact:phone]')
  expect(wash('座机 010-62345678')).toBe('座机 [redact:phone]')
  expect(wash('Tel: 020 7946 0958')).toBe('Tel: [redact:phone]')
  expect(wash('电话：8765 4321')).toBe('电话：[redact:phone]')
})

test('a DOI is never read as a phone number', () => {
  kept('doi:10.1371/journal.pone.0123456')
  kept('https://doi.org/10.1016/j.cell.2020.1234567')
  kept('See 10.1103/PhysRevLett.123.4567890 for details')
  kept('10.1186/s13059-019-1832567-y')
  kept('arXiv:2401.12345v2 and 2312.09876v1')
})

test('bare digit runs are not phone numbers', () => {
  kept('commit 1234567 Merge pull request #14')
  kept('id 98765432101234')
  kept('epoch 1731139200 and 1731139200123')
  kept('order 20241109001')
  kept('PMID: 31234567')
  kept('ISBN 978-0-306-40615-7')
  kept('#13812345678')
  kept('/api/users/13812345678/profile')
  kept('v1.13812345678')
})

test('dates, times and versions are not phone numbers', () => {
  kept('2024-01-15T10:30:00+08:00')
  kept('released 2024-11-09 at 12:30')
  kept('range 100-200-3000')
  kept('size 1024x768')
})

test('an unseparated plus run at a line start reads as a diff line', () => {
  kept('+12345678901\n-12345678900')
})

// --------------------------------------------------------------- ipv4

test('ipv4 addresses are rewritten', () => {
  expect(wash('host 10.0.12.7 up')).toBe('host [redact:ipv4] up')
  expect(wash('ssh deploy@172.16.4.20')).toBe('ssh deploy@[redact:ipv4]')
  expect(wash('http://192.168.1.10:8080/x')).toBe('http://[redact:ipv4]:8080/x')
  expect(wash('peer 8.8.4.4.')).toBe('peer [redact:ipv4].')
  expect(wash('subnet 10.1.0.0/16')).toBe('subnet [redact:ipv4]/16')
})

test('version numbers and special addresses are not ipv4', () => {
  kept('Linux 5.15.167.4-microsoft-standard-WSL2')
  kept('OID 1.3.6.1.4.1.311')
  kept('chrome v120.0.6099.109')
  kept('version 1.2.3.4')
  kept('listen 127.0.0.1 and 0.0.0.0')
  kept('mask 255.255.255.0')
  kept('docs use 192.0.2.10 and 203.0.113.5')
  kept('not 999.1.1.1 or 01.2.3.4')
})

// --------------------------------------------------------------- ipv6

test('ipv6 addresses are rewritten', () => {
  expect(wash('addr 2001:db8:85a3::8a2e:370:7334 ok')).toBe('addr [redact:ipv6] ok')
  expect(wash('addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334 ok')).toBe('addr [redact:ipv6] ok')
  expect(wash('link fe80::1 ok')).toBe('link [redact:ipv6] ok')
})

test('code, clocks and MACs are not ipv6', () => {
  kept('at 12:34:56 and 12:34:56.789')
  kept('xs[1::2] and xs[::3]')
  kept('std::vector<int> and Face::Add and beef::cafe')
  kept('mac aa:bb:cc:dd:ee:ff')
  kept('loopback ::1')
})

// -------------------------------------------------------------- email

test('emails are rewritten', () => {
  expect(wash('mail alice.liu+dev@acme.io now')).toBe('mail [redact:email] now')
  expect(wash('<bob@mail.corp.cn>')).toBe('<[redact:email]>')
})

test('file names, examples, remotes and noreply are not emails', () => {
  kept('icon@2x.png and logo@3x.webp')
  kept('user@example.com and admin@example.org')
  kept('git@github.com:owner/repo.git')
  kept('12345+octo@users.noreply.github.com')
  kept('noreply@acme.io')
  kept('npm i lodash@4.17.21 @scope/pkg@latest')
})

// ---------------------------------------------------------- credential

test('known key shapes are rewritten', () => {
  expect(wash('AKIAIOSFODNN7EXAMPLE')).toBe('[redact:credential]')
  expect(wash(`token ghp_${'a1B2c3D4e5'.repeat(4)}`)).toBe('token [redact:credential]')
  expect(wash('sk-ant-api03-Zx9Qw81Lm2Nb7Vc4Xr6Ty0Ui')).toBe('[redact:credential]')
  expect(wash('key sk-proj-4f9KxQ2mW8pL1nB7vC3zR6tY')).toBe('key [redact:credential]')
  expect(wash(`AIza${'Sy1x2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P7'}`)).toBe('[redact:credential]')
})

test('a JWT, a bearer token and a URL password are rewritten', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  expect(wash(`auth ${jwt} end`)).toBe('auth [redact:credential] end')
  expect(wash('Authorization: Bearer abcDEF123456ghiJKL789')).toBe('Authorization: Bearer [redact:credential]')
  expect(wash('postgres://app:s3cr3tP4ss@db.internal:5432/app')).toBe('postgres://app:[redact:credential]@db.internal:5432/app')
})

test('a private key block is rewritten whole', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nAAAA\n-----END RSA PRIVATE KEY-----'
  expect(wash(`x\n${pem}\ny`)).toBe('x\n[redact:credential]\ny')
})

test('labelled secrets are rewritten, the label kept', () => {
  expect(wash('DB_PASSWORD=hunter2!x')).toBe('DB_PASSWORD=[redact:credential]')
  expect(wash('"password": "Tr0ub4dor&3"')).toBe('"password": "[redact:credential]"')
  expect(wash('API_KEY=9f8e7d6c5b4a39281706f5e4')).toBe('API_KEY=[redact:credential]')
  expect(wash('client_secret: Qm9vYmF6MTIzNDU2Nzg5MA')).toBe('client_secret: [redact:credential]')
})

test('references, placeholders and code are not secrets', () => {
  kept('API_KEY=${API_KEY}')
  kept('password: process.env.DB_PASSWORD')
  kept('token: ${{ secrets.GITHUB_TOKEN }}')
  kept('password = getpass()')
  kept('password: Optional[str]')
  kept('password: string;')
  kept('password: PasswordField')
  kept('api_key = "your-api-key-here"')
  kept('SECRET_KEY=changeme')
  kept('max_tokens: 4096')
  kept('sort_key: createdAtTimestamp')
  kept('pip install sk-learn-tutorial-examples')
  kept('TOKEN_URL=https://auth.acme.io/token')
})

// ------------------------------------------------------------- address

test('street and Chinese addresses are rewritten', () => {
  expect(wash('ship to 221 Baker Street, London')).toBe('ship to [redact:address], London')
  expect(wash('at 1600 Amphitheatre Pkwy Apt 4 today')).toBe('at [redact:address] today')
  expect(wash('住在北京市朝阳区建国路88号3栋1201室。')).toContain('[redact:address]')
  expect(wash('住在北京市朝阳区建国路88号3栋1201室。')).not.toContain('88号')
})

test('ordinal Chinese numbers and lowercase prose are not addresses', () => {
  kept('地铁1号线，第3区，10号')
  kept('copy 5 files to Google Drive')
  kept('step 2 of the way')
})

// --------------------------------------------------------------- engine

test('washing twice changes nothing more', () => {
  const once = wash('mail alice@acme.io from 10.0.12.7, +1 (415) 555-0132')
  expect(wash(once)).toBe(once)
})

test('hits are counted per category', () => {
  const hits: RowHits = {}
  washText('a@acme.io b@acme.io 10.0.12.7 AKIAIOSFODNN7EXAMPLE', ALL, hits)
  expect(hits).toEqual({ email: 2, ipv4: 1, credential: 1 })
})

test('a credential beside a DOI still goes; the DOI stays', () => {
  expect(wash('10.1371/journal.pone.0123456 AKIAIOSFODNN7EXAMPLE')).toBe(
    '10.1371/journal.pone.0123456 [redact:credential]',
  )
})

test('a category left out is never rewritten', () => {
  const emailOnly = detectorsFor(new Set<Category>(['email']))
  expect(washText('a@acme.io 10.0.12.7', emailOnly, {})).toBe('[redact:email] 10.0.12.7')
})

test('placeholders are counted', () => {
  expect(countPlaceholders('[redact:email] and [redact:phone] but [redact:nope]')).toBe(2)
})
