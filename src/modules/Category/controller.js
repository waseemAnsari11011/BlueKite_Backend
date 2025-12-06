const Category = require("./model"); // Adjust the path as necessary
const {
  extractS3KeyFromUrl,
  deleteS3Objects,
} = require("../Middleware/s3DeleteUtil");

// Controller function to add a new category (now linked to a vendor)
exports.addCategory = async (req, res) => {
  console.log("addCategory is called");
  try {
    const { name } = req.body;
    const vendorId = req.user.id; // 👈 Get vendor ID from token

    if (!vendorId) {
      return res
        .status(403)
        .json({ message: "Forbidden: No user ID in token." });
    }

    const images = req.files ? req.files.map((file) => file.location) : [];

    const newCategory = new Category({
      name,
      vendor: vendorId, // 👈 Assign ownership
      images: images,
    });

    await newCategory.save();

    res.status(201).json({
      message: "Category created successfully!",
      category: newCategory,
    });
  } catch (error) {
    // Handle the unique index error (vendor + name)
    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "Failed to create category. You already have a category with this name.",
      });
    }
    console.error("Error creating category:", error);
    res.status(500).json({ message: "Failed to create category", error });
  }
};

// --- UPDATE AN EXISTING CATEGORY (with ownership check) ---
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.id; // 👈 Get vendor ID from token
    let { name, existingImages } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // ⛔ OWNERSHIP CHECK
    if (category.vendor.toString() !== vendorId) {
      return res
        .status(403)
        .json({ message: "Forbidden: You do not own this category." });
    }

    // --- Handle Image Deletion ---
    const currentImages = category.images || [];
    const imagesToKeep = existingImages
      ? Array.isArray(existingImages)
        ? existingImages
        : [existingImages]
      : currentImages;

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

    // --- Handle New Image Uploads ---
    const newImageLocations = req.files
      ? req.files.map((file) => file.location)
      : [];

    // --- Update the document ---
    category.name = name || category.name;
    category.images = [...imagesToKeep, ...newImageLocations];

    await category.save();

    res.status(200).json({
      message: "Category updated successfully!",
      category,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "Failed to update category. You already have another category with this name.",
      });
    }
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Failed to update category", error });
  }
};

// Controller function to get all categories FOR THE LOGGED-IN VENDOR
exports.getAllCategory = async (req, res) => {
  try {
    const vendorId = req.user.id; // 👈 Get vendor ID from token

    // 👈 Find only categories that belong to this vendor
    const categories = await Category.find({ vendor: vendorId });

    // The 'userAddress' logic is removed as this is now a
    // private route for a vendor to get their *own* categories.
    // A public search route would be separate.

    res.status(200).json({
      message: "Your categories retrieved successfully",
      categories,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve categories",
      error: error.message,
    });
  }
};

// Controller function to get a category by ID (with ownership check)
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.id; // 👈 Get vendor ID from token

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    // ⛔ OWNERSHIP CHECK
    if (category.vendor.toString() !== vendorId) {
      return res
        .status(403)
        .json({ message: "Forbidden: You do not own this category." });
    }

    // Send the category in the response
    res.status(200).json({
      message: "Category retrieved successfully",
      category,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve category",
      error: error.message,
    });
  }
};

// Controller function to delete a category by ID (with ownership check)
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.id; // 👈 Get vendor ID from token

    // Find the category first to check ownership
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    // ⛔ OWNERSHIP CHECK
    if (category.vendor.toString() !== vendorId) {
      return res
        .status(403)
        .json({ message: "Forbidden: You do not own this category." });
    }

    // --- ✅ FIX: Delete images from S3, not filesystem ---
    // Your old code used 'fs.unlink', which is for local files.
    // This uses the same S3 logic from your 'updateCategory' function.
    if (category.images && category.images.length > 0) {
      const keysToDelete = category.images
        .map(extractS3KeyFromUrl)
        .filter((key) => key);
      if (keysToDelete.length > 0) {
        await deleteS3Objects(keysToDelete);
      }
    }

    // Now, delete the category from the database
    await Category.findByIdAndDelete(id);

    res.status(200).json({
      message: "Category deleted successfully",
      category: category, // Send back the category that was deleted
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete category",
      error: error.message,
    });
  }
};

// Controller function to get categories by vendor ID (public)
exports.getVendorCategories = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const categories = await Category.find({ vendor: vendorId });
    res.status(200).json({
      message: "Vendor categories retrieved successfully",
      categories,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve vendor categories",
      error: error.message,
    });
  }
};
