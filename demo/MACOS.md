# macOS Demo Commands

macOS のターミナルで Azurite Blob Upload Demo を実行するための手順です。

Docker Desktop、Git、curl、Node.js を使い、SAS URL の発行、Blob への直接 PUT、完了確認、サイズ不一致の失敗ケースまで順番に確認します。

## 事前準備

必要なもの:

- [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/)
- [Git](https://git-scm.com/install/mac.html)
- curl
- [Node.js](https://nodejs.org/ja/download/)

Azure アカウント、Azure CLI、Azure Storage Account は不要です。
このデモでは、Docker Desktop 上の Azurite が Blob Storage の代わりとしてローカルで動きます。

### 1. Mac のチップを確認

Docker Desktop は、Apple Silicon 用と Intel 用でインストーラーが異なります。
ターミナルで次を実行します。

```bash
uname -m
```

結果の見方:

- `arm64`: Apple Silicon（M1、M2、M3、M4 など）
- `x86_64`: Intel

自分のMacに合うDocker Desktopをインストールしてください。

### 2. Gitを確認

```bash
git --version
```

バージョンが表示されれば、そのまま使えます。
Gitが入っていない場合、次のコマンドでXcode Command Line Toolsを導入できます。

```bash
xcode-select --install
```

Homebrewを利用している場合は、次の方法でも導入できます。

```bash
brew install git
```

### 3. curlとNode.jsを確認

```bash
curl --version
node --version
```

macOSには通常curlが入っています。
Node.jsが入っていない場合は、公式インストーラーを使うか、Homebrewで導入します。

```bash
brew install node
```

Node.jsは、APIレスポンスのJSONから `uploadUrl` と `attachmentId` を取り出すために使います。
Dockerコンテナ内ではなく、Mac側のターミナルで実行するため、ローカルへの導入が必要です。

### 4. Docker Desktopを起動して確認

Docker Desktopを起動します。ターミナルから起動する場合:

```bash
open -a Docker
```

初回起動時は、画面の案内に従って設定と権限の確認を完了してください。
Docker Desktopが起動したら、次を実行します。

```bash
docker --version
docker compose version
```

両方のバージョンが表示されれば準備完了です。

## リポジトリを取得

作業用ディレクトリを作り、リポジトリ内の `demo` ディレクトリまで移動します。

```bash
cd ~
mkdir -p 20260728-dx-dojo
cd 20260728-dx-dojo

git clone https://github.com/horinat/azurite-blob-upload-demo.git
cd azurite-blob-upload-demo/demo
```

現在地を確認します。

```bash
pwd
```

次のように、末尾が `azurite-blob-upload-demo/demo` になっていれば問題ありません。

```text
/Users/ユーザー名/20260728-dx-dojo/azurite-blob-upload-demo/demo
```

すでにリポジトリを取得済みの場合は、再度cloneせずに移動して更新します。

```bash
cd ~/20260728-dx-dojo/azurite-blob-upload-demo
git pull
cd demo
```

## Demo 1: Azuriteを起動

ターミナル1で、リポジトリ内の `demo` ディレクトリから実行します。

```bash
docker compose up azurite azurite-init
```

初回はDocker imageの取得とlocal APIのビルドが行われるため、ログが多く表示されます。
次のログが表示されたら準備完了です。

```text
Local API listening on http://localhost:3000
```

このターミナルは、起動ログを表示するため開いたままにします。

別のターミナル2を開き、疎通確認します。

```bash
cd ~/20260728-dx-dojo/azurite-blob-upload-demo/demo
curl -sS http://localhost:3000/health
```

期待する結果:

```json
{"ok":true}
```

## Demo 2: SAS URLを発行

ターミナル2で実行します。

```bash
RESP=$(curl -sS -X POST http://localhost:3000/api/attachments/prepare \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "hello.txt",
    "fileSize": 12,
    "contentType": "text/plain"
  }')
```

レスポンスを確認します。

```bash
echo "$RESP"
```

レスポンスから、次の手順で使う値を変数に入れます。

```bash
UPLOAD_URL=$(node -e 'console.log(JSON.parse(process.argv[1]).uploadUrl)' "$RESP")
ATTACHMENT_ID=$(node -e 'console.log(JSON.parse(process.argv[1]).attachmentId)' "$RESP")
```

確認:

```bash
echo "$UPLOAD_URL"
echo "$ATTACHMENT_ID"
```

`UPLOAD_URL` は `http://127.0.0.1:10000/...` から始まります。
つまり、アップロード先は `localhost:3000` のlocal APIではなく、AzuriteのBlobエンドポイントです。

## Demo 3: Blobへ直接PUT

12バイトのテキストファイルを作成します。

```bash
printf "hello azure\n" > /tmp/hello.txt
```

ファイルサイズを確認します。

```bash
stat -f%z /tmp/hello.txt
```

`12` と表示されることを確認して、SAS URLへ直接PUTします。

```bash
curl -i -X PUT "$UPLOAD_URL" \
  -H "x-ms-blob-type: BlockBlob" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/hello.txt
```

期待する結果:

```text
HTTP/1.1 201 Created
```

`201 Created` は、Blobの作成に成功したことを示します。
このアップロードでは、ファイル本体はlocal APIを経由していません。

## Demo 4: 完了確認

local APIへアップロード完了を通知します。

```bash
curl -sS -X POST \
  "http://localhost:3000/api/attachments/$ATTACHMENT_ID/complete"
```

期待する結果:

```json
{"status":"completed","fileSize":12,"contentType":"text/plain"}
```

local APIがAzurite上のBlob propertiesを取得し、申告したサイズとContent-Typeに一致することを確認して `completed` にしています。

## Demo 5: 失敗ケース

わざと `fileSize: 999` と申告し、実際には6バイトのファイルをアップロードします。

### 1. 不正なサイズでSAS URLを発行

```bash
RESP=$(curl -sS -X POST http://localhost:3000/api/attachments/prepare \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "wrong-size.txt",
    "fileSize": 999,
    "contentType": "text/plain"
  }')
```

```bash
echo "$RESP"
```

新しく発行された値を変数に入れます。

```bash
UPLOAD_URL=$(node -e 'console.log(JSON.parse(process.argv[1]).uploadUrl)' "$RESP")
ATTACHMENT_ID=$(node -e 'console.log(JSON.parse(process.argv[1]).attachmentId)' "$RESP")
```

### 2. 6バイトのファイルをアップロード

```bash
printf "small\n" > /tmp/small.txt
stat -f%z /tmp/small.txt
```

`6` と表示されることを確認します。

```bash
curl -i -X PUT "$UPLOAD_URL" \
  -H "x-ms-blob-type: BlockBlob" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/small.txt
```

ここでもBlobの作成自体は成功するため、`HTTP/1.1 201 Created` が返ります。

### 3. サイズ不一致を確認

```bash
curl -i -X POST \
  "http://localhost:3000/api/attachments/$ATTACHMENT_ID/complete"
```

期待するHTTPステータス:

```text
HTTP/1.1 422 Unprocessable Entity
```

期待するレスポンス本文:

```json
{"status":"failed","reason":"file size mismatch","expectedSize":999,"actualSize":6}
```

これは想定どおりの失敗です。
SAS URLによる直接アップロード後に、local APIがBlob propertiesを確認し、申告サイズとの差異を検出できることを確認しています。

通常のcurlはHTTP 4xxでもレスポンスを表示します。
`--fail` または `-f` を付けた場合は、HTTP 422をエラー終了として扱う点に注意してください。

## demo.shで一括実行

1つずつコマンドを実行せず、一括で動作確認することもできます。

Docker Composeをバックグラウンドで起動:

```bash
./demo.sh start
```

正常系:

```bash
./demo.sh success
```

失敗系:

```bash
./demo.sh fail
```

疎通確認:

```bash
./demo.sh health
```

`permission denied: ./demo.sh` と表示された場合は、実行権限を付けます。

```bash
chmod +x demo.sh
```

## 片付け

コンテナを停止します。Blobデータを残したい場合はこちらです。

```bash
docker compose stop
```

コンテナ、ネットワーク、Blobデータ用Volumeを削除して初期化する場合:

```bash
docker compose down -v
```

`demo.sh` を使う場合は、次でも同じ操作ができます。

```bash
./demo.sh stop
./demo.sh reset
```

## よくある問題

### `Cannot connect to the Docker daemon`

Docker Desktopが起動していません。

```bash
open -a Docker
```

起動後に確認します。

```bash
docker compose version
```

### `command not found: node`

Mac側にNode.jsが入っていません。
公式インストーラーまたはHomebrewで導入し、ターミナルを開き直します。

```bash
brew install node
node --version
```

### `permission denied: ./demo.sh`

実行権限を付けます。

```bash
chmod +x demo.sh
```

### ポート3000または10000が使用中

使用しているプロセスを確認します。

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:10000 -sTCP:LISTEN
```

別のデモ用コンテナが残っている場合は、該当するディレクトリで次を実行して停止してください。

```bash
docker compose down
```

### `destination path 'azurite-blob-upload-demo' already exists`

すでにリポジトリをclone済みです。再度cloneせず、既存のディレクトリへ移動します。

```bash
cd ~/20260728-dx-dojo/azurite-blob-upload-demo
git pull
cd demo
```

## 注意

SAS URLには `sig=...` という署名が含まれます。
本番のSAS URLは秘密情報として扱い、ログ、スクリーンショット、公開資料、SNSなどへそのまま掲載しないでください。
