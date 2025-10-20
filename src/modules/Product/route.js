// Product/route.js
const express = require("express");
const router = express.Router();
// const upload = require('../Middleware/uploadHandler'); // REMOVE THIS
const handleS3Upload = require("../Middleware/s3UploadHandler"); // ✅ ADD THIS
const productController = require("./controller");

const S3_FOLDER = "products";
const FILE_FIELD_NAME = "images";

// ✅ Use the S3 upload middleware
router.post(
  "/products",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  productController.addProduct
);
router.put(
  "/products/:id",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  productController.updateProduct
);

// --- Other routes remain the same ---
router.delete("/products/:id", productController.deleteProduct);
router.get("/products/:vendorId", productController.getAllProducts);
router.get(
  "/products-low-quantity/:vendorId",
  productController.getProductsLowQuantity
);
router.get("/single-product/:id", productController.getProductById);
router.get(
  "/categories/:id/products",
  productController.getProductsByCategoryId
);
router.get("/products/:id/similar", productController.getSimilarProducts);
router.get(
  "/recentlyAddedProducts",
  productController.getRecentlyAddedProducts
);
router.get("/onDiscountProducts", productController.getDiscountedProducts);
router.get("/searchProducts", productController.fuzzySearchProducts);

module.exports = router;
