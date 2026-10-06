// Fixture tests for the mod/manifest agreement check exported by check.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findAgreementProblems } from './check.mjs'

const mod = (name) => ({ name, pluginName: name })
const entry = (name) => ({ name, source: `./mods/${name}` })

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
