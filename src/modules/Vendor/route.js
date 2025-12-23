const express = require("express");
const router = express.Router();
const vendorController = require("./controller");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");
const authenticateToken = require("../Middleware/authMiddleware");
const handleS3Upload = require("../Middleware/s3UploadHandler");

// --- START: Define S3 config ---
const S3_FOLDER = "shop_images";
const FILE_FIELD_NAME = "shopImages";

// --- GET Routes ---

// Route to get vendors near a specific location (Specific)
router.get("/vendors/nearme", vendorController.getVendorsNearMe);

// Route to get vendors with discounted products
router.get("/vendors/discounted", vendorController.getDiscountedVendors);

// Route to get new arrival vendors
router.get("/vendors/new-arrivals", vendorController.getNewArrivalVendors);

// Route to get all vendors (Specific)
router.get(
  "/vendors",
  authenticateToken,
  authorizeAdmin,
  vendorController.getAllVendors
);

// Route to get a vendor by ID (Parameterized - Must be after specific GET routes)
router.get("/vendors/:id", vendorController.getVendorById);

// --- POST Routes ---

// Route to create a new vendor
router.post(
  "/vendors/signup",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  vendorController.createVendor
);

// Route for vendor login
router.post("/vendors/login", vendorController.vendorLogin);

// Route for forgot password
router.post("/vendors/forgot-password", vendorController.forgotPassword);

// Route for reset password
router.post("/vendors/reset-password/:token", vendorController.resetPassword);

// --- PUT Routes ---

// Restrict Vendor (Specific path)
router.put(
  "/vendors/restrict/:id",
  authenticateToken,
  authorizeAdmin,
  vendorController.restrictVendor
);

// UnRestrict Vendor (Specific path)
router.put(
  "/vendors/unrestrict/:id",
  authenticateToken,
  authorizeAdmin,
  vendorController.unRestrictVendor
);

// Route to update FCM token
router.put(
  "/vendors/fcm-token/:id",
  authenticateToken,
  vendorController.updateFcmToken
);

// Route to update a vendor by ID (Parameterized - Must be after specific PUT routes)
router.put(
  "/vendors/:id",
  authenticateToken,
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  vendorController.updateVendor
);

// --- DELETE Routes ---

// Route to delete a vendor by ID
router.delete("/vendors/:id", vendorController.deleteVendor);

module.exports = router;
