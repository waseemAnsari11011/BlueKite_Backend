const Category = require("./model"); // Adjust the path as necessary
const fs = require("fs");
const path = require("path");
const {
  extractS3KeyFromUrl,
  deleteS3Objects,
} = require("../Middleware/s3DeleteUtil");

// Controller function to add a new category
exports.addCategory = async (req, res) => {
  try {
    let { name, addresses } = req.body;

    // ✅ FIX: Parse the addresses string back into an array
    if (addresses) {
      try {
        addresses = JSON.parse(addresses);
      } catch (e) {
        return res.status(400).json({ message: "Invalid addresses format." });
      }
    }

    const images = req.files ? req.files.map((file) => file.location) : [];

    const newCategory = new Category({
      name,
      addresses: addresses,
      images: images,
    });

    await newCategory.save();

    res.status(201).json({
      message: "Category created successfully!",
      category: newCategory,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ message: "Failed to create category", error });
  }
};

// --- UPDATE AN EXISTING CATEGORY ---
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    let { name, addresses, existingImages } = req.body; // use let

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // ✅ FIX: Parse the addresses string back into an array
    if (addresses) {
      try {
        addresses = JSON.parse(addresses);
      } catch (e) {
        return res.status(400).json({ message: "Invalid addresses format." });
      }
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
    if (addresses) category.addresses = addresses; // Now 'addresses' is a proper array

    category.images = [...imagesToKeep, ...newImageLocations];

    await category.save();

    res.status(200).json({
      message: "Category updated successfully!",
      category,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Failed to update category", error });
  }
};

// Controller function to get all categories
exports.getAllCategory = async (req, res) => {
  try {
    const { userAddress } = req.query;
    console.log("userAddress==>>", userAddress);

    let categories = await Category.find();

    if (userAddress) {
      const userAddressWords = userAddress.toLowerCase().split(/[\s,]+/);

      categories = categories.filter((category) => {
        if (!category.addresses || category.addresses.length === 0) {
          // If a user address is provided, categories without a specific address should not be shown.
          return false;
        }
        // Check if any of the category's address keywords are in the user's address
        return category.addresses.some((categoryAddress) => {
          const categoryAddressWords = categoryAddress
            .toLowerCase()
            .split(/[\s,]+/);
          return categoryAddressWords.some((catWord) =>
            userAddressWords.includes(catWord)
          );
        });
      });
    }

    // Send the categories in the response
    res.status(200).json({
      message: "Categories retrieved successfully",
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

// Controller function to get a category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the category by ID
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        message: "Category not found",
      });
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

// Controller function to delete a category by ID
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the category by ID
    const deletedCategory = await Category.findByIdAndDelete(id);

    if (!deletedCategory) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    // Delete category images from the file system
    deletedCategory.images.forEach((imagePath) => {
      const fullPath = path.join(imagePath);
      fs.unlink(fullPath, (err) => {
        if (err) {
          console.error(`Failed to delete image file: ${fullPath}`, err);
        }
      });
    });

    // Send response confirming deletion
    res.status(200).json({
      message: "Category deleted successfully",
      category: deletedCategory,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete category",
      error: error.message,
    });
  }
};
