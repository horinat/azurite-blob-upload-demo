# Azurite Blob Upload Demo Materials

AzuriteでAzure Blob Storageの直接アップロードを試すためのデモ資料です。

## Files

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

