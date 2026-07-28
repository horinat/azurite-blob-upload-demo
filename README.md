# Azurite Blob Upload Demo Materials

AzuriteでAzure Blob Storageの直接アップロードを試すためのデモ資料です。

## Files

- `demo/`
  - Azurite とデモ用 local API を Docker Compose で起動し、SAS URL 発行、直接 PUT、完了確認、失敗ケースを手元で試せるデモ一式です。
- `outputs/azurite-blob-upload-lt-native.pptx`
  - 発表・デモ用のPowerPoint資料です。
- `outputs/azurite-architecture.png`
  - サービス構成図の画像です。
- `outputs/azurite-architecture.svg`
  - サービス構成図のSVGです。
- `outputs/azurite-architecture.mmd`
  - サービス構成図のMermaidソースです。

## Architecture

```mermaid
flowchart LR
  Browser["Browser<br/>ファイル選択 / PUT"]
  API["Web / API<br/>認可・SAS発行・完了確認"]
  DB["Metadata DB<br/>pending / completed / failed"]
  MI["Managed Identity"]
  RBAC["Azure RBAC<br/>Blob Data Contributor"]

  subgraph AzureStorage["Azure Storage"]
    Storage["Storage Account<br/>Blob service"]
    Container["Container<br/>attachments"]
    Storage --> Container
  end

  Browser -->|"1. prepare<br/>アップロード開始要求"| API
  API -->|"2. SAS URL を返す"| Browser
  API -->|"metadata作成<br/>pending"| DB

  Browser -->|"3. SAS URLで直接PUT<br/>ファイル本体"| Storage

  Browser -->|"4. complete<br/>アップロード完了通知"| API
  API -->|"5. Blob properties確認<br/>size / contentType / exists"| Storage
  API -->|"状態更新<br/>completed / failed"| DB

  API -. "Managed Identityで認証" .-> MI
  MI -. "RBACロール割り当てにより<br/>Storage操作を許可" .-> RBAC
  RBAC -. "Blob操作権限" .-> Storage
```

## Key Point

ファイル本体はWeb/APIを通らず、BrowserがSAS URLを使ってBlob Storageへ直接PUTします。
Web/APIは、アップロード可否の判断、SAS URL発行、完了通知の受付、Blob properties確認、Metadata DBの状態更新を担当します。

## Try the Demo

このデモは Docker Desktop を使います。
PR が `main` にマージされる前に試す場合は、先にデモ用ブランチへ切り替えてください。

```bash
git fetch origin
git switch agent/add-runnable-azurite-demo
```

```bash
cd demo
docker compose up azurite azurite-init
```

別ターミナルで:

```bash
cd demo
curl http://localhost:3000/health
```

詳しい手順は [demo/README.md](demo/README.md) を参照してください。

Windows PowerShell で実行する場合は [demo/WINDOWS_POWERSHELL.md](demo/WINDOWS_POWERSHELL.md) を参照してください。
