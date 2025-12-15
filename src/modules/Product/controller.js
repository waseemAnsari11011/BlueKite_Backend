const Product = require("./model"); // Adjust the path as necessary
const fs = require("fs");
const path = require("path");
const Category = require("../Category/model"); // <-- Add this line
const {
  deleteS3Objects,
  extractS3KeyFromUrl,
} = require("../Middleware/s3DeleteUtil");

// Controller function to add a new product
exports.addProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      discount,
      description,
      category,
      vendor,
      availableLocalities,
      quantity,
      foodPreparationTime,
    } = req.body;

    // ✅ --- QUICK FIX STARTS HERE ---
    // If price or discount are falsy (null, undefined, "", 0),
    // default them to 0. This prevents 'null' from being saved.
    const priceToSave = price || 0;
    const discountToSave = discount || 0;
    const quantityToSave = quantity || 0;
    const foodPreparationTimeToSave = foodPreparationTime || 0;
    // ✅ --- QUICK FIX ENDS HERE ---

    // ✅ Get the S3 URLs from the middleware's result (file.location)
    const images = req.files ? req.files.map((file) => file.location) : [];

    const newProduct = new Product({
      name,
      images,
      price: priceToSave, // Use the fixed value
      discount: discountToSave, // Use the fixed value
      description,
      category,
      vendor,
      availableLocalities: Array.isArray(availableLocalities)
        ? availableLocalities
        : [availableLocalities],
      quantity: quantityToSave, // Use the fixed value
      foodPreparationTime: foodPreparationTimeToSave,
    });

    const savedProduct = await newProduct.save();

    res.status(201).json({
      message: "Product created successfully",
      product: savedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to create product",
      error: error.message,
    });
  }
};

// Controller function to get all products
exports.getAllProducts = async (req, res) => {
  try {
    const vendorId = req.params.vendorId;

    let query = {};
    if (vendorId && vendorId !== "all") {
      query = { vendor: vendorId };
    }

    // Find all products and populate the category field
    const products = await Product.find(query)
      .populate("category")
      .populate("vendor");

    // Send response with the products
    res.status(200).json({
      message: "Products retrieved successfully",
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve products",
      error: error.message,
    });
  }
};

// Controller to get products with low quantity
exports.getProductsLowQuantity = async (req, res) => {
  try {
    const vendorId = req.params.vendorId; // Extract vendorId from request params

    // Find products with quantity below 10 for the specified vendor
    const lowQuantityProducts = await Product.find({
      vendor: vendorId,
      quantity: { $lt: 10 },
    });

    res.status(200).json(lowQuantityProducts);
  } catch (error) {
    console.error("Error fetching low quantity products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Controller function to get a product by ID
exports.getProductById = async (req, res) => {
  console.log("getProductById->>", req.params.id);

  try {
    const { id } = req.params;

    // Find the product by ID and populate the category field
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    // Send the product in the response
    res.status(200).json({
      message: "Product retrieved successfully",
      product,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve product",
      error: error.message,
    });
  }
};

// Controller function to update an existing product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      price,
      discount,
      description,
      category,
      existingImages,
      vendor,
      availableLocalities,
      quantity,
      foodPreparationTime,
    } = req.body;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // ✅ --- S3 Image Deletion Logic ---
    const currentImages = product.images || [];
    const imagesToKeep = existingImages
      ? Array.isArray(existingImages)
        ? existingImages
        : [existingImages]
      : [];
    const imagesToDelete = currentImages.filter(
      (url) => !imagesToKeep.includes(url)
    );

    if (imagesToDelete.length > 0) {
      const keysToDelete = imagesToDelete
        .map(extractS3KeyFromUrl)
        .filter((key) => key);
      if (keysToDelete.length > 0) {
        await deleteS3Objects(keysToDelete);
      }
    }

    // --- Update product details ---
    product.name = name || product.name;

    // ✅ --- QUICK FIX STARTS HERE ---
    // The original logic (price !== undefined) allowed 'null' to be saved.
    // We change the check to (price != null), which checks for BOTH null and undefined.
    // This prevents 'null' from being saved, but allows 0 to be saved.
    product.price = price != null ? price : product.price;
    product.discount = discount != null ? discount : product.discount;
    product.quantity = quantity != null ? quantity : product.quantity;
    product.foodPreparationTime =
      foodPreparationTime != null
        ? foodPreparationTime
        : product.foodPreparationTime;
    // ✅ --- QUICK FIX ENDS HERE ---

    product.description = description || product.description;
    product.category = category || product.category;
    product.vendor = vendor || product.vendor;
    product.availableLocalities = availableLocalities
      ? Array.isArray(availableLocalities)
        ? availableLocalities
        : [availableLocalities]
      : product.availableLocalities;

    // ✅ Get new image locations from S3 middleware
    const newImageLocations = req.files
      ? req.files.map((file) => file.location)
      : [];
    product.images = [...imagesToKeep, ...newImageLocations];

    const updatedProduct = await product.save();

    res.status(200).json({
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to update product",
      error: error.message,
    });
  }
};

