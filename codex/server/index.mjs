// Argus extension codex: an MCP server whose tool `run` hands a task to OpenAI's Codex in
// the project's folder, with Argus deciding each command it runs and watching its steps.
// No dependencies: Node's own modules only.
//
// Codex runs:
//  - on Argus's OpenAI (or OpenRouter) API key, through the route Argus gives this server
//    (ARGUS_OPENAI_BASE_URL): the key is never in its environment, and Argus counts every
//    request from OpenAI's own answer (this server reports no usage);
//  - with its own sandbox off (Argus confines it) and approvals off, behind hooks to this
//    server: Codex lets a tool run when its hook fails, so hook.sh turns every failure into
//    a refusal;
//  - with its own config in a private CODEX_HOME, written here each time: web search,
//    plugins, apps, browser and computer use, subagents and the rest off.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const EXTENSION = dirname(dirname(fileURLToPath(import.meta.url)))
const CODEX = process.env.ARGUS_CODEX_BIN ?? join(EXTENSION, 'codex', 'codex')
const CODEX_PATH = join(EXTENSION, 'codex', 'path')
const HOOK = join(EXTENSION, 'server', 'hook.sh')
const RESULT_MAX = 4000
/** Codex features the delegated agent must not have: the model gets the shell and images. */
const FEATURES_OFF = ['apps', 'browser_use', 'browser_use_external', 'browser_annotation_api', 'computer_use', 'code_mode_host', 'goals', 'image_generation', 'in_app_browser', 'multi_agent', 'plugins', 'remote_plugin', 'plugin_sharing', 'skill_mcp_dependency_install', 'skill_search', 'daemon_auto_start', 'guardian_approval']
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
const log = (text) => process.stderr.write(`codex: ${text}\n`)
const toml = (value) => JSON.stringify(value)

// ── the host channel ─────────────────────────────────────────────────────────

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
        this.socket = undefined
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
    if (this.socket === undefined) return Promise.resolve({ ok: false, error: { code: 'HOST_GONE', message: 'no channel to Argus' } })
    const id = this.next++
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.socket.write(`${JSON.stringify({ ...message, id })}\n`)
    })
  }
}

let current
const host = new Host((reason) => current?.stop(reason))

