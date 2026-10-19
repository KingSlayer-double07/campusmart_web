#!/usr/bin/env bash
# Local check of MAIL_TRANSPORT=console and TRUST_PROXY_HOPS on a production-mode API.
# Run from backend/ after `pnpm run build`. Uses campusmart_dev, port 4100, made-up keys.
set -u
S="$1"
API=http://localhost:4100/api
XFF='102.89.1.10, 76.76.21.21'   # visitor, then the frontend's proxy
start() { # $1 = hops, $2 = log
  (set -a; . ./.env; set +a
   unset MAIL_HOST MAIL_PORT MAIL_USER MAIL_PASS MAIL_FROM
   export NODE_ENV=production MAIL_TRANSPORT=console PORT=4100 PAYMENTS_ENABLED=false
   export CLOUDINARY_CLOUD_NAME=campusmart-dev CLOUDINARY_API_KEY=walk_local_only CLOUDINARY_API_SECRET=walk_local_only
   unset TRUST_PROXY_HOPS; [ -n "$1" ] && export TRUST_PROXY_HOPS="$1"
   nohup node dist/main > "$2" 2>&1 &)
  for _ in $(seq 1 60); do curl -sf "$API/health" >/dev/null && return 0; sleep 0.5; done
  echo "API did not start"; cat "$2"; exit 1
}
stop() { P="dist/ma""in"; pgrep -f "$P" | xargs -r kill; sleep 1; }
current_ip() { curl -s -b "$1" "$API/users/me/sessions" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=JSON.parse(d).data.find(x=>x.current);console.log(s?s.ipAddress:"(no current session) "+d)})'; }

EMAIL="staging-check-$(date +%s)@gmail.com"
echo "== Run 1: NODE_ENV=production, MAIL_TRANSPORT=console, no MAIL_* set, TRUST_PROXY_HOPS=2"
start 2 "$S/api-run1.log"
echo "-- Startup warnings:"; grep -o "MAIL_TRANSPORT=console.*" "$S/api-run1.log"
curl -s -o /dev/null -w "register: HTTP %{http_code}\n" -c "$S/jar1" -H 'content-type: application/json' -H "X-Forwarded-For: $XFF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Password123\",\"accountType\":\"BUYER\"}" "$API/auth/register"
sleep 0.5
echo "-- The email as printed in the log:"; grep -A6 "\[dev mail\] to=$EMAIL" "$S/api-run1.log" | sed 's/^/   /'
CODE=$(grep -A6 "\[dev mail\] to=$EMAIL" "$S/api-run1.log" | grep -oE '\b[0-9]{6}\b' | head -1)
curl -s -o /dev/null -w "verify-email with code from the log: HTTP %{http_code}\n" -b "$S/jar1" -c "$S/jar1" -H 'content-type: application/json' \
  -d "{\"code\":\"$CODE\"}" "$API/auth/verify-email"
echo "Sent X-Forwarded-For: $XFF -> sessions list shows: $(current_ip "$S/jar1")"
stop

echo; echo "== Run 2: the same, TRUST_PROXY_HOPS unset (default 1)"
start "" "$S/api-run2.log"
curl -s -o /dev/null -w "login: HTTP %{http_code}\n" -c "$S/jar2" -H 'content-type: application/json' -H "X-Forwarded-For: $XFF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Password123\"}" "$API/auth/login"
echo "Sent X-Forwarded-For: $XFF -> sessions list shows: $(current_ip "$S/jar2")"
stop
