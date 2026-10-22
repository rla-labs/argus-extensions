// The browser extension's smoke test: its MCP server over stdio, newline-delimited
// JSON-RPC, against a page this script serves on loopback (no proxy here).
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (message) => {
  console.error(`browser smoke: ${message}`)
  process.exit(1)
}

const page = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<!doctype html><title>Smoke page</title><h1>Hello from the smoke test</h1><button>Press</button>')
})
await new Promise((done) => page.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${page.address().port}/`

const server = spawn('node', [join(dir, 'node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--no-sandbox', '--executable-path', join(dir, 'chromium/chrome-headless-shell'), '--output-dir', '.', '--caps', 'pdf', '--config', join(dir, 'config.json')], { stdio: ['pipe', 'pipe', 'inherit'] })
const pending = new Map()
createInterface({ input: server.stdout }).on('line', (line) => {
  const message = JSON.parse(line)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
})
let next = 0
const rpc = (method, params) =>
  new Promise((done, reject) => {
    const id = ++next
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 60_000)
    pending.set(id, (message) => {
      clearTimeout(timer)
      if (message.error !== undefined) reject(new Error(`${method}: ${message.error.message}`))
      else done(message.result)
    })
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
const call = async (name, args = {}) => {
  const result = await rpc('tools/call', { name, arguments: args })
  const text = (result.content ?? []).map((block) => block.text ?? '').join('\n')
  if (result.isError === true) fail(`${name}: ${text.slice(0, 400)}`)
  return text
}

try {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } })
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  const names = (await rpc('tools/list', {})).tools.map((tool) => tool.name)
  // The names extension.yaml gives a rule: a Playwright MCP that renamed one would leave it unruled.
  for (const name of ['browser_navigate', 'browser_snapshot', 'browser_take_screenshot', 'browser_pdf_save', 'browser_console_messages', 'browser_network_requests', 'browser_network_request', 'browser_find', 'browser_wait_for', 'browser_evaluate', 'browser_run_code_unsafe', 'browser_file_upload']) {
    if (!names.includes(name)) fail(`the server has no ${name}`)
  }
  await call('browser_navigate', { url })
  if (!(await call('browser_snapshot')).includes('Hello from the smoke test')) fail('the snapshot does not show the page')
  await call('browser_take_screenshot', { filename: 'smoke.png' })
  await call('browser_pdf_save', { filename: 'smoke.pdf' })
  for (const file of ['smoke.png', 'smoke.pdf']) if (!existsSync(file) || statSync(file).size < 500) fail(`${file} was not written in the project's folder`)
  console.log(`browser smoke: ${names.length} tools; a page read, a screenshot and a PDF written`)
} finally {
  server.kill()
  page.close()
}
