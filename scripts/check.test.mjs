// Fixture tests for the mod/manifest agreement check exported by check.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findAgreementProblems, findCatalogProblems, findLanguageProblems } from './check.mjs'

const mod = (name) => ({ name, pluginName: name })
const entry = (name) => ({ name, source: `./mods/${name}` })
const catalog = (...names) =>
  names.map((name) => `| [${name}](mods/${name}/README.md) | x |`).join('\n')

test('a compliant layout has no agreement problems', () => {
  const problems = findAgreementProblems(
    [mod('context-band'), mod('other-mod')],
    [entry('context-band'), entry('other-mod')],
  )

  assert.deepEqual(problems, [])
})

test('an entry whose name disagrees with its folder fails', () => {
  const problems = findAgreementProblems(
    [mod('context-band')],
    [{ name: 'not-context-band', source: './mods/context-band' }],
  )

  assert.notEqual(problems.length, 0)
})

test('an entry whose name disagrees with the plugin manifest fails', () => {
  const problems = findAgreementProblems(
    [{ name: 'context-band', pluginName: 'renamed-elsewhere' }],
    [entry('context-band')],
  )

  assert.notEqual(problems.length, 0)
})

test('a mod folder with no manifest entry fails', () => {
  const problems = findAgreementProblems([mod('context-band')], [])

  assert.notEqual(problems.length, 0)
})

test('a manifest entry with no mod folder fails', () => {
  const problems = findAgreementProblems([], [entry('ghost-mod')])

  assert.notEqual(problems.length, 0)
})

test('a catalog that agrees with the manifest has no problems', () => {
  const problems = findCatalogProblems(catalog('context-band', 'other-mod'), [
    'context-band',
    'other-mod',
  ])

  assert.deepEqual(problems, [])
})

test('a catalog entry with no manifest entry fails', () => {
  const problems = findCatalogProblems(catalog('context-band', 'ghost-mod'), ['context-band'])

  assert.notEqual(problems.length, 0)
})

test('a manifest entry missing from the catalog fails', () => {
  const problems = findCatalogProblems(catalog('context-band'), ['context-band', 'other-mod'])

  assert.notEqual(problems.length, 0)
})

test('a Chinese catalog link names the same mod as its English sibling', () => {
  const problems = findCatalogProblems('| [context-band](mods/context-band/README.zh-CN.md) | x |', [
    'context-band',
  ])

  assert.deepEqual(problems, [])
})

test('a cross-linked bilingual pair has no language problems', () => {
  const problems = findLanguageProblems([
    { path: 'README.md', text: '[English](README.md) | [中文](README.zh-CN.md)' },
    { path: 'README.zh-CN.md', text: '[English](README.md) | [中文](README.zh-CN.md)' },
  ])

  assert.deepEqual(problems, [])
})

test('Chinese in a file without the .zh-CN suffix fails', () => {
  const problems = findLanguageProblems([{ path: 'GUIDE.md', text: 'hello 你好' }])

  assert.notEqual(problems.length, 0)
})

test('a Chinese file with no English counterpart fails', () => {
  const problems = findLanguageProblems([{ path: 'README.zh-CN.md', text: '你好' }])

  assert.notEqual(problems.length, 0)
})

test('a bilingual pair that does not cross-link fails', () => {
  const problems = findLanguageProblems([
    { path: 'README.md', text: 'hello' },
    { path: 'README.zh-CN.md', text: '你好' },
  ])

  assert.notEqual(problems.length, 0)
})
