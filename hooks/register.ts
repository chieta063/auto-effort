import type { EngineInterface, ModelEffort, Register } from 'claude-code'

const COMMAND = 'auto-effort'
const STORE_KEY = 'enabled'
const CLASSIFIER_MODEL = 'haiku'
const TIMEOUT_MS = 8000
const MAX_PROMPT_CHARS = 4000
const LEVELS: readonly ModelEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const SYSTEM = `You pick the reasoning effort level for a coding agent (Claude Code) before it starts working on the user's request.
Levels, following Anthropic's effort guidance:
- low: simple, tightly scoped work where speed matters most. Chat, greetings, short factual questions, a one-line answer, reading or explaining one known file, a trivial edit.
- medium: well-specified agentic or tool work with a clear target. A small bug fix or feature in known files, running a command and reporting, routine refactors, writing a short document.
- high: complex reasoning, hard coding, or agentic tasks needing investigation. Debugging an unknown cause, designing across several files, code review, non-trivial research.
- xhigh: long-running agentic coding expected to take 30+ minutes. Large features, multi-step migrations, building a new tool or subsystem end to end.
- max: the deepest possible analysis. Frontier-hard problems, proofs, security audits, or when the user explicitly asks to think as hard as possible.
When unsure between two levels, pick the higher one.
Reply with exactly one word: low, medium, high, xhigh, or max.`

export const parseLevel = (text: string): ModelEffort | undefined => {
  const words: readonly string[] = text.toLowerCase().match(/[a-z]+/g) ?? []

  return LEVELS.find(level => words.includes(level))
}

export const parseSwitch = (args: string): boolean | undefined => {
  const word = args.trim().toLowerCase()

  if (word === 'on') {
    return true
  }

  if (word === 'off') {
    return false
  }

  return undefined
}

const prompts = new Map<string, string>()
const chosen = new Map<string, ModelEffort | null>()
let lastLevel: ModelEffort | undefined

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get(STORE_KEY)) !== false
}

async function classify($: EngineInterface, text: string): Promise<ModelEffort | undefined> {
  const result = await $.model.complete({
    model: CLASSIFIER_MODEL,
    system: SYSTEM,
    prompt: `User request:\n<request>\n${text.slice(0, MAX_PROMPT_CHARS)}\n</request>`,
    effort: 'low',
    maxTokens: 300,
    timeoutMs: TIMEOUT_MS,
  })

  return result.isAnswered ? parseLevel(result.text) : undefined
}

async function levelFor($: EngineInterface, turnId: string): Promise<ModelEffort | undefined> {
  const known = chosen.get(turnId)

  if (known !== undefined) {
    return known ?? undefined
  }

  const text = prompts.get(turnId)?.trim() ?? ''
  prompts.delete(turnId)
  const level = text === '' ? lastLevel : await classify($, text).catch(() => undefined)
  chosen.set(turnId, level ?? null)

  if (level !== undefined) {
    lastLevel = level
  }

  return level
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Turn automatic effort selection on or off (/auto-effort on|off)',
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const value = parseSwitch(e.args)

    if (value !== undefined) {
      await $.store.set(STORE_KEY, value)
    }

    const state = (await isEnabled($)) ? 'on' : 'off'

    return { text: `auto-effort: ${state}` }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      prompts.set(e.turnId, e.text)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    prompts.delete(e.turnId)
    chosen.delete(e.turnId)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || e.effort === undefined || !(await isEnabled($))) {
      return yield* next(e)
    }

    const level = await levelFor($, e.turnId)

    return yield* next(level === undefined ? e : { ...e, effort: level })
  })
}
