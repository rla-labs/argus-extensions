// Argus extension claude-code: an MCP server whose tool `run` hands a task to Claude Code
// in the project's folder, with Argus deciding each of its tool calls, watching its steps
// and turns, and able to stop it. No dependencies: Node's own modules only.
//
// Claude Code runs:
//  - on the project's Claude subscription or Anthropic API key, through the route Argus
//    gives this server (ARGUS_ANTHROPIC_BASE_URL): the secret is never in its environment;
//  - in --permission-mode dontAsk, with hooks to this server: whatever Argus does not
//    explicitly allow is refused by Claude Code itself (a hook that fails would let a tool
//    run in other modes);
//  - with --setting-sources user, so a project's own .claude/settings*.json cannot turn the
//    hooks off; no MCP servers, plugins or slash commands; a fixed set of tools.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const EXTENSION = dirname(dirname(fileURLToPath(import.meta.url)))
const CLAUDE = process.env.ARGUS_CLAUDE_BIN ?? join(EXTENSION, 'claude', 'claude')
const HOOK = join(EXTENSION, 'server', 'hook.mjs')
const TOOLS = 'Bash,Read,Edit,Write,WebFetch,WebSearch,TodoWrite'
/** Claude Code's tools, as the Argus tool whose rules decide them. */
const AS = { Bash: 'bash', Read: 'read', Edit: 'edit', MultiEdit: 'edit', Write: 'write', NotebookEdit: 'edit', WebFetch: 'web_fetch', WebSearch: 'web_search', TodoWrite: 'todo_write' }
const RESULT_MAX = 4000

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
const log = (text) => process.stderr.write(`claude-code: ${text}\n`)

// ── the host channel ─────────────────────────────────────────────────────────

/** One connection to Argus, said hello on once; requests by id, and stop at any time. */
class Host {
  constructor(onStop) {
    this.onStop = onStop
    this.pending = new Map()
    this.next = 1
    this.ready = undefined
  }

  hello() {
    this.ready ??= new Promise((resolve, reject) => {
      const path = process.env.ARGUS_HOST_SOCKET
      if (path === undefined) return reject(new Error('this server runs only under Argus (no ARGUS_HOST_SOCKET)'))
      const socket = connect(path)
      socket.on('error', (error) => reject(error))
      socket.on('close', () => {
        for (const settle of this.pending.values()) settle({ ok: false, error: { code: 'HOST_GONE', message: 'Argus closed the channel' } })
        this.pending.clear()
        this.ready = undefined
      })
      socket.on('connect', () => {
        this.socket = socket
        createInterface({ input: socket }).on('line', (line) => {
          let message
          try {
            message = JSON.parse(line)
          } catch {
            return
          }
          if (message.type === 'stop' && message.id === undefined) return this.onStop(String(message.reason ?? 'Argus asked it to stop'))
          const settle = this.pending.get(message.id)
          if (settle !== undefined) {
            this.pending.delete(message.id)
            settle(message)
          }
        })
        this.request({ type: 'hello', token: process.env.ARGUS_HOST_TOKEN }).then((answer) => (answer.ok ? resolve(answer) : reject(new Error(answer.error?.message ?? 'Argus refused hello'))), reject)
      })
    })
    return this.ready
  }

  request(message) {
    const id = this.next++
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.socket.write(`${JSON.stringify({ ...message, id })}\n`)
    })
  }
}

// ── one run ──────────────────────────────────────────────────────────────────

let current
const host = new Host((reason) => current?.stop(reason))

/** The arguments Argus judges a tool call by, in the shape of its own tool. */
function asArgus(tool, input = {}) {
  const as = AS[tool] ?? 'other'
  switch (as) {
    case 'bash':
      return { as, arguments: { command: String(input.command ?? '') } }
    case 'read':
    case 'edit':
    case 'write':
      return { as, arguments: { file_path: String(input.file_path ?? input.notebook_path ?? '') } }
    case 'web_fetch':
      return { as, arguments: { url: String(input.url ?? '') } }
    case 'web_search':
      return { as, arguments: { query: String(input.query ?? '') } }
    default:
      return { as, arguments: {} }
  }
}

/** Every process still running that this run started: they carry its marker. */
function marked(marker) {
  const pids = []
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue
    try {
      if (readFileSync(`/proc/${entry}/environ`, 'latin1').split('\0').includes(`ARGUS_CC_RUN=${marker}`)) pids.push(Number(entry))
    } catch {
      // Gone, or not ours.
    }
  }
  return pids
}

