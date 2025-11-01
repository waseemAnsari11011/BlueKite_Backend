const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@aws-sdk/node-http-handler");
const sharp = require("sharp");
const path = require("path");
require("dotenv").config();

// --- 1. CONFIGURE THIS ---
const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const SOURCE_FOLDER = "products/"; // Folder with old images. Use '' for root.
const DESTINATION_FOLDER = "products/processed/"; // Folder for new WebP images
const MAX_WIDTH = 800; // Max width for resizing
const WEBP_QUALITY = 80; // Quality for new WebP (1-100)
const PROCESSING_TIMEOUT = 30000; // 30 seconds max per image
// -------------------------

// Configure AWS S3 Client (v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  requestHandler: new NodeHttpHandler({
    connectTimeout: 5000,
    socketTimeout: 30000, // Increased to 30 seconds
  }),
});

/**
 * Helper function to convert a readable stream to a buffer
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Timeout wrapper for promises
 */
function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
    ),
  ]);
}

/**
 * Lists ALL objects in a bucket/prefix, handling pagination.
 */
async function listAllObjects(bucket, prefix) {
  const allObjects = [];
  let isTruncated = true;
  let continuationToken;

  console.log(`Listing all objects in ${bucket}/${prefix}...`);

  while (isTruncated) {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const response = await s3Client.send(command);

    if (response.Contents) {
      allObjects.push(...response.Contents);
    }

    isTruncated = response.IsTruncated;
    continuationToken = response.NextContinuationToken;
  }
  console.log(`Found ${allObjects.length} total objects.`);
  return allObjects;
}

/**
 * Processes a single image: download, resize, convert, upload.
 */
async function processSingleImage(object) {
  const key = object.Key;

  // Skip folders or files already processed
  if (key.endsWith("/") || key.startsWith(DESTINATION_FOLDER)) {
    console.log(`- SKIPPING: ${key} (folder or already processed)`);
    return;
  }

  // Check for valid image extensions
  if (!/\.(jpg|jpeg|png)$/i.test(key)) {
    console.log(`- SKIPPING: ${key} (not a target image)`);
    return;
  }

  console.log(`Processing: ${key}`);

  try {
    // Wrap the entire operation in a timeout
    await withTimeout(
      (async () => {
        // 1. Get the original image
        const getCommand = new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: key,
        });
        const originalImage = await s3Client.send(getCommand);
        const originalBuffer = await streamToBuffer(originalImage.Body);

        // 2. Process with sharp
        const processedBuffer = await sharp(originalBuffer)
          .resize(MAX_WIDTH, null, { withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();

        // 3. Upload the new image
        const originalFilename = path.basename(key, path.extname(key));
        const newKey = `${DESTINATION_FOLDER}${originalFilename}.webp`;

        const putCommand = new PutObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: newKey,
          Body: processedBuffer,
          ContentType: "image/webp",
        });
        await s3Client.send(putCommand);

        const oldSize = (object.Size / 1024).toFixed(2);
        const newSize = (processedBuffer.length / 1024).toFixed(2);
        console.log(
          `  ✅ SUCCESS: ${key} (${oldSize}KB) -> ${newKey} (${newSize}KB)`
        );
      })(),
      PROCESSING_TIMEOUT
    );
  } catch (err) {
    // This will catch timeouts, corrupted images, and other errors
    console.error(`  ❌ FAILED to process ${key}: ${err.message}`);
  }
}

/**
 * Main function to run the script
 */
async function main() {
  try {
    const allObjects = await listAllObjects(S3_BUCKET_NAME, SOURCE_FOLDER);

    // Process images one by one
    for (const object of allObjects) {
      await processSingleImage(object);
    }
  } catch (err) {
    console.error("Critical error listing objects:", err);
  }
  console.log("Image processing complete.");
}

main();
