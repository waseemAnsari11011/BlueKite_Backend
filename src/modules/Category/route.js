const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const categoryController = require("./controller"); // Adjust the path as necessary
const handleS3Upload = require("../Middleware/s3UploadHandler");

const S3_FOLDER = "category";
const FILE_FIELD_NAME = "images"; // Define the field name

// Route to add a new Category with file upload middleware
router.post(
  "/category",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  categoryController.addCategory
);

router.put(
  "/category/:id",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  categoryController.updateCategory
);
router.delete("/category/:id", categoryController.deleteCategory);
router.get("/category", categoryController.getAllCategory);
router.get("/category/:id", categoryController.getCategoryById);

module.exports = router;
