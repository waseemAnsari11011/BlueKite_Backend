const express = require("express");
const router = express.Router();
const notificationController = require("./controller");
const authenticateToken = require("../Middleware/authMiddleware");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");

// Allow only 'admin' and 'vendor' to send
router.post(
  "/send-all",
  authenticateToken,
  authorizeAdmin,
  notificationController.sendNotificationToAll
);

module.exports = router;
