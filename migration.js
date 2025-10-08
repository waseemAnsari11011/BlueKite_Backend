const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const uploadToS3 = require("./src/modules/utils/s3Upload");
require("dotenv").config();

// Import all the models
const Banner = require("./src/modules/Banner/model");
const Category = require("./src/modules/Category/model");
const Customer = require("./src/modules/Customer/model");
const Product = require("./src/modules/Product/model");

// MongoDB connection
const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

const migrateCollection = async (Model, imageField, s3ImageField, s3Folder) => {
  const documents = await Model.find({});
  console.log(
    `Found ${documents.length} documents in ${Model.modelName} collection.`
  );

  for (const doc of documents) {
    if (doc[imageField] && doc[imageField].length > 0) {
      let s3Urls = [];
      if (Array.isArray(doc[imageField])) {
        for (const imagePath of doc[imageField]) {
          const fullPath = path.join(__dirname, imagePath);
          if (fs.existsSync(fullPath)) {
            const fileName = path.basename(fullPath);
            const s3Key = `${s3Folder}/${fileName}`;
            try {
              const s3Url = await uploadToS3(fullPath, s3Key);
              s3Urls.push(s3Url);
              console.log(`Successfully uploaded ${fileName} to S3.`);
            } catch (error) {
              console.error(`Error uploading ${fileName} to S3:`, error);
            }
          } else {
            console.warn(`File not found: ${fullPath}`);
          }
        }
        doc[s3ImageField] = s3Urls;
      } else {
        // For single image fields
        const fullPath = path.join(__dirname, doc[imageField]);
        if (fs.existsSync(fullPath)) {
          const fileName = path.basename(fullPath);
          const s3Key = `${s3Folder}/${fileName}`;
          try {
            const s3Url = await uploadToS3(fullPath, s3Key);
            doc[s3ImageField] = s3Url;
            console.log(`Successfully uploaded ${fileName} to S3.`);
          } catch (error) {
            console.error(`Error uploading ${fileName} to S3:`, error);
          }
        } else {
          console.warn(`File not found: ${fullPath}`);
        }
      }
      await doc.save();
      console.log(`Updated document ${doc._id} with S3 URLs.`);
    }
  }
};

const runMigration = async () => {
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");

    await migrateCollection(Banner, "images", "imagesS3", "banner");
    await migrateCollection(Category, "images", "imagesS3", "category");
    await migrateCollection(Customer, "image", "imageS3", "customer");
    await migrateCollection(Product, "images", "imagesS3", "products");

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  }
};

runMigration();
