// Argus extension codex: hands Codex's hook event to this extension's server
// (ARGUS_HOOK_SOCKET), which asks Argus. Before a call it answers allow or deny explicitly,
// within ARGUS_HOOK_DEADLINE_S, which is shorter than Codex's own timeout for the hook;
// anything else is a refusal (exit 2), never silence.
import { connect } from 'node:net'

const deny = (reason) => {
  process.stderr.write(`Argus: ${reason}\n`)
  process.exit(2)
}
setTimeout(() => deny('no decision in time; not allowed'), Number(process.env.ARGUS_HOOK_DEADLINE_S ?? 60) * 1000).unref()

let input = ''
for await (const chunk of process.stdin) input += chunk
let event
try {
  event = JSON.parse(input)
} catch {
  deny('the hook could not read its event')
}
const before = event.hook_event_name === 'PreToolUse'
const path = process.env.ARGUS_HOOK_SOCKET
if (path === undefined) before ? deny('no channel to Argus') : process.exit(0)

const answer = await new Promise((resolve) => {
  const socket = connect(path)
  let text = ''
  socket.on('connect', () => socket.write(`${JSON.stringify(event)}\n`))
  socket.on('data', (chunk) => (text += chunk))
  socket.on('end', () => {
    try {
      resolve(JSON.parse(text))
    } catch {
      resolve(undefined)
    }
  })
  socket.on('error', () => resolve(undefined))
})

if (!before) process.exit(0)
if (answer?.decision === 'allow') {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: `Argus: ${answer.reason}` } }))
  process.exit(0)
}
deny(answer?.reason ?? 'Argus did not answer; not allowed')
