#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="${STATE_FILE:-.demo-state.json}"
API_BASE="${API_BASE:-http://localhost:3000}"
HELLO_FILE="${HELLO_FILE:-/tmp/hello.txt}"
SMALL_FILE="${SMALL_FILE:-/tmp/small.txt}"

usage() {
  cat <<'EOF'
Usage:
  ./demo.sh start      # Azurite + local API を起動
  ./demo.sh health     # local API の疎通確認
  ./demo.sh prepare    # SAS URL を発行して .demo-state.json に保存
  ./demo.sh put        # hello.txt を SAS URL で Blob へ直接 PUT
  ./demo.sh complete   # Blob properties を確認して completed にする
  ./demo.sh success    # prepare -> put -> complete をまとめて実行
  ./demo.sh fail       # サイズ不一致の失敗ケースを実行
  ./demo.sh stop       # コンテナを停止
  ./demo.sh reset      # コンテナとVolumeを削除して初期化
EOF
}

require_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "State file not found: $STATE_FILE"
    echo "Run ./demo.sh prepare first."
    exit 1
  fi
}

json_get() {
  node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))[process.argv[2]])" "$STATE_FILE" "$1"
}

start() {
  docker compose up -d azurite azurite-init
  echo "Waiting for local API..."
  for _ in $(seq 1 30); do
    if curl -fsS "$API_BASE/health" >/dev/null 2>&1; then
      echo "OK: $API_BASE/health"
      return
    fi
    sleep 1
  done
  echo "local API did not become ready."
  docker compose ps
  exit 1
}

health() {
  curl -fsS "$API_BASE/health"
  echo
}

prepare() {
  curl -fsS -X POST "$API_BASE/api/attachments/prepare" \
    -H "Content-Type: application/json" \
    -d '{
      "fileName": "hello.txt",
      "fileSize": 12,
      "contentType": "text/plain"
    }' | tee "$STATE_FILE"
  echo
  echo "Saved response to $STATE_FILE"
}

put_blob() {
  require_state
  local upload_url
  upload_url="$(json_get uploadUrl)"

  printf "hello azure\n" > "$HELLO_FILE"
  curl -fsS -X PUT "$upload_url" \
    -H "x-ms-blob-type: BlockBlob" \
    -H "Content-Type: text/plain" \
    --data-binary @"$HELLO_FILE"
  echo "PUT completed: $HELLO_FILE"
}

complete() {
  require_state
  local attachment_id
  attachment_id="$(json_get attachmentId)"

  curl -fsS -X POST "$API_BASE/api/attachments/$attachment_id/complete"
  echo
}

success() {
  prepare
  put_blob
  complete
}

fail() {
  local response upload_url attachment_id
  response="$(curl -fsS -X POST "$API_BASE/api/attachments/prepare" \
    -H "Content-Type: application/json" \
    -d '{
      "fileName": "wrong-size.txt",
      "fileSize": 999,
      "contentType": "text/plain"
    }')"
  echo "$response" | tee "$STATE_FILE"
  echo

  upload_url="$(node -e "console.log(JSON.parse(process.argv[1]).uploadUrl)" "$response")"
  attachment_id="$(node -e "console.log(JSON.parse(process.argv[1]).attachmentId)" "$response")"

  printf "small\n" > "$SMALL_FILE"
  curl -fsS -X PUT "$upload_url" \
    -H "x-ms-blob-type: BlockBlob" \
    -H "Content-Type: text/plain" \
    --data-binary @"$SMALL_FILE"
  echo "PUT completed: $SMALL_FILE"

  curl -sS -X POST "$API_BASE/api/attachments/$attachment_id/complete"
  echo
}

case "${1:-}" in
  start) start ;;
  health) health ;;
  prepare) prepare ;;
  put) put_blob ;;
  complete) complete ;;
  success) success ;;
  fail) fail ;;
  stop) docker compose stop ;;
  reset) docker compose down -v ;;
  ""|-h|--help|help) usage ;;
  *)
    echo "Unknown command: $1"
    usage
    exit 1
    ;;
esac