class Run {
  constructor(task, session, greeting) {
    this.task = task
    this.session = session
    this.limits = greeting.limits ?? { max_turns: 50, max_minutes: 30 }
    // The project's choice (delegate.model): through Argus's route Claude Code cannot see
    // the subscription's plan, and would stay on its own default.
    this.model = typeof greeting.model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(greeting.model) ? greeting.model : 'sonnet'
    this.approvalSeconds = Number(greeting.approval_timeout_s ?? 1800)
    this.marker = randomUUID()
    this.stopped = undefined
    this.turns = 0
    this.result = undefined
    this.sessionId = session
  }

  stop(reason) {
    if (this.stopped !== undefined || this.child === undefined) return
    this.stopped = reason
    log(`stopping: ${reason}`)
    const group = -this.child.pid
    try {
      process.kill(group, 'SIGTERM')
    } catch {
      // Already gone.
    }
    // Claude Code ends what it started on SIGTERM; if it hangs, nothing it started stays.
    setTimeout(() => {
      try {
        process.kill(group, 'SIGKILL')
      } catch {
        // Gone.
      }
      for (const pid of marked(this.marker)) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          // Gone.
        }
      }
    }, 5_000).unref()
  }

  /** A hook from Claude Code: decide (before) or report (after) one tool call. */
  async hook(event) {
    const { as, arguments: args } = asArgus(event.tool_name, event.tool_input)
    if (event.hook_event_name === 'PreToolUse') {
      const answer = await host.request({ type: 'ask', tool: event.tool_name, as, arguments: args })
      if (answer.ok && answer.decision === 'allow') return { decision: 'allow', reason: String(answer.reason ?? 'allowed') }
      return { decision: 'deny', reason: String(answer.reason ?? answer.error?.message ?? 'not allowed') }
    }
    if (event.hook_event_name === 'PostToolUse') {
      const response = event.tool_response ?? {}
      const ok = !(response.is_error === true || response.interrupted === true)
      const answer = await host.request({ type: 'step', tool: event.tool_name, arguments: args, ok, result: JSON.stringify(response).slice(0, RESULT_MAX) })
      if (answer.ok && answer.continue === false) this.stop(String(answer.reason ?? 'Argus stopped it'))
      return {}
    }
    return {}
  }

  async start(home) {
    // The hooks reach this server on a socket in its private home, which the project's
    // agent cannot read.
    const hookSocket = join(home, '.argus-hook.sock')
    rmSync(hookSocket, { force: true })
    this.hookServer = createServer((connection) => {
      createInterface({ input: connection }).once('line', (line) => {
        let event
        try {
          event = JSON.parse(line)
        } catch {
          return connection.end(`${JSON.stringify({ decision: 'deny', reason: 'unreadable hook event' })}\n`)
        }
        this.hook(event).then(
          (answer) => connection.end(`${JSON.stringify(answer)}\n`),
          (error) => connection.end(`${JSON.stringify({ decision: 'deny', reason: `Argus could not decide: ${error.message}` })}\n`),
        )
      })
    })
    await new Promise((resolve) => this.hookServer.listen(hookSocket, resolve))

    mkdirSync(join(home, '.claude'), { recursive: true })
    const hook = (timeout) => [{ matcher: '*', hooks: [{ type: 'command', command: `node ${HOOK}`, timeout }] }]
    writeFileSync(
      join(home, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { PreToolUse: hook(this.approvalSeconds + 60), PostToolUse: hook(60) }, permissions: { defaultMode: 'dontAsk' } }, null, 2),
    )

    const args = ['-p', this.task, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk', '--setting-sources', 'user', '--tools', TOOLS, '--strict-mcp-config', '--disable-slash-commands', '--max-turns', String(this.limits.max_turns), '--model', this.model]
    if (this.session !== undefined) args.push('--resume', this.session)
    const proxy = process.env.HTTPS_PROXY
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: home,
      TMPDIR: process.env.TMPDIR ?? home,
      LANG: process.env.LANG ?? 'C.UTF-8',
      ...(proxy === undefined ? {} : { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, https_proxy: proxy, http_proxy: proxy, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }),
      // The route adds the credential; this token only satisfies Claude Code's own check.
      ANTHROPIC_BASE_URL: process.env.ARGUS_ANTHROPIC_BASE_URL ?? '',
      ANTHROPIC_AUTH_TOKEN: 'argus-route',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_AUTOUPDATER: '1',
      DISABLE_TELEMETRY: '1',
      ARGUS_HOOK_SOCKET: hookSocket,
      ARGUS_CC_RUN: this.marker,
    }
    this.child = spawn(CLAUDE, args, { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    const timer = setTimeout(() => this.stop(`it ran for ${this.limits.max_minutes} minutes (delegate.max_minutes)`), this.limits.max_minutes * 60_000)
    timer.unref()
    let stderr = ''
    this.child.stderr.on('data', (chunk) => (stderr = `${stderr}${chunk}`.slice(-2000)))
    const lines = createInterface({ input: this.child.stdout })
    lines.on('line', (line) => void this.event(line))
    const code = await new Promise((resolve) => this.child.on('close', resolve))
    clearTimeout(timer)
    this.hookServer.close()
    rmSync(hookSocket, { force: true })
    return this.outcome(code, stderr)
  }

  async event(line) {
    let event
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    if (event.type === 'system' && event.subtype === 'init') this.sessionId = event.session_id ?? this.sessionId
    if (event.type === 'assistant' && event.message?.usage !== undefined) {
      this.turns += 1
      const usage = event.message.usage
      const answer = await host.request({
        type: 'usage',
        model: event.message.model,
        input_tokens: usage.input_tokens ?? 0,
        cached_tokens: usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
      })
      if (answer.ok && answer.continue === false) this.stop(String(answer.reason ?? 'Argus stopped it'))
    }
    if (event.type === 'result') this.result = event
  }

  outcome(code, stderr) {
    const result = this.result
    const text = typeof result?.result === 'string' ? result.result : ''
    const quota = /You've hit your [^\n]*?limit[^\n]*/.exec(text)?.[0]
    const stopReason =
      this.stopped !== undefined
        ? 'stopped'
        : quota !== undefined
          ? 'quota'
          : result?.api_error_status === 401
            ? 'auth'
            : result?.subtype === 'error_max_turns'
              ? 'max_turns'
              : result?.is_error === true || result === undefined
                ? 'error'
                : 'completed'
    const files = existsSync(join(process.cwd(), '.git')) ? spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.split('\n').filter((row) => row.trim() !== '').map((row) => row.slice(3)) : []
    return {
      result: text,
      session: this.sessionId ?? null,
      turns: result?.num_turns ?? this.turns,
      stop_reason: stopReason,
      ...(this.stopped === undefined ? {} : { stopped_because: this.stopped }),
      ...(quota === undefined ? {} : { quota }),
      ...(stopReason === 'auth' ? { fix: text } : {}),
      ...(stopReason === 'error' && text === '' ? { error: stderr.trim().split('\n').slice(-5).join('\n') || `Claude Code ended with code ${code}` } : {}),
      denied: (result?.permission_denials ?? []).map((denial) => denial.tool_name),
      files_changed: files,
    }
  }
}

