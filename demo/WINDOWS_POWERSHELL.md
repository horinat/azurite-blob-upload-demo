# Windows PowerShell Demo Commands

Windows PowerShell で Azurite Blob Upload Demo を実行するための手順です。

macOS / Linux / WSL の bash ではなく、Windows PowerShell を使う場合はこちらを使ってください。

## Demo 1: Azurite を起動

ターミナル1で実行します。

```powershell
cd demo
docker compose up azurite azurite-init
```

このターミナルは起動ログ表示用なので、開いたままにします。

別ターミナルで疎通確認します。

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

期待する結果:

```powershell
ok
--
True
```

## Demo 2: SAS URL を発行

ターミナル2で実行します。

```powershell
cd demo
```

```powershell
$resp = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/attachments/prepare" `
  -ContentType "application/json" `
  -Body '{
    "fileName": "hello.txt",
    "fileSize": 12,
    "contentType": "text/plain"
  }'
```

```powershell
$resp
```

次のデモで使う値を変数に入れます。

```powershell
$uploadUrl = $resp.uploadUrl
$attachmentId = $resp.attachmentId
```

確認:

```powershell
$uploadUrl
$attachmentId
```

## Demo 3: Blob へ直接 PUT

PowerShell の `Set-Content` は環境によって文字コードや改行の扱いが変わることがあります。
このデモではサイズ確認をするため、UTF-8 BOMなしで明示的にファイルを書きます。

```powershell
[System.IO.File]::WriteAllText(
  "$env:TEMP\hello.txt",
  "hello azure`n",
  [System.Text.UTF8Encoding]::new($false)
)
```

```powershell
Invoke-WebRequest `
  -Method Put `
  -Uri $uploadUrl `
  -Headers @{
    "x-ms-blob-type" = "BlockBlob"
    "Content-Type" = "text/plain"
  } `
  -InFile "$env:TEMP\hello.txt"
```

`$uploadUrl` は `http://127.0.0.1:10000/...` から始まります。
つまり、PUT 先は `localhost:3000` の API ではなく、Azurite の Blob エンドポイントです。

## Demo 4: 完了確認

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/attachments/$attachmentId/complete"
```

期待する結果:

```powershell
status    fileSize contentType
------    -------- -----------
completed       12 text/plain
```

## Demo 5: 失敗ケース

わざと `fileSize: 999` と申告して、実際には小さいファイルをアップロードします。

```powershell
$resp = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/attachments/prepare" `
  -ContentType "application/json" `
  -Body '{
    "fileName": "wrong-size.txt",
    "fileSize": 999,
    "contentType": "text/plain"
  }'
```

```powershell
$resp
```

```powershell
$uploadUrl = $resp.uploadUrl
$attachmentId = $resp.attachmentId
```

```powershell
[System.IO.File]::WriteAllText(
  "$env:TEMP\small.txt",
  "small`n",
  [System.Text.UTF8Encoding]::new($false)
)
```

```powershell
Invoke-WebRequest `
  -Method Put `
  -Uri $uploadUrl `
  -Headers @{
    "x-ms-blob-type" = "BlockBlob"
    "Content-Type" = "text/plain"
  } `
  -InFile "$env:TEMP\small.txt"
```

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/attachments/$attachmentId/complete"
```

期待する結果:

```powershell
status reason             expectedSize actualSize
------ ------             ------------ ----------
failed file size mismatch          999          6
```

## 片付け

コンテナを停止:

```powershell
docker compose stop
```

データも含めて初期化:

```powershell
docker compose down -v
```

## 注意

SAS URL には `sig=...` という署名が含まれます。本番の SAS URL は秘密情報として扱い、ログや公開資料にそのまま出さないでください。
