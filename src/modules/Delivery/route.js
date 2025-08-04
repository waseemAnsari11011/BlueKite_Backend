const express = require("express");
const router = express.Router();
const deliveryChargeController = require("./controller"); // Make sure to create appropriate controller methods
const authenticateToken = require("../Middleware/authMiddleware");
const { authorizeVendor } = require("../Middleware/authorizeMiddleware");

// Route to create a new delivery charge
router.post(
  "/delivery-charges",
  authenticateToken,
  authorizeVendor,
  deliveryChargeController.createDeliveryCharge
);

// Route to get all delivery charges
router.get("/delivery-charges", deliveryChargeController.getDeliveryCharges);

// Route to get a single delivery charge by ID
router.get(
  "/delivery-charges/:id",
  authenticateToken,
  authorizeVendor,
  deliveryChargeController.getDeliveryChargeById
);

// Route to update a delivery charge by ID
router.put(
  "/delivery-charges/:id",
  authenticateToken,
  authorizeVendor,
  deliveryChargeController.updateDeliveryCharge
);

// Route to delete a delivery charge by ID
router.delete(
  "/delivery-charges/:id",
  authenticateToken,
  authorizeVendor,
  deliveryChargeController.deleteDeliveryCharge
);

module.exports = router;