/** The files an apply_patch touches, from its headers. */
function patchFiles(patch) {
  return [...String(patch).matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((match) => match[1].trim()).concat([...String(patch).matchAll(/^\*\*\* Move to: (.+)$/gm)].map((match) => match[1].trim()))
}

/** A Codex tool call as the Argus tool whose rules decide it, and its arguments. */
function asArgus(tool, input = {}) {
  switch (tool) {
    case 'Bash':
      return { as: 'bash', arguments: { command: String(input.command ?? input.cmd ?? '') } }
    case 'apply_patch':
    case 'Edit':
    case 'Write': {
      // Several files: the one outside the project's folder, if any, decides.
      const files = patchFiles(input.command ?? input.patch ?? '')
      const outside = files.find((file) => isAbsolute(file) ? relative(process.cwd(), file).startsWith('..') : file.split('/').includes('..'))
      return { as: 'write', arguments: { file_path: outside ?? files[0] ?? '' } }
    }
    case 'view_image':
      return { as: 'read', arguments: { file_path: String(input.path ?? '') } }
    default:
      return { as: 'other', arguments: {} }
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
    this.approvalSeconds = Number(greeting.approval_timeout_s ?? 1800)
    // delegate.codex_model; absent: Codex's own default.
    this.model = typeof greeting.model === 'string' && MODEL.test(greeting.model) ? greeting.model : undefined
    this.marker = randomUUID()
    this.stopped = undefined
    this.steps = 0
    this.sessionId = session
    this.message = ''
    this.failure = undefined
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

  async hook(event) {
    const { as, arguments: args } = asArgus(event.tool_name, event.tool_input)
    if (event.hook_event_name === 'PreToolUse') {
      if (event.tool_name === 'request_user_input') return { decision: 'deny', reason: 'nobody can answer a question here; decide yourself, or say what you need in your final message' }
      const answer = await host.request({ type: 'ask', tool: event.tool_name, as, arguments: args })
      if (answer.ok && answer.decision === 'allow') return { decision: 'allow', reason: String(answer.reason ?? 'allowed') }
      return { decision: 'deny', reason: String(answer.reason ?? answer.error?.message ?? 'not allowed') }
    }
    if (event.hook_event_name === 'PostToolUse') {
      this.steps += 1
      const response = event.tool_response ?? {}
      const ok = !(response.exit_code !== undefined && response.exit_code !== 0) && response.is_error !== true
      const answer = await host.request({ type: 'step', tool: event.tool_name, arguments: args, ok, result: JSON.stringify(response).slice(0, RESULT_MAX) })
      if (answer.ok && answer.continue === false) this.stop(String(answer.reason ?? 'Argus stopped it'))
      else if (this.steps >= this.limits.max_turns) this.stop(`it took ${this.limits.max_turns} steps (delegate.max_turns)`)
      return {}
    }
    return {}
  }

  async start(home) {
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

    // Codex's own home, written each run: what it may use, and the hooks to this server.
    // The hook answers within its deadline; Codex's timeout for it is longer still.
    const codexHome = join(home, 'codex-home')
    mkdirSync(codexHome, { recursive: true })
    const deadline = this.approvalSeconds + 10
    writeFileSync(
      join(codexHome, 'config.toml'),
      [
        'model_provider = "argus"',
        ...(this.model === undefined ? [] : [`model = ${toml(this.model)}`]),
        'approval_policy = "never"',
        'sandbox_mode = "danger-full-access"',
        'web_search = "disabled"',
        // The project's own .codex/ (which its agent can write) is never loaded: it could
        // turn the hooks off.
        `[projects.${toml(process.cwd())}]`,
        'trust_level = "untrusted"',
        '[model_providers.argus]',
        'name = "Argus"',
        `base_url = ${toml(process.env.ARGUS_OPENAI_BASE_URL ?? '')}`,
        'wire_api = "responses"',
        'env_key = "ARGUS_ROUTE_KEY"',
        '[features]',
        ...FEATURES_OFF.map((feature) => `${feature} = false`),
        '[[hooks.PreToolUse]]',
        'matcher = "*"',
        '[[hooks.PreToolUse.hooks]]',
        'type = "command"',
        `command = ${toml(`sh ${HOOK}`)}`,
        `timeout = ${deadline + 20}`,
        '[[hooks.PostToolUse]]',
        'matcher = "*"',
        '[[hooks.PostToolUse.hooks]]',
        'type = "command"',
        `command = ${toml(`sh ${HOOK}`)}`,
        'timeout = 60',
        '',
      ].join('\n'),
    )

    const args = ['exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-hook-trust', '--enable', 'hooks', ...(this.session === undefined ? [this.task] : ['resume', this.session, this.task])]
    const proxy = process.env.HTTPS_PROXY
    const env = {
      PATH: `${CODEX_PATH}:${process.env.PATH ?? '/usr/bin:/bin'}`,
      HOME: home,
      TMPDIR: process.env.TMPDIR ?? home,
      LANG: process.env.LANG ?? 'C.UTF-8',
      CODEX_HOME: codexHome,
      ...(proxy === undefined ? {} : { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, https_proxy: proxy, http_proxy: proxy, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }),
      // The route adds Argus's key; this only satisfies Codex's own check.
      ARGUS_ROUTE_KEY: 'argus-route',
      ARGUS_HOOK_SOCKET: hookSocket,
      ARGUS_HOOK_DEADLINE_S: String(deadline),
      ARGUS_CC_RUN: this.marker,
    }
    this.child = spawn(CODEX, args, { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    const timer = setTimeout(() => this.stop(`it ran for ${this.limits.max_minutes} minutes (delegate.max_minutes)`), this.limits.max_minutes * 60_000)
    timer.unref()
    let stderr = ''
    this.child.stderr.on('data', (chunk) => (stderr = `${stderr}${chunk}`.slice(-2000)))
    createInterface({ input: this.child.stdout }).on('line', (line) => this.event(line))
    const code = await new Promise((resolve) => this.child.on('close', resolve))
    clearTimeout(timer)
    this.hookServer.close()
    rmSync(hookSocket, { force: true })
    return this.outcome(code, stderr)
  }

  event(line) {
    let event
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    if (event.type === 'thread.started') this.sessionId = event.thread_id ?? this.sessionId
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') this.message = String(event.item.text ?? '')
    if (event.type === 'turn.failed') this.failure = String(event.error?.message ?? 'the turn failed')
  }

  outcome(code, stderr) {
    const refused = this.failure !== undefined && /Argus: /.test(this.failure) ? /Argus: [^"\\]*/.exec(this.failure)?.[0] : undefined
    const stopReason =
      this.stopped !== undefined ? 'stopped' : refused !== undefined ? 'refused' : this.failure !== undefined ? 'error' : code === 0 ? 'completed' : 'error'
    const files = existsSync(join(process.cwd(), '.git')) ? spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.split('\n').filter((row) => row.trim() !== '').map((row) => row.slice(3)) : []
    return {
      result: this.message,
      session: this.sessionId ?? null,
      steps: this.steps,
      stop_reason: stopReason,
      ...(this.stopped === undefined ? {} : { stopped_because: this.stopped }),
      ...(refused === undefined ? {} : { refused_because: refused }),
      ...(stopReason === 'error' ? { error: this.failure ?? (stderr.trim().split('\n').slice(-5).join('\n') || `Codex ended with code ${code}`) } : {}),
      files_changed: files,
    }
  }
}

async function run(params, requestId) {
  if (current !== undefined) return { error: 'Codex is already working on a task for this project; one at a time.' }
  const task = typeof params?.task === 'string' ? params.task.trim() : ''
  if (task === '') return { error: 'run needs a task: what to do, in words.' }
  if (!existsSync(CODEX)) return { error: 'Codex is not installed in this extension (its install did not finish).' }
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
    "Hand a task to OpenAI's Codex, working in this project's folder: a feature, a fix, a refactor, tests to make pass. Every command it runs is decided by the project's rules, as yours are. Returns its final message, its session (pass it back as `session` to continue), the files it changed, and why it stopped.",
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
    send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'codex', version: '1.0.0' } } })
  } else if (method === 'tools/list') {
    send({ id, result: { tools: [TOOL] } })
  } else if (method === 'tools/call' && params?.name === 'run') {
    run(params.arguments ?? {}, id).then(
      (out) => send({ id, result: { content: [{ type: 'text', text: out.error ?? JSON.stringify(out, null, 2) }], isError: out.error !== undefined } }),
      (error) => send({ id, result: { content: [{ type: 'text', text: `Codex could not run: ${error.message}` }], isError: true } }),
    )
  } else if (method === 'ping') {
    send({ id, result: {} })
  } else {
    send({ id, error: { code: -32601, message: `no method ${method}` } })
  }
}
