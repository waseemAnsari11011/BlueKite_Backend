const mongoose = require("mongoose");
const Product = require("./src/modules/Product/model");
require("dotenv").config();

// --- CONFIGURATION ---
const OLD_PATH = "products/";
const NEW_PATH = "products/processed/";
const OLD_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const NEW_EXTENSION = ".webp";
const S3_BUCKET_BASE_URL =
  "https://bluekite-uploads.s3.ap-south-1.amazonaws.com/";
// ---------------------

/**
 * Converts an old image URL to the new WebP URL
 * Example:
 * IN:  https://bluekite-uploads.s3.ap-south-1.amazonaws.com/products/1752378953684_1726314079491_Original.jpg
 * OUT: https://bluekite-uploads.s3.ap-south-1.amazonaws.com/products/processed/1752378953684_1726314079491_Original.webp
 */
function convertImageUrl(oldUrl) {
  // Check if URL matches the pattern we want to convert
  if (!oldUrl.includes(S3_BUCKET_BASE_URL + OLD_PATH)) {
    return oldUrl; // Not a product image, return unchanged
  }

  // Check if it's already converted
  if (oldUrl.includes(NEW_PATH)) {
    return oldUrl; // Already processed, return unchanged
  }

  let newUrl = oldUrl;

  // Replace the old path with new path
  newUrl = newUrl.replace(OLD_PATH, NEW_PATH);

  // Replace old extensions with .webp
  OLD_EXTENSIONS.forEach((ext) => {
    const regex = new RegExp(ext + "$", "i"); // Case-insensitive
    newUrl = newUrl.replace(regex, NEW_EXTENSION);
  });

  return newUrl;
}

/**
 * Updates a single product's image URLs
 */
async function updateProductImages(product) {
  try {
    // Convert all image URLs
    const updatedImages = product.images.map((imageUrl) =>
      convertImageUrl(imageUrl)
    );

    // Check if any images were actually changed
    const hasChanges = updatedImages.some(
      (url, index) => url !== product.images[index]
    );

    if (!hasChanges) {
      console.log(`  ⏭️  SKIPPED: ${product.name} (already updated)`);
      return { updated: false, productId: product._id };
    }

    // Update the product
    product.images = updatedImages;
    await product.save();

    console.log(
      `  ✅ UPDATED: ${product.name} (${product.images.length} images)`
    );
    return { updated: true, productId: product._id };
  } catch (error) {
    console.error(`  ❌ FAILED: ${product.name} - ${error.message}`);
    return { updated: false, productId: product._id, error: error.message };
  }
}

/**
 * Main function to update all products
 */
async function main() {
  try {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Find all products
    console.log("Fetching all products...");
    const products = await Product.find({});
    console.log(`Found ${products.length} products\n`);

    if (products.length === 0) {
      console.log("No products found. Exiting...");
      return;
    }

    // Statistics
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each product
    console.log("Processing products...\n");
    for (const product of products) {
      const result = await updateProductImages(product);

      if (result.error) {
        errorCount++;
      } else if (result.updated) {
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total products: ${products.length}`);
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log("=".repeat(50));
  } catch (error) {
    console.error("Critical error:", error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("\n✅ MongoDB connection closed");
  }
}
const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

// Dry run mode - test without making changes
async function dryRun() {
  try {
    console.log("🔍 DRY RUN MODE - No changes will be made\n");

    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    const products = await Product.find({}).limit(5); // Test with first 5
    console.log(`Testing with first ${products.length} products:\n`);

    for (const product of products) {
      console.log(`Product: ${product.name}`);
      console.log("Old images:");
      product.images.forEach((img) => console.log(`  - ${img}`));

      const newImages = product.images.map((img) => convertImageUrl(img));
      console.log("New images:");
      newImages.forEach((img) => console.log(`  - ${img}`));
      console.log("");
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error("Error in dry run:", error);
  }
}

// Run the script
// To test first: node updateProductImages.js --dry-run
// To execute: node updateProductImages.js
if (process.argv.includes("--dry-run")) {
  dryRun();
} else {
  main();
}
