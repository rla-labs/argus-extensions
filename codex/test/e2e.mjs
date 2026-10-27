// The codex extension end to end, with no account: the real Codex (installed by fetch.sh)
// against a fake OpenAI Responses API, and this extension's server against a fake Argus
// host channel. Run by test/smoke.sh (confined, in a project's folder) and by CI.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

/** A fake OpenAI Responses API: each turn from a script (a command, text, or a refusal). */
async function openai(script) {
  let turn = 0
  const requests = []
  const server = createHttp((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}')
      requests.push({ auth: req.headers.authorization, model: parsed.model })
      const step = script[Math.min(turn++, script.length - 1)]
      if (step.refuse !== undefined) return res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: `Argus: ${step.refuse}` } }))
      const item =
        step.cmd !== undefined
          ? { type: 'function_call', id: `fc_${turn}`, call_id: `call_${turn}`, name: 'exec_command', arguments: JSON.stringify({ cmd: step.cmd }), status: 'completed' }
          : { type: 'message', id: `msg_${turn}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: step.text, annotations: [] }] }
      const usage = { input_tokens: 100, input_tokens_details: { cached_tokens: 50 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 120 }
      const events = [
        ['response.created', { type: 'response.created', response: { id: `resp_${turn}`, status: 'in_progress', model: parsed.model, output: [] } }],
        ['response.output_item.done', { type: 'response.output_item.done', output_index: 0, item }],
        ['response.completed', { type: 'response.completed', response: { id: `resp_${turn}`, status: 'completed', model: parsed.model, output: [item], usage } }],
      ]
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/v1`, requests, close: () => server.close() }
}

/** A fake Argus host channel: hello, then ask and step as `decide` says (or hang up). */
let sockets = 0
async function argus(root, decide) {
  const seen = { ask: [], step: [] }
  const path = join(root, `host${(sockets += 1)}.sock`)
  const server = createNet((socket) => {
    createInterface({ input: socket }).on('line', (line) => {
      const message = JSON.parse(line)
      if (message.type === 'hello') {
        const answer = message.token === HOST_TOKEN ? { ok: true, project: 'site', server: 'codex', host: ['approvals', 'steps'], limits: { max_turns: 20, max_minutes: 5 }, model: 'gpt-test', approval_timeout_s: 60 } : { ok: false, error: { code: 'HOST_MESSAGE_REFUSED', message: 'token' } }
        return socket.write(`${JSON.stringify({ ...answer, id: message.id })}\n`)
      }
      seen[message.type]?.push(message)
      const answer = decide(message, seen)
      if (answer === 'hang-up') return socket.destroy()
      socket.write(`${JSON.stringify({ ok: true, ...answer, id: message.id })}\n`)
    })
  })
  await new Promise((resolve) => server.listen(path, resolve))
  return { path, seen, close: () => server.close() }
}

async function run(root, project, api, host, task) {
  const home = join(root, `home-${sockets}`)
  mkdirSync(home, { recursive: true })
  const child = spawn(process.execPath, [SERVER], {
    cwd: project,
    env: { PATH: process.env.PATH, HOME: home, TMPDIR: home, ARGUS_HOST_SOCKET: host.path, ARGUS_HOST_TOKEN: HOST_TOKEN, ARGUS_OPENAI_BASE_URL: api.url, ...(process.env.ARGUS_CODEX_BIN === undefined ? {} : { ARGUS_CODEX_BIN: process.env.ARGUS_CODEX_BIN }) },
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

const allowUnlessRm = (message) => (message.type === 'ask' ? (message.arguments.command?.includes('rm -rf') ? { decision: 'deny', reason: 'not on a Friday' } : { decision: 'allow', reason: 'fine' }) : { continue: true })
const root = mkdtempSync(join(process.env.E2E_TMP ?? tmpdir(), 'cx-e2e-'))
try {
  // 1. Every command asks Argus; a refusal is respected; the project's own .codex cannot
  //    change that; nothing secret is visible to its commands; the model is Argus's choice.
  {
    const project = join(root, 'p1')
    mkdirSync(join(project, '.codex'), { recursive: true })
    writeFileSync(join(project, '.codex', 'config.toml'), '[features]\nhooks = false\n')
    const api = await openai([
      { cmd: 'env; echo ---; tr "\\0" "\\n" < /proc/$PPID/environ; echo ---; cat "$CODEX_HOME/config.toml"' },
      { cmd: 'rm -rf ./build' },
      { text: 'done' },
    ])
    const host = await argus(root, allowUnlessRm)
    const out = await run(root, project, api, host, 'look around')
    check('it ran and finished', out.stop_reason === 'completed' && out.result === 'done', JSON.stringify(out))
    check('each command asked Argus, as the project agent’s own (bash)', host.seen.ask.length === 2 && host.seen.ask.every((ask) => ask.tool === 'Bash' && ask.as === 'bash'), JSON.stringify(host.seen.ask))
    check('a project’s .codex/config.toml did not turn the hooks off', host.seen.ask.length === 2)
    check('the command that ran was reported as a step, the refused one was not', host.seen.step.length === 1)
    const seenByBash = host.seen.step[0]?.result ?? ''
    check('its commands see no secret: not the host token, in env, /proc or its config', seenByBash.length > 0 && !seenByBash.includes('SECRET') && seenByBash.includes('argus-route'), seenByBash.slice(0, 600))
    check('it asked for the model Argus chose (delegate.codex_model)', api.requests.every((request) => request.model === 'gpt-test'), JSON.stringify(api.requests))
    check('it returned a session to continue', typeof out.session === 'string' && out.session.length > 0)
    api.close()
    host.close()
  }

  // 2. Fail closed: Argus goes away while it is asked; the command must not run.
  {
    const project = join(root, 'p2')
    mkdirSync(project)
    const api = await openai([{ cmd: 'touch ran-without-argus' }, { text: 'done' }])
    const host = await argus(root, (message) => (message.type === 'ask' ? 'hang-up' : { continue: true }))
    await run(root, project, api, host, 'touch')
    check('when Argus does not answer, the command is refused, not run', !existsSync(join(project, 'ran-without-argus')))
    api.close()
    host.close()
  }

  // 3. Argus stops it: a step answered continue: false ends it at once.
  {
    const project = join(root, 'p3')
    mkdirSync(project)
    const api = await openai([{ cmd: 'echo same' }])
    const host = await argus(root, (message, seen) => (message.type === 'step' && seen.step.length >= 3 ? { continue: false, reason: 'a loop' } : message.type === 'ask' ? { decision: 'allow', reason: 'ok' } : { continue: true }))
    const started = Date.now()
    const out = await run(root, project, api, host, 'loop')
    check('a step answered continue: false stops it, and says why', out.stop_reason === 'stopped' && out.stopped_because === 'a loop' && host.seen.step.length === 3, JSON.stringify(out))
    check('it stopped within seconds', Date.now() - started < 30_000)
    api.close()
    host.close()
  }

  // 4. A request Argus's route refuses (a budget, the day's turns) ends it, and says why.
  {
    const project = join(root, 'p4')
    mkdirSync(project)
    const api = await openai([{ refuse: 'the project budget is exhausted' }])
    const host = await argus(root, allowUnlessRm)
    const out = await run(root, project, api, host, 'anything')
    check('a refusal by Argus’s route ends it, with the reason', out.stop_reason === 'refused' && /budget is exhausted/.test(out.refused_because ?? ''), JSON.stringify(out))
    api.close()
    host.close()
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log()
console.log(failed ? 'codex e2e: FAILED' : 'codex e2e: PASSED')
process.exit(failed)
