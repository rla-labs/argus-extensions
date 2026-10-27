---
name: codex
description: |
  Hand a multi-step coding task in this project's folder to OpenAI's Codex (the `run` tool
  of the codex server): a feature, a bug to find and fix, a refactor, tests to make pass.
  How to write the task, continue it, and check what it did.
---

# Codex

`run {task}` starts Codex in this project's folder. It works by itself until the task is
done, then returns its last message, the files it changed, a `session`, and why it
stopped. Every command it runs and every file it changes is decided by this project's
rules, exactly as yours are: what you would be asked about, it is asked about too, and a
refusal stops that command, not the task. It runs on Argus's OpenAI API key; each of its
requests is a cost against this project's budget.

## When to use it

- Code work that takes many steps: reading around the code, editing several files,
  running the tests, fixing what fails.
- Not for one command or one small edit: do those yourself.

## Writing the task

Say what done looks like and how to check it: the goal, the files or the area, the
command that tests it, what must not change. One task per call.

## Its answer

- `stop_reason`: `completed`; `stopped` (with `stopped_because`: a loop, its time or step
  limit, a cancel); `refused` (with `refused_because`: Argus refused its next request, for
  the budget or the day's turns); `error`.
- `files_changed` (in a git repository), `steps`, `session`.

Check its work before you report it: read the diff (`git diff`), run the tests. To go on
with the same context, call `run` again with `session` and a task that says what is left.