async function run(params, requestId) {
  if (current !== undefined) return { error: 'Claude Code is already working on a task for this project; one at a time.' }
  const task = typeof params?.task === 'string' ? params.task.trim() : ''
  if (task === '') return { error: 'run needs a task: what to do, in words.' }
  if (!existsSync(CLAUDE)) return { error: 'Claude Code is not installed in this extension (its install did not finish).' }
  const greeting = await host.hello()
  current = new Run(task, typeof params.session === 'string' && params.session !== '' ? params.session : undefined, greeting)
  current.requestId = requestId
  try {
    return await current.start(process.env.HOME ?? '/tmp')
  } finally {
    current = undefined
  }
}

// ── MCP over stdio ───────────────────────────────────────────────────────────

const TOOL = {
  name: 'run',
  description:
    "Hand a task to Claude Code, working in this project's folder: a feature, a fix, a refactor, tests to make pass. Every tool call it makes is decided by the project's rules, as yours are. Returns its final message, its session (pass it back as `session` to continue), the files it changed, and why it stopped.",
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'What to do: the goal, where in the code, how to check it is done.' },
      session: { type: 'string', description: 'A session a previous run returned, to continue it.' },
    },
    required: ['task'],
  },
}

for await (const line of createInterface({ input: process.stdin })) {
  if (line.trim() === '') continue
  let message
  try {
    message = JSON.parse(line)
  } catch {
    continue
  }
  const { id, method, params } = message
  if (method === 'notifications/cancelled') {
    if (current !== undefined && current.requestId === params?.requestId) current.stop('cancelled')
    continue
  }
  if (id === undefined) continue
  if (method === 'initialize') {
    send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'claude-code', version: '1.0.0' } } })
  } else if (method === 'tools/list') {
    send({ id, result: { tools: [TOOL] } })
  } else if (method === 'tools/call' && params?.name === 'run') {
    run(params.arguments ?? {}, id).then(
      (out) => send({ id, result: { content: [{ type: 'text', text: out.error ?? JSON.stringify(out, null, 2) }], isError: out.error !== undefined } }),
      (error) => send({ id, result: { content: [{ type: 'text', text: `Claude Code could not run: ${error.message}` }], isError: true } }),
    )
  } else if (method === 'ping') {
    send({ id, result: {} })
  } else {
    send({ id, error: { code: -32601, message: `no method ${method}` } })
  }
}
