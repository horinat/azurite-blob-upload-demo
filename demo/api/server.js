import express from "express";
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

const port = Number(process.env.PORT ?? 3000);
const accountName = process.env.AZURITE_ACCOUNT_NAME ?? "devstoreaccount1";
const accountKey = process.env.AZURITE_ACCOUNT_KEY;
const connectionString = process.env.AZURITE_CONNECTION_STRING;
const publicBlobEndpoint =
  process.env.AZURITE_PUBLIC_BLOB_ENDPOINT ??
  "http://127.0.0.1:10000/devstoreaccount1";
const containerName = "attachments";

if (!accountKey || !connectionString) {
  throw new Error("AZURITE_ACCOUNT_KEY and AZURITE_CONNECTION_STRING are required");
}

const app = express();
app.use(express.json());

const sharedKeyCredential = new StorageSharedKeyCredential(
  accountName,
  accountKey,
);
const blobServiceClient =
  BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);
const uploads = new Map();

function safeBlobName(fileName) {
  const cleaned = String(fileName ?? "upload.bin").replaceAll("\\", "/");
  return cleaned.split("/").filter(Boolean).pop() || "upload.bin";
}

async function setupAzurite() {
  await containerClient.createIfNotExists();

  try {
    await blobServiceClient.setProperties({
      cors: [
        {
          allowedOrigins: "*",
          allowedMethods: "PUT,OPTIONS",
          allowedHeaders: "*",
          exposedHeaders: "*",
          maxAgeInSeconds: 3600,
        },
      ],
    });
  } catch (error) {
    console.warn("CORS setup skipped:", error.message);
  }

  console.log("Azurite demo setup completed.");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/attachments/prepare", (req, res) => {
  const { fileName, fileSize, contentType } = req.body ?? {};
  const attachmentId = `att_${crypto.randomUUID().slice(0, 8)}`;
  const blobName = `${attachmentId}-${safeBlobName(fileName)}`;
  const expiresOn = new Date(Date.now() + 10 * 60 * 1000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("cw"),
      startsOn: new Date(Date.now() - 60 * 1000),
      expiresOn,
      protocol: SASProtocol.HttpsAndHttp,
    },
    sharedKeyCredential,
  ).toString();

  uploads.set(attachmentId, {
    attachmentId,
    blobName,
    fileName,
    fileSize: Number(fileSize),
    contentType,
    status: "pending",
  });

  res.json({
    attachmentId,
    uploadUrl: `${publicBlobEndpoint}/${containerName}/${encodeURIComponent(blobName)}?${sas}`,
    expiresAt: expiresOn.toISOString(),
  });
});

app.post("/api/attachments/:attachmentId/complete", async (req, res) => {
  const upload = uploads.get(req.params.attachmentId);
  if (!upload) {
    res.status(404).json({ status: "failed", reason: "attachment not found" });
    return;
  }

  try {
    const blobClient = containerClient.getBlobClient(upload.blobName);
    const properties = await blobClient.getProperties();
    const actualSize = properties.contentLength ?? 0;
    const actualContentType = properties.contentType ?? "";

    if (actualSize !== upload.fileSize) {
      upload.status = "failed";
      res.status(422).json({
        status: "failed",
        reason: "file size mismatch",
        expectedSize: upload.fileSize,
        actualSize,
      });
      return;
    }

    if (actualContentType !== upload.contentType) {
      upload.status = "failed";
      res.status(422).json({
        status: "failed",
        reason: "content type mismatch",
        expectedContentType: upload.contentType,
        actualContentType,
      });
      return;
    }

    upload.status = "completed";
    res.json({
      status: "completed",
      fileSize: actualSize,
      contentType: actualContentType,
    });
  } catch (error) {
    upload.status = "failed";
    res.status(422).json({ status: "failed", reason: error.message });
  }
});

await setupAzurite();
app.listen(port, () => {
  console.log(`Local API listening on http://localhost:${port}`);
});