// Controller function to delete a product by ID
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Delete images from S3
    if (product.images && product.images.length > 0) {
      const keysToDelete = product.images
        .map(extractS3KeyFromUrl)
        .filter((key) => key);
      if (keysToDelete.length > 0) {
        await deleteS3Objects(keysToDelete);
      }
    }

    await Product.findByIdAndDelete(id);

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Failed to delete product", error: error.message });
  }
};

// Controller function to get products by Category ID with pagination
exports.getProductsByCategoryId = async (req, res) => {
  try {
    const categoryId = req.params.id; // Assuming 'id' is the category ID
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userLocation = req.query.userLocation;
    const vendorId = req.query.vendorId;

    const query = {
      category: categoryId,
    };

    if (vendorId) {
      query.vendor = vendorId;
    }

    // Find all products that belong to the given category ID and filter by userLocation
    const products = await Product.find(query)
      .skip((page - 1) * limit)
      .limit(limit);

    // Count the total number of products in the category with the specified location filter
    const totalProducts = await Product.countDocuments(query);

    // Send the products in the response with pagination metadata
    res.status(200).json({
      total: totalProducts,
      page,
      limit,
      products,
    });
  } catch (error) {
    console.error("Error retrieving products:", error);
    res.status(500).json({
      message: "Failed to retrieve products",
      error: error.message,
    });
  }
};

// Get similar products based on the same category
exports.getSimilarProducts = async (req, res) => {
  try {
    console.log("api call");
    const productId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userLocation = req.query.userLocation;

    // Find the product by ID
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Find other products in the same category, excluding the current product
    const similarProducts = await Product.find({
      category: product.category,
      availableLocalities: { $in: [userLocation, "all"] },
      _id: { $ne: productId },
    })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalSimilarProducts = await Product.countDocuments({
      category: product.category,
      availableLocalities: { $in: [userLocation, "all"] },
      _id: { $ne: productId },
    });

    res.json({
      total: totalSimilarProducts,
      page,
      limit,
      products: similarProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//Recently added Products
exports.getRecentlyAddedProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { userLocation, userAddress, lat, long, vendorIds } = req.query;

    console.log("userLocation=", userLocation);
    console.log("userAddress=", userAddress);
    console.log("vendorIds=", vendorIds);

    let vendorFilter = {};

    if (vendorIds) {
      // If vendorIds are provided (comma separated), use them directly
      const ids = vendorIds.split(",");
      vendorFilter = { vendor: { $in: ids } };
    }

    const query = { ...vendorFilter };

    const recentlyAddedProducts = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalRecentlyAddedProducts = await Product.countDocuments(query);

    res.json({
      total: totalRecentlyAddedProducts,
      page,
      limit,
      products: recentlyAddedProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//On-discount Products
exports.getDiscountedProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { userLocation, userAddress, lat, long, vendorIds } = req.query;
    console.log("getDiscountedProducts params:", {
      userLocation,
      userAddress,
      lat,
      long,
      vendorIds,
    });

    let vendorFilter = {};
    if (vendorIds) {
      // If vendorIds are provided (comma separated), use them directly
      const ids = vendorIds.split(",");
      vendorFilter = { vendor: { $in: ids } };
    }

    const query = {
      discount: { $gt: 0 },
      ...vendorFilter,
    };
    console.log("getDiscountedProducts query:", JSON.stringify(query));

    const discountedProducts = await Product.find(query)
      .sort({ discount: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalDiscountedProducts = await Product.countDocuments(query);

    res.json({
      total: totalDiscountedProducts,
      page,
      limit,
      products: discountedProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//Fuzzy Search
// controller.js

exports.fuzzySearchProducts = async (req, res) => {
  try {
    const { searchQuery, userAddress } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    console.log("userAddress=", userAddress);

    // This block is essential for your requirement.
    // If no user address is provided, we don't filter by category address.
    // Removed Smart Category Matching logic here

    const regexQuery = new RegExp(searchQuery, "i");

    // 2. FIND PRODUCTS USING THE CATEGORY FILTER
    const finalQuery = {
      // Removed categoryFilter
      $or: [
        { name: { $regex: regexQuery } },
        { description: { $regex: regexQuery } },
      ],
    };

    const products = await Product.find(finalQuery)
      .populate("category") // Optional: to get category details in the response
      .skip((page - 1) * limit)
      .limit(limit);

    const totalProducts = await Product.countDocuments(finalQuery);

    res.json({
      total: totalProducts,
      page,
      limit,
      products,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
