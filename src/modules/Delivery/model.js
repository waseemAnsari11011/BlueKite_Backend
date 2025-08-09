const mongoose = require("mongoose");

// Define the DeliveryCharge schema
const deliveryChargeSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor", // Reference to Vendor model
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0, // Ensures that the price cannot be negative
  },
  currency: {
    type: String,
    default: "INR", // Default currency can be INR, or modify as required
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Middleware to update the updated_at field on save
deliveryChargeSchema.pre("save", function (next) {
  this.updated_at = Date.now();
  next();
});

// Create the DeliveryCharge model
const DeliveryCharge = mongoose.model("DeliveryCharge", deliveryChargeSchema);

module.exports = DeliveryCharge;
