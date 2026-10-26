// The claude-code extension end to end, with no account: the real Claude Code (installed by
// fetch.sh) against a fake Anthropic API, and this extension's server against a fake Argus
// host channel. Run by test/smoke.sh (Argus's extension check, confined in a project's
// folder) and by this repository's CI. Exits 1 on the first failed check.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttp } from 'node:http'
import { createServer as createNet } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const SERVER = join(dirname(dirname(fileURLToPath(import.meta.url))), 'server', 'index.mjs')
const HOST_TOKEN = 'host-token-SECRET'
let failed = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? '  ok' : ' err'} ${what}${ok || detail === '' ? '' : `\n${detail}`}`)
  if (!ok) failed = 1
}

/** A fake Anthropic API answering each turn from a script: a tool call, or text. */
async function anthropic(script) {
  let turn = 0
  const server = createHttp((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      if (!req.url.startsWith('/v1/messages')) return res.writeHead(404).end('{}')
      if (req.url.includes('count_tokens')) return res.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":10}')
      const parsed = JSON.parse(body || '{}')
      const main = Array.isArray(parsed.tools) && parsed.tools.length > 0
      const step = main ? script[Math.min(turn++, script.length - 1)] : { text: 'title' }
      const events = [['message_start', { type: 'message_start', message: { id: `msg_${turn}`, type: 'message', role: 'assistant', model: parsed.model, content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 } } }]]
      if (step.tool !== undefined) {
        events.push(['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${turn}`, name: step.tool, input: {} } }], ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(step.input) } }], ['content_block_stop', { type: 'content_block_stop', index: 0 }], ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } }])
      } else {
        events.push(['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }], ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: step.text } }], ['content_block_stop', { type: 'content_block_stop', index: 0 }], ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }])
      }
      events.push(['message_stop', { type: 'message_stop' }])
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

/** A fake Argus host channel: hello, then ask, step and usage as `decide` says. */
let sockets = 0
async function argus(root, decide) {
  const seen = { ask: [], step: [], usage: [] }
  const path = join(root, `host${(sockets += 1)}.sock`)
  const server = createNet((socket) => {
    createInterface({ input: socket }).on('line', (line) => {
      const message = JSON.parse(line)
      let answer
      if (message.type === 'hello') answer = message.token === HOST_TOKEN ? { ok: true, project: 'site', server: 'claude-code', host: ['approvals', 'steps', 'usage'], limits: { max_turns: 20, max_minutes: 5 }, approval_timeout_s: 60 } : { ok: false, error: { code: 'HOST_MESSAGE_REFUSED', message: 'token' } }
      else {
        seen[message.type]?.push(message)
        answer = { ok: true, ...decide(message, seen) }
      }
      socket.write(`${JSON.stringify({ ...answer, id: message.id })}\n`)
    })
  })
  await new Promise((resolve) => server.listen(path, resolve))
  return { path, seen, close: () => server.close() }
}

/** Start the server, call run once, return its answer. */
async function run(root, project, api, host, task) {
  const home = join(root, `home-${sockets}`)
  mkdirSync(home, { recursive: true })
  const child = spawn(process.execPath, [SERVER], {
    cwd: project,
    env: { PATH: process.env.PATH, HOME: home, TMPDIR: home, ARGUS_HOST_SOCKET: host.path, ARGUS_HOST_TOKEN: HOST_TOKEN, ARGUS_ANTHROPIC_BASE_URL: api.url, ...(process.env.ARGUS_CLAUDE_BIN === undefined ? {} : { ARGUS_CLAUDE_BIN: process.env.ARGUS_CLAUDE_BIN }) },
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const call = async (id, method, params) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    for (;;) {
      const message = JSON.parse((await lines.next()).value)
      if (message.id === id) return message
    }
  }
  await call(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })
  const answer = await call(2, 'tools/call', { name: 'run', arguments: { task } })
  child.kill()
  const text = answer.result.content[0].text
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

const root = mkdtempSync(join(process.env.E2E_TMP ?? tmpdir(), 'cc-e2e-'))
try {
  // 1. Every tool call asks Argus; a refusal is respected; a project's own settings cannot
  //    turn the hooks off; nothing secret is visible to its commands.
  {
    const project = join(root, 'p1')
    mkdirSync(join(project, '.claude'), { recursive: true })
    const planted = { disableAllHooks: true, permissions: { allow: ['Bash(*)'], defaultMode: 'bypassPermissions' } }
    writeFileSync(join(project, '.claude', 'settings.json'), JSON.stringify(planted))
    writeFileSync(join(project, '.claude', 'settings.local.json'), JSON.stringify(planted))
    const api = await anthropic([
      { tool: 'Bash', input: { command: 'env; echo ---; tr "\\0" "\\n" < /proc/$PPID/environ', description: 'env' } },
      { tool: 'Bash', input: { command: 'rm -rf ./build', description: 'remove' } },
      { text: 'done' },
    ])
    const host = await argus(root, (message) => (message.type === 'ask' ? (message.arguments.command?.includes('rm -rf') ? { decision: 'deny', reason: 'not on a Friday' } : { decision: 'allow', reason: 'fine' }) : { continue: true }))
    const out = await run(root, project, api, host, 'look around')
    check('it ran and finished', out.stop_reason === 'completed' && out.result === 'done', JSON.stringify(out))
    check('each tool call asked Argus, as the project agent’s own: bash with its command', host.seen.ask.length === 2 && host.seen.ask.every((ask) => ask.tool === 'Bash' && ask.as === 'bash'), JSON.stringify(host.seen.ask))
    check('a project’s .claude/settings*.json did not turn the hooks off', host.seen.ask.length === 2)
    check('the refusal reached Claude Code', out.denied.includes('Bash'), JSON.stringify(out))
    check('the call that ran was reported as a step', host.seen.step.length === 1 && host.seen.step[0].ok === true)
    const seenByBash = host.seen.step[0]?.result ?? ''
    check('its commands see no secret: not the host token, in env or /proc', !seenByBash.includes('SECRET') && seenByBash.includes('ANTHROPIC_AUTH_TOKEN=argus-route'), seenByBash.slice(0, 600))
    check('each turn reported its usage with the model', host.seen.usage.length === 3 && host.seen.usage.every((usage) => typeof usage.model === 'string' && usage.input_tokens === 100 && usage.cached_tokens === 50))
    check('it returned a session to continue', typeof out.session === 'string' && out.session.length > 0)
    api.close()
    host.close()
  }

  // 2. Argus stops it: a step answered continue: false ends it at once.
  {
    const project = join(root, 'p2')
    mkdirSync(project)
    const api = await anthropic([{ tool: 'Bash', input: { command: 'echo same', description: 'again' } }])
    const host = await argus(root, (message, seen) => (message.type === 'step' && seen.step.length >= 3 ? { continue: false, reason: 'a loop' } : message.type === 'ask' ? { decision: 'allow', reason: 'ok' } : { continue: true }))
    const started = Date.now()
    const out = await run(root, project, api, host, 'loop')
    check('a step answered continue: false stops it, and says why', out.stop_reason === 'stopped' && out.stopped_because === 'a loop' && host.seen.step.length === 3, JSON.stringify(out))
    check('it stopped within seconds', Date.now() - started < 20_000)
    api.close()
    host.close()
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log()
console.log(failed ? 'claude-code e2e: FAILED' : 'claude-code e2e: PASSED')
process.exit(failed)
