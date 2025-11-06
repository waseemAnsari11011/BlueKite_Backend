const express = require("express");
const router = express.Router();
const notificationController = require("./controller");
const authenticateToken = require("../Middleware/authMiddleware");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");
const handleS3Upload = require("../Middleware/s3UploadHandler");

// Send notification with optional image upload
router.post(
  "/send-all",
  authenticateToken,
  authorizeAdmin,
  handleS3Upload("notifications", "image"), // Upload to 'notifications' folder in S3
  notificationController.sendNotificationToAll
);

// Get notification history (with pagination)
router.get(
  "/history",
  authenticateToken,
  authorizeAdmin,
  notificationController.getNotificationHistory
);

// Get single notification by ID
router.get(
  "/:id",
  authenticateToken,
  authorizeAdmin,
  notificationController.getNotificationById
);

// Resend a notification
router.post(
  "/resend/:id",
  authenticateToken,
  authorizeAdmin,
  notificationController.resendNotification
);

// Delete notification
router.delete(
  "/:id",
  authenticateToken,
  authorizeAdmin,
  notificationController.deleteNotification
);

module.exports = router;
