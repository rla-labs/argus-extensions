"""Web spike (0.8.2): Obscura's MCP server fills and submits a form (httpbin.org/forms/post)
and reads the answer; then a proxy check: every request of `fetch --proxy` goes through
a logging proxy. Usage: python3 mcp_check.py <obscura> <results dir>"""
import json
import os
import select
import socket
import subprocess
import sys
import threading
import time

OBSCURA, OUT = sys.argv[1:3]
report = []


def say(line):
    print(line, flush=True)
    report.append(line)


server = subprocess.Popen([OBSCURA, 'mcp'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
counter = [0]


def call(method, params=None, timeout=60):
    counter[0] += 1
    ident = counter[0]
    server.stdin.write((json.dumps({'jsonrpc': '2.0', 'id': ident, 'method': method, 'params': params or {}}) + '\n').encode())
    server.stdin.flush()
    end = time.time() + timeout
    while time.time() < end:
        ready, _, _ = select.select([server.stdout], [], [], 1)
        if ready:
            line = server.stdout.readline()
            if not line:
                return {'error': 'closed'}
            message = json.loads(line)
            if message.get('id') == ident:
                return message
    return {'error': 'timeout'}


def tool(name, arguments):
    answer = call('tools/call', {'name': name, 'arguments': arguments})
    content = answer.get('result', {}).get('content', [])
    text = ' '.join(part.get('text', '') for part in content if part.get('type') == 'text')
    return text or json.dumps(answer)[:500]


init = call('initialize', {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'spike', 'version': '1'}})
say(f"initialize: {json.dumps(init.get('result', init))[:300]}")
server.stdin.write((json.dumps({'jsonrpc': '2.0', 'method': 'notifications/initialized'}) + '\n').encode())
server.stdin.flush()
tools = call('tools/list')
say('tools: ' + ', '.join(t['name'] for t in tools.get('result', {}).get('tools', [])))
say('navigate: ' + tool('browser_navigate', {'url': 'https://httpbin.org/forms/post'})[:300])
say('fill: ' + tool('browser_fill', {'selector': 'input[name=custname]', 'value': 'Argus Spike'})[:200])
say('click: ' + tool('browser_click', {'selector': 'button'})[:200])
time.sleep(3)
snapshot = tool('browser_snapshot', {})
say('after submit, the answer has the name: ' + str('Argus Spike' in snapshot))
say('snapshot sample: ' + snapshot[:600].replace('\n', ' '))
server.kill()

# A logging HTTP CONNECT proxy: does every request go through it? Obscura runs as a user
# (RUN_AS) whose direct connections, other than to loopback, the firewall rejects.
AS = os.environ.get('RUN_AS', '').split()
hosts = []


def handle(client):
    try:
        head = b''
        while b'\r\n\r\n' not in head:
            chunk = client.recv(4096)
            if not chunk:
                return
            head += chunk
        first = head.split(b'\r\n')[0].decode()
        hosts.append(first)
        method, target = first.split(' ')[:2]
        if method != 'CONNECT':
            client.sendall(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n')
            return
        host, port = target.rsplit(':', 1)
        upstream = socket.create_connection((host, int(port)), timeout=20)
        client.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
        pair = [client, upstream]
        while True:
            ready, _, _ = select.select(pair, [], [], 30)
            if not ready:
                return
            for sock in ready:
                data = sock.recv(65536)
                if not data:
                    return
                (upstream if sock is client else client).sendall(data)
    except Exception:
        pass
    finally:
        client.close()


listener = socket.socket()
listener.bind(('127.0.0.1', 0))
listener.listen(64)
port = listener.getsockname()[1]
threading.Thread(target=lambda: [threading.Thread(target=handle, args=(listener.accept()[0],), daemon=True).start() for _ in iter(int, 1)], daemon=True).start()
done = subprocess.run(AS + [OBSCURA, '--proxy', f'http://127.0.0.1:{port}', 'fetch', 'https://www.theverge.com/', '--dump', 'text', '--quiet'], capture_output=True, timeout=120)
say(f'proxy fetch: exit {done.returncode}, {len(done.stdout)} bytes; requests through the proxy: {len(hosts)}')
say('  ' + '\n  '.join(sorted(set(hosts))[:30]))
direct = subprocess.run(AS + [OBSCURA, 'fetch', 'https://www.theverge.com/', '--dump', 'text', '--quiet'], capture_output=True, timeout=120)
say(f'the same without the proxy, direct connections rejected: exit {direct.returncode}, {len(direct.stdout)} bytes (expect nothing)')
done = subprocess.run(AS + [OBSCURA, '--proxy', f'http://127.0.0.1:{port}', 'fetch', 'http://127.0.0.1:9/', '--dump', 'text', '--quiet'], capture_output=True, timeout=60)
say(f"private address refused by default: exit {done.returncode}, {done.stderr.decode(errors='replace').strip()[:200]}")
with open(os.path.join(OUT, 'mcp-and-proxy.txt'), 'w') as handle_out:
    handle_out.write('\n'.join(report) + '\n')
