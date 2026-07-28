# Windows PowerShell Demo Commands

Windows PowerShell で Azurite Blob Upload Demo を実行するための手順です。

macOS / Linux / WSL の bash ではなく、Windows PowerShell を使う場合はこちらを使ってください。
Ubuntu などの作業用 WSL ディストリビューションや、ローカルの Node.js は不要です。

## 事前準備

必要なもの:

- [Git for Windows](https://git-scm.com/install/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Windows PowerShell

Git for Windows は WinGet でも導入できます。

```powershell
winget install --id Git.Git -e --source winget
```

インストール後は PowerShell を開き直して確認します。

```powershell
git --version
docker compose version
```

## リポジトリを取得

作業用ディレクトリを作り、リポジトリ内の `demo` ディレクトリまで移動します。

```powershell
cd $HOME
mkdir 20260728-dx-dojo -Force
cd 20260728-dx-dojo

git clone https://github.com/horinat/azurite-blob-upload-demo.git
cd azurite-blob-upload-demo\demo
```

すでにリポジトリを取得済みの場合は、そのリポジトリ内の `demo` ディレクトリへ移動してください。

## Demo 1: Azurite を起動

ターミナル1で実行します。

```powershell
docker compose up azurite azurite-init
```

このターミナルは起動ログ表示用なので、開いたままにします。
ログに `Local API listening on http://localhost:3000` が表示されたら準備完了です。

別ターミナルを開き、疎通確認します。

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

ターミナル2で、リポジトリ内の `demo` ディレクトリへ移動してから実行します。

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

ファイルサイズが12バイトであることを確認します。

```powershell
(Get-Item "$env:TEMP\hello.txt").Length
```

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Method Put `
  -Uri $uploadUrl `
  -Headers @{
    "x-ms-blob-type" = "BlockBlob"
    "Content-Type" = "text/plain"
  } `
  -InFile "$env:TEMP\hello.txt"
```

`-UseBasicParsing` は、Windows PowerShell がレスポンスをWebページとして解析する際に表示するセキュリティ警告を回避するために指定しています。

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

わざと `fileSize: 999` と申告して、実際には6バイトのファイルをアップロードします。

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
(Get-Item "$env:TEMP\small.txt").Length
```

`6` と表示されることを確認してアップロードします。

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Method Put `
  -Uri $uploadUrl `
  -Headers @{
    "x-ms-blob-type" = "BlockBlob"
    "Content-Type" = "text/plain"
  } `
  -InFile "$env:TEMP\small.txt"
```

サイズ不一致時、APIは HTTP 422 を返します。
そのため `Invoke-RestMethod` をそのまま実行すると、Windows PowerShell では `WebCmdletWebResponseException` として表示されます。これは想定どおりの結果です。

レスポンス本文を見やすく表示するには、`try` / `catch` を使います。

```powershell
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:3000/api/attachments/$attachmentId/complete"
} catch {
  $_.ErrorDetails.Message | ConvertFrom-Json
}
```

期待する結果:

```powershell
status       : failed
reason       : file size mismatch
expectedSize : 999
actualSize   : 6
```

この失敗により、SAS URLでの直接アップロード後に、APIがBlob propertiesを確認して申告サイズとの差異を検出できることを確認できます。

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
