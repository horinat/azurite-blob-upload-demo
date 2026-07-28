# Slide Demo Commands

スライドに合わせたデモ用コマンドです。

## Demo 1: Azurite を起動

```bash
cd demo
docker compose up azurite azurite-init
```

別ターミナルで疎通確認:

```bash
curl http://localhost:3000/health
```

発表中にログを流したくない場合:

```bash
./demo.sh start
```

## Demo 2: SAS URL を発行

```bash
./demo.sh prepare
```

返るもの:

```json
{
  "attachmentId": "att_xxx",
  "uploadUrl": "http://127.0.0.1:10000/...?...",
  "expiresAt": "..."
}
```

## Demo 3: Blob へ直接 PUT

```bash
./demo.sh put
```

中では次のことをしています。

```bash
printf "hello azure\n" > /tmp/hello.txt

curl -X PUT "$UPLOAD_URL" \
  -H "x-ms-blob-type: BlockBlob" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/hello.txt
```

## Demo 4: 完了確認

```bash
./demo.sh complete
```

成功時:

```json
{"status":"completed","fileSize":12,"contentType":"text/plain"}
```

## Demo 5: 失敗ケース

```bash
./demo.sh fail
```

期待する結果:

```json
{"status":"failed","reason":"file size mismatch",...}
```

## まとめて成功ケースを実行

```bash
./demo.sh success
```
