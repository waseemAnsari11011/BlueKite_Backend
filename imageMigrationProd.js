// imageMigration_reverse.js

const mongoose = require("mongoose");
// Make sure this path correctly points to your Product model
const Product = require("./src/modules/Product/model");
require("dotenv").config();

// --- Configuration ---
const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

// --- Migration Script ---
const reverseMigrateImages = async () => {
  try {
    // Connect to the database
    await mongoose.connect(mongoUri);
    console.log("✅ MongoDB connected successfully.");

    console.log(
      "🚀 Starting reverse migration: Moving from 'imagesS3' back to 'images'..."
    );

    // This server-side operation finds documents where 'imagesS3' has content,
    // moves that content to 'images', and then clears 'imagesS3'.
    const result = await Product.updateMany(
      { imagesS3: { $exists: true, $ne: [] } }, // Filter: Find docs with data in 'imagesS3'
      [
        {
          $set: {
            images: "$imagesS3", // 1. Copy the value from 'imagesS3' to 'images'
            imagesS3: [], // 2. Set 'imagesS3' to an empty array
          },
        },
      ]
    );

    console.log("✨ Reverse migration complete!");
    console.log(`- Documents matched: ${result.matchedCount}`);
    console.log(`- Documents modified: ${result.modifiedCount}`);
  } catch (error) {
    console.error("❌ An error occurred during migration:", error);
  } finally {
    // Ensure the database connection is closed
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed.");
  }
};

// --- Run the Script ---
reverseMigrateImages();
