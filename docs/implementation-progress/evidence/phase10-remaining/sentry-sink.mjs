// Phase 10 Sentry check only: stands in for Sentry's ingest on 127.0.0.1:9999 and stores every
// envelope it receives, so the check sees exactly what the API would send. Nothing reaches Sentry.
// Usage: node sentry-sink.mjs <output file>
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const out = process.argv[2];
createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    appendFileSync(out, `--- ${req.method} ${req.url}\n${Buffer.concat(chunks).toString()}\n`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
}).listen(9999, '127.0.0.1');
