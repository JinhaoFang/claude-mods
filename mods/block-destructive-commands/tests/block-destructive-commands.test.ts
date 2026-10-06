/*
 * block-destructive-commands — external behaviour test.
 *
 * We authored this test because the vendored upstream mod ships none. It
 * exercises the guard from outside: a destructive Bash call is denied, an
 * ordinary one passes through. It does not test the internal pattern list.
 */
import { expect, test } from 'claude-code/testing'

const DENIED = [
  'rm -rf /',
  'git push --force origin main',
  'git reset --hard HEAD~3',
  'DROP TABLE users;',
  'chmod -R 777 /var/www',
]

const ALLOWED = [
  'ls -la',
  'rm -rf ./build',
  'git push origin main',
  'git push --force-with-lease origin main',
  'SELECT * FROM users;',
]

test('a destructive Bash command is denied', async ($) => {
  for (const command of DENIED) {
    const result = await $.tool.call({ tool: 'Bash', command })
    expect(result.deny, `\`${command}\` should be denied`).toContain('block-destructive-commands')
  }
})

test('an ordinary Bash command passes through to the tool', async ($, on) => {
  const reached: string[] = []
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    reached.push(String(e.command))
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })

  for (const command of ALLOWED) {
    const result = await $.tool.call({ tool: 'Bash', command })
    expect(result.deny, `\`${command}\` should not be denied`).toBeUndefined()
  }

  expect(reached).toEqual(ALLOWED)
})
