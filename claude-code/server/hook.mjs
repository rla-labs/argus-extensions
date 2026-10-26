// Argus extension claude-code: the hook Claude Code runs before and after each tool call.
// It hands the event to this extension's server (ARGUS_HOOK_SOCKET), which asks Argus.
// Before a call it answers allow or deny explicitly; anything that goes wrong is a
// refusal (exit 2): Claude Code runs in dontAsk mode, so nothing runs that Argus did not allow.
import { connect } from 'node:net'

const deny = (reason) => {
  process.stderr.write(`Argus: ${reason}\n`)
  process.exit(2)
}

let input = ''
for await (const chunk of process.stdin) input += chunk
let event
try {
  event = JSON.parse(input)
} catch {
  deny('the hook could not read its event')
}
const path = process.env.ARGUS_HOOK_SOCKET
if (path === undefined) deny('no channel to Argus')

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

if (event.hook_event_name !== 'PreToolUse') process.exit(0)
if (answer === undefined) deny('Argus did not answer')
if (answer.decision === 'allow') {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: `Argus: ${answer.reason}` } }))
  process.exit(0)
}
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Argus: ${answer.reason ?? 'not allowed'}` } }))
process.exit(0)
