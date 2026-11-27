import { expect, test } from 'claude-code/testing'

import type { Engine } from 'claude-code/testing'
import type { TurnStepInput } from 'claude-code'

import { parseLevel, parseSwitch } from './register'

test('parses the level word from the classifier reply', () => {
  expect(parseLevel('high')).toBe('high')
  expect(parseLevel(' XHigh.\n')).toBe('xhigh')
  expect(parseLevel('Level: low')).toBe('low')
  expect(parseLevel('unknown')).toBe(undefined)
})

test('parses on and off', () => {
  expect(parseSwitch(' on ')).toBe(true)
  expect(parseSwitch('OFF')).toBe(false)
  expect(parseSwitch('')).toBe(undefined)
})

const step = async ($: Engine, input: Partial<TurnStepInput> & { turnId: string }) => {
  for await (const _chunk of $.turn.step({ index: 0, messageCount: 1, model: 'claude-opus-5-5', effort: 'medium', ...input })) {
  }
}

test('sets every main step of a turn to the classified level and leaves subagents alone', async ($, on) => {
  const sent: (TurnStepInput['effort'])[] = []
  const asked: string[] = []
  const store = new Map<string, unknown>()
  let reply = 'high'

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e } }) as never)
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('model.complete', ($, e) => {
    asked.push(e.prompt)

    return { value: { isAnswered: true, text: reply, usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* ($, e) {
    sent.push(e.effort)

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })

  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)

  await $.turn.start({ turnId: 't1', text: 'Design and build a new plugin system' })
  await step($, { turnId: 't1' })
  await step($, { turnId: 't1', index: 1 })
  await step($, { turnId: 't1', agentId: 'a1' })
  expect(sent).toEqual(['high', 'high', 'medium'])
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('Design and build a new plugin system')

  reply = 'low'
  await $.turn.start({ turnId: 't2', text: 'hi' })
  await step($, { turnId: 't2' })
  expect(sent.at(-1)).toBe('low')

  await $.turn.start({ turnId: 't3', text: '' })
  await step($, { turnId: 't3' })
  expect(sent.at(-1)).toBe('low')
  expect(asked.length).toBe(2)

  await $.command.run({ command: 'auto-effort', args: 'off' } as never)
  await $.turn.start({ turnId: 't4', text: 'prove the Riemann hypothesis' })
  await step($, { turnId: 't4' })
  expect(sent.at(-1)).toBe('medium')
  expect(asked.length).toBe(2)
})

test('keeps the session level when the classifier gives no level', async ($, on) => {
  const sent: (TurnStepInput['effort'])[] = []

  on('store.get', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: { input_tokens: 0, output_tokens: 0 } } }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    sent.push(e.effort)

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })

  await $.turn.start({ turnId: 't1', text: 'fix the bug' })
  await step($, { turnId: 't1', effort: 'xhigh' })
  expect(sent).toEqual(['xhigh'])
})
