require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("./src/modules/Category/model");
const Product = require("./src/modules/Product/model");
const Vendor = require("./src/modules/Vendor/model");

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node copy_vendor_data.js <SOURCE_VENDOR_ID> <TARGET_VENDOR_ID>");
  process.exit(1);
}

const sourceVendorId = args[0];
const targetVendorId = args[1];

const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

async function copyData() {
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");

    // 1. Validate Vendors
    const sourceVendor = await Vendor.findById(sourceVendorId);
    const targetVendor = await Vendor.findById(targetVendorId);

    if (!sourceVendor) {
      throw new Error(`Source vendor not found: ${sourceVendorId}`);
    }
    if (!targetVendor) {
      throw new Error(`Target vendor not found: ${targetVendorId}`);
    }

    console.log(`Copying data from "${sourceVendor.vendorInfo.businessName}" to "${targetVendor.vendorInfo.businessName}"`);

    // 2. Copy Categories
    const sourceCategories = await Category.find({ vendor: sourceVendorId });
    console.log(`Found ${sourceCategories.length} categories for source vendor.`);

    const categoryMap = new Map(); // sourceCategoryId -> targetCategoryId

    for (const sourceCat of sourceCategories) {
      // Check if category with same name exists for target vendor
      let targetCat = await Category.findOne({
        vendor: targetVendorId,
        name: sourceCat.name,
      });

      if (targetCat) {
        console.log(`Category "${sourceCat.name}" already exists for target vendor. Using existing ID.`);
      } else {
        console.log(`Creating category "${sourceCat.name}" for target vendor.`);
        targetCat = new Category({
          name: sourceCat.name,
          vendor: targetVendorId,
          images: sourceCat.images,
          imagesS3: sourceCat.imagesS3,
          addresses: sourceCat.addresses,
        });
        await targetCat.save();
      }
      categoryMap.set(sourceCat._id.toString(), targetCat._id);
    }

    // 3. Copy Products
    const sourceProducts = await Product.find({ vendor: sourceVendorId });
    console.log(`Found ${sourceProducts.length} products for source vendor.`);

    let productsCreated = 0;
    for (const sourceProd of sourceProducts) {
      const targetCategoryId = categoryMap.get(sourceProd.category.toString());

      if (!targetCategoryId) {
        console.warn(`Skipping product "${sourceProd.name}": Category not found in map (maybe it was skipped?).`);
        continue;
      }

      // Check if product already exists (optional, but good to avoid duplicates if run multiple times)
      // For now, we'll assume we want to create a copy regardless, or we could check by name + vendor
      // Let's check by name to be safe and avoid massive duplicates
      const existingProduct = await Product.findOne({
        vendor: targetVendorId,
        name: sourceProd.name,
        category: targetCategoryId
      });

      if (existingProduct) {
        console.log(`Product "${sourceProd.name}" already exists. Skipping.`);
        continue;
      }

      const newProduct = new Product({
        name: sourceProd.name,
        images: sourceProd.images,
        price: sourceProd.price,
        discount: sourceProd.discount,
        quantity: sourceProd.quantity,
        description: sourceProd.description,
        category: targetCategoryId,
        vendor: targetVendorId,
        availableLocalities: sourceProd.availableLocalities,
      });

      await newProduct.save();
      productsCreated++;
    }

    console.log(`Successfully created ${productsCreated} products.`);

  } catch (error) {
    console.error("Error copying data:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

copyData();
