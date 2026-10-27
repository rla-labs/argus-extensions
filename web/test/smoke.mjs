// The web extension's smoke test: Obscura's MCP server over stdio, newline-delimited
// JSON-RPC, against pages this script serves on loopback. Loopback is a private address,
// so the first server is started with --allow-private-network (here only); the second,
// as extension.yaml starts it, must refuse it.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (message) => {
  console.error(`web smoke: ${message}`)
  process.exit(1)
}

let sent = ''
const page = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    if (req.method === 'POST') sent = body
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      req.method === 'POST'
        ? `<!doctype html><title>Thanks</title><p>Received ${body.length} bytes</p>`
        : '<!doctype html><title>Smoke page</title><div id="app"></div>' +
            '<script>document.getElementById("app").innerHTML = "<h1>Built by JavaScript</h1><a href=\\"/next\\">Next page</a>"</script>' +
            '<form method="post" action="/send"><input name="who"><button type="submit">Send</button></form>',
    )
  })
})
await new Promise((done) => page.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${page.address().port}/`

function server(args) {
  const child = spawn(join(dir, 'bin', 'obscura'), ['mcp', ...args], { stdio: ['pipe', 'pipe', 'ignore'] })
  const pending = new Map()
  createInterface({ input: child.stdout }).on('line', (line) => {
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
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  const call = async (name, args = {}) => {
    const result = await rpc('tools/call', { name, arguments: args })
    return { text: (result.content ?? []).map((block) => block.text ?? '').join('\n'), error: result.isError === true }
  }
  const start = async () => {
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  }
  return { rpc, call, start, kill: () => child.kill() }
}

const local = server(['--allow-private-network'])
const confined = server([])
try {
  await local.start()
  // Every tool extension.yaml gives a rule: one Obscura renamed would be left unruled.
  const names = (await local.rpc('tools/list', {})).tools.map((tool) => tool.name)
  const ruled = [...readFileSync(join(dir, 'extension.yaml'), 'utf8').matchAll(/^ {6}(browser_\w+):/gm)].map((match) => match[1])
  for (const name of ruled) if (!names.includes(name)) fail(`the server has no ${name}`)
  await local.call('browser_navigate', { url })
  const markdown = (await local.call('browser_markdown')).text
  if (!markdown.includes('Built by JavaScript') || !markdown.includes('Next page')) fail(`the Markdown does not show the page its script built: ${markdown.slice(0, 300)}`)
  await local.call('browser_fill', { selector: 'input[name=who]', value: 'Argus smoke' })
  await local.call('browser_click', { selector: 'button' })
  if (!sent.includes('who=Argus+smoke')) fail(`the form was not sent with its value (got "${sent}")`)

  await confined.start()
  const refused = await confined.call('browser_navigate', { url })
  if (!refused.error || !/private|internal/i.test(refused.text)) fail(`a private address was not refused: ${refused.text.slice(0, 300)}`)
  console.log(`web smoke: ${names.length} tools, ${ruled.length} ruled; a page built by JavaScript read, a form sent, a private address refused`)
} finally {
  local.kill()
  confined.kill()
  page.close()
}
