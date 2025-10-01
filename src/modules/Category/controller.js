const Category = require("./model"); // Adjust the path as necessary
const fs = require("fs");
const path = require("path");

// Controller function to add a new category
exports.addCategory = async (req, res) => {
  try {
    const { name, addresses } = req.body;
    const images = req.files.map((file) => file.path); // Get the paths of the uploaded images

    // Create a new category instance
    const newCategory = new Category({
      name,
      images,
      addresses: addresses ? JSON.parse(addresses) : [],
    });

    // Save the category to the database
    const savedCategory = await newCategory.save();

    // Send response
    res.status(201).json({
      message: "Category created successfully",
      category: savedCategory,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to create category",
      error: error.message,
    });
  }
};

// Controller function to update an existing category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, existingImages, addresses } = req.body;

    // Find the category by ID
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    // Delete category images from the file system that are not in existingImages
    category.images.forEach((imagePath) => {
      if (!existingImages?.includes(imagePath)) {
        const fullPath = path.join(imagePath);
        fs.unlink(fullPath, (err) => {
          if (err) {
            console.error(`Failed to delete image file: ${fullPath}`, err);
          }
        });
      }
    });

    // Update the category details
    category.name = name || category.name;
    category.addresses = addresses ? JSON.parse(addresses) : category.addresses;

    // Combine existing images and new uploaded images
    const newImages = req.files.map((file) => file.path);
    category.images = existingImages
      ? existingImages.concat(newImages)
      : newImages;

    // Save the updated category to the database
    const updatedCategory = await category.save();

    // Send response
    res.status(200).json({
      message: "Category updated successfully",
      category: updatedCategory,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to update category",
      error: error.message,
    });
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
