const express = require("express");
const router = express.Router();
const vendorController = require("./controller");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");
const authenticateToken = require("../Middleware/authMiddleware");
const handleS3Upload = require("../Middleware/s3UploadHandler");

// --- START: Define S3 config ---
const S3_FOLDER = "shop_images";
const FILE_FIELD_NAME = "shopImages";

// Route to create a new vendor
router.post(
  "/vendors/signup",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  vendorController.createVendor
);

// Route to update a vendor by ID
router.put(
  "/vendors/:id",
  authenticateToken,
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME), // ✅ Add S3 middleware
  vendorController.updateVendor
);

// Route to get all vendors
router.get(
  "/vendors",
  authenticateToken,
  authorizeAdmin,
  vendorController.getAllVendors
);

// Route to get a vendor by ID
router.get("/vendors/:id", vendorController.getVendorById);

//Restrict Vendor
router.put(
  "/vendors/restrict/:id",
  authenticateToken,
  authorizeAdmin,
  vendorController.restrictVendor
);

//UnRestrict Vendor
router.put(
  "/vendors/unrestrict/:id",
  authenticateToken,
  authorizeAdmin,
  vendorController.unRestrictVendor
);

// Route to delete a vendor by ID
router.delete("/vendors/:id", vendorController.deleteVendor);

// Route for vendor login
router.post("/vendors/login", vendorController.vendorLogin);

module.exports = router;
