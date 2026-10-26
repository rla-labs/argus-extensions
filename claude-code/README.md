# Argus extension: claude-code

[Claude Code](https://code.claude.com) for [Argus](https://github.com/rla-labs/argus)
projects: the project's agent hands it a coding task in the project's folder, and Argus
decides each of its tool calls, watches its steps for loops, counts its turns and can stop
it, as it does for the project's own agent.

```
/ext install https://github.com/rla-labs/argus-extensions#claude-code
/key CLAUDE_CODE_OAUTH_TOKEN <token>      # a Claude subscription: make one with `claude setup-token`
/ext enable <project> claude-code
```

Or on the Anthropic API: `/key anthropic <key>` and `/set <project> delegate.backend api`;
its turns are then charged against the project's budget. On a subscription they cost
nothing in Argus, and the Costs page shows what they would have cost at API prices.
Subscriptions are for their subscriber's own use: run it for yourself, not as a service.

What it does, and how it is held:

- `run {task, session?}` starts Claude Code (pinned, from Anthropic's npm package, checked
  against its sha-512) in the project's folder, confined like every extension server, its
  network held to Argus's egress proxy.
- It reaches Anthropic through a route in Argus that adds the subscription's token or the
  API key: neither is ever in its environment, where its own commands could read it.
- Every tool call goes through Argus first (hooks, in `dontAsk` mode: what Argus does not
  allow is refused by Claude Code itself), judged by the project's rules as the project
  agent's own: reading in the folder runs, commands and writes follow the project's
  settings, and a question goes to the chat with the same buttons. A project's own
  `.claude/settings*.json` cannot turn this off.
- Its steps are watched for loops, its turns counted against `delegate.day_turns`, its
  time against `delegate.max_minutes`, its turns per call against `delegate.max_turns`;
  a cancel stops it and everything it started.
- Its model is the project's choice, `delegate.model` (`sonnet` by default; `opus`, `haiku`, or a
  model id): through Argus's route it cannot see the subscription's plan, and would otherwise
  stay on its own default, Opus, which spends a plan fastest.
- Tools: Bash, Read, Edit, Write, WebFetch, WebSearch, TodoWrite. No MCP servers, plugins,
  subagents or slash commands of its own.

The test (`test/e2e.mjs`, also the smoke test) runs the real Claude Code against a fake
Anthropic API and a fake Argus channel: no account needed.

Claude Code is Anthropic's, under its own terms (`claude/LICENSE.md` once installed).
