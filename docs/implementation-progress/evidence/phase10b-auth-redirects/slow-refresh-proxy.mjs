// Sits where the app expects the API (:4000) and forwards to the real API (:4001), holding each
// POST /api/auth/refresh response for DELAY_MS after the API has answered. The token is already rotated on
// the server, but the browser only gets the new cookie later, as on a slow phone -> Vercel -> Render trip.
// Run: DELAY_MS=400 node slow-refresh-proxy.mjs
import http from 'node:http';
const DELAY = Number(process.env.DELAY_MS ?? 400);
http
  .createServer((req, res) => {
    const upstream = http.request(
      { host: '127.0.0.1', port: 4001, path: req.url, method: req.method, headers: req.headers },
      (up) => {
        const send = () => {
          res.writeHead(up.statusCode, up.headers);
          up.pipe(res);
        };
        if (req.url.startsWith('/api/auth/refresh')) setTimeout(send, DELAY);
        else send();
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(4000, () => console.log(`slow-refresh proxy on :4000 -> :4001, refresh +${DELAY} ms`));
