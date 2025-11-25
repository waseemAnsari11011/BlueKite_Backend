const express = require("express");
const router = express.Router();
const categoryController = require("./controller"); // Adjust the path as necessary
const handleS3Upload = require("../Middleware/s3UploadHandler");
const authenticateToken = require("../Middleware/authMiddleware");

const S3_FOLDER = "category";
const FILE_FIELD_NAME = "images"; // Define the field name

// --- Secure all vendor-specific routes ---

// Route to add a new Category
router.post(
  "/category",
  authenticateToken, // 👈 Add auth
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  categoryController.addCategory
);

// Route to update a specific Category
router.put(
  "/category/:id",
  authenticateToken, // 👈 Add auth
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  categoryController.updateCategory
);

// Route to delete a specific Category
router.delete(
  "/category/:id",
  authenticateToken, // 👈 Add auth
  categoryController.deleteCategory
);

// Route to get all categories FOR THE LOGGED-IN VENDOR
router.get(
  "/category",
  authenticateToken, // 👈 Add auth
  categoryController.getAllCategory
);

// Route to get a single category BY ID (and check ownership)
router.get(
  "/category/:id",
  authenticateToken, // 👈 Add auth
  categoryController.getCategoryById
);

// Route to get categories by vendor ID (public)
router.get("/category/vendor/:vendorId", categoryController.getVendorCategories);

module.exports = router;
