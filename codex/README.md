# Argus extension: codex

OpenAI's [Codex](https://developers.openai.com/codex) CLI for
[Argus](https://github.com/rla-labs/argus) projects: the project's agent hands it a coding
task in the project's folder, and Argus decides each command it runs, watches its steps and
counts each of its requests, as it does for the project's own agent.

```
/ext install https://github.com/rla-labs/argus-extensions#codex
/key openai <key>                  # an OpenAI API key; or, with codex_provider: openrouter,
                                   # /key openrouter <key>
/ext enable <project> codex
/set <project> delegate.codex_model <model id>    # optional: Codex's default otherwise
/set <project> delegate.codex_provider openrouter  # optional: OpenRouter instead of OpenAI
```

How it is held:

- `run {task, session?}` starts Codex 0.164.0 (pinned, from OpenAI's npm package, checked
  against its sha-512; only the program and its ripgrep) in the project's folder, confined
  like every extension server, its network held to Argus's egress proxy.
- It reaches OpenAI through a route in Argus that adds the API key: the key is never in its
  environment. Argus reads what each request used from OpenAI's own answer and records it
  against the project's budget, and refuses the next request once the budget or the day's
  delegated turns are used.
- Every command and file change goes through Argus first (hooks), judged by the project's
  rules. Codex lets a tool run when its hook fails, so the hook here turns every failure of
  its own into a refusal, within a deadline shorter than Codex's. The project's own
  `.codex/` folder is never loaded (it could turn the hooks off).
- Codex's own sandbox and approvals are off (Argus confines it); web search, plugins, apps,
  browser and computer use, subagents and image generation are off. The model gets the
  shell, file patches and images.

The test (`test/e2e.mjs`, also the smoke test) runs the real Codex against a fake OpenAI API
and a fake Argus channel: no account needed. It checks that a planted `.codex/config.toml`
cannot turn the hooks off, and that a command is refused when Argus does not answer.

Codex is OpenAI's, under the Apache License 2.0.
