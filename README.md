# auto-effort

A Claude Code mod that picks the reasoning effort level for each turn before work starts.

When a turn begins, the mod sends the prompt to Haiku (at effort `low`) and asks it to choose one of `low`, `medium`, `high`, `xhigh` or `max`, following Anthropic's [effort guidance](https://platform.claude.com/docs/en/build-with-claude/effort). Every model request of that main turn is then sent at the chosen level.

- Subagents keep their own effort.
- Models without effort support are left alone.
- If the classifier fails or takes longer than 8 seconds, the session's own level is kept.
- A turn with no prompt text (a continuation) reuses the previous level.
- Levels a model does not support, and any `maxEffortLevel` cap, are lowered by Claude Code itself.

## Commands

- `/auto-effort off` stops automatic selection.
- `/auto-effort on` turns it back on.
- `/auto-effort` shows the current state.

## Install

At the prompt of a terminal session:

```
/plugin install auto-effort --marketplace chieta063/auto-effort
```

Answer `y` to add the marketplace, then choose a scope.

From a shell:

```bash
claude plugin install auto-effort --marketplace chieta063/auto-effort
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `chieta063/auto-effort`, then Add plugin.

## Cost

Each turn makes one small Haiku call (the prompt, up to 4,000 characters, and a one-word reply). It adds a short delay before the first response.

## License

[MIT](LICENSE)
