---
name: claude-code
description: |
  Hand a multi-step coding task in this project's folder to Claude Code (the `run` tool of
  the claude-code server): a feature, a bug to find and fix, a refactor, tests to make pass.
  How to write the task, continue it, and check what it did.
---

# Claude Code

`run {task}` starts Claude Code in this project's folder. It works by itself until the
task is done, then returns its last message, the files it changed, a `session`, and why it
stopped. Every tool call it makes (a command, a file it writes, a page it fetches) is
decided by this project's rules, exactly as yours are: what you would be asked about, it
is asked about too, and a refusal stops that call, not the task.

## When to use it

- Code work that takes many steps: reading around the code, editing several files,
  running the tests, fixing what fails.
- Not for one command or one small edit: do those yourself. Not for anything outside the
  project's folder: it cannot reach it.

## Writing the task

Say what done looks like and how to check it:

```
Add a --json flag to `bin/report` that prints the same fields as JSON. Keep the text output
unchanged. Add a test next to the existing ones in test/report.test.js; `npm test` must pass.
```

Name the files or the area when you know them, the commands that test it, and what must
not change. One task per call.

## Its answer

- `stop_reason`: `completed`; `max_turns` or `stopped` (with `stopped_because`: a loop,
  the time limit, the day's turns, a cancel), where it stopped part way; `quota`, when the
  Claude subscription's limit is reached (`quota` says until when); `auth`, when the
  project's Claude subscription or API key is missing or refused (`fix` says what to send);
  `error`.
- `files_changed` (in a git repository), `denied` (tools it was refused), `turns`.

Check its work yourself before you report it: read the diff (`git diff`), run the tests.
To go on with the same context, call `run` again with `session` set to what it returned
and a task that says what is left.
