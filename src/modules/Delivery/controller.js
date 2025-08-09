const DeliveryCharge = require("./model"); // Import the DeliveryCharge model

// Create a new delivery charge
exports.createDeliveryCharge = async (req, res) => {
  try {
    const { price, currency } = req.body;

    // Ensure the logged-in user is a vendor
    if (
      !req.user ||
      (req.user.role !== "vendor" && req.user.role !== "admin")
    ) {
      return res
        .status(403)
        .json({ message: "Only vendors can create delivery charges." });
    }

    // Validate input
    if (!price || price <= 0) {
      return res
        .status(400)
        .json({ message: "Price must be a positive number" });
    }

    const newDeliveryCharge = new DeliveryCharge({
      vendor: req.user.id, // vendor ID from JWT payload
      price,
      currency,
    });

    await newDeliveryCharge.save();

    res.status(201).json({
      message: "Delivery charge created successfully",
      data: newDeliveryCharge,
    });
  } catch (error) {
    res.status(400).json({
      message: "Error creating delivery charge",
      error: error.message,
    });
  }
};

// Get all delivery charges
exports.getDeliveryCharges = async (req, res) => {
  try {
    const deliveryCharges = await DeliveryCharge.find();
    res.status(200).json(deliveryCharges);
  } catch (error) {
    res.status(500).json({
      message: "Error retrieving delivery charges",
      error: error.message,
    });
  }
};

// Get a single delivery charge by ID
exports.getDeliveryChargeById = async (req, res) => {
  try {
    const { id } = req.params;

    const deliveryCharge = await DeliveryCharge.findById(id);

    if (!deliveryCharge) {
      return res.status(404).json({ message: "Delivery charge not found" });
    }

    res.status(200).json(deliveryCharge);
  } catch (error) {
    res.status(500).json({
      message: "Error retrieving delivery charge",
      error: error.message,
    });
  }
};

// Update a delivery charge by ID
exports.updateDeliveryCharge = async (req, res) => {
  try {
    const { id } = req.params;
    const { price, currency } = req.body;

    // Validate price
    if (price <= 0) {
      return res
        .status(400)
        .json({ message: "Price must be a positive number" });
    }

    const updatedDeliveryCharge = await DeliveryCharge.findByIdAndUpdate(
      id,
      {
        price,
        currency,
        updated_at: Date.now(),
      },
      { new: true }
    );

    if (!updatedDeliveryCharge) {
      return res.status(404).json({ message: "Delivery charge not found" });
    }

    res.status(200).json({
      message: "Delivery charge updated successfully",
      data: updatedDeliveryCharge,
    });
  } catch (error) {
    res.status(400).json({
      message: "Error updating delivery charge",
      error: error.message,
    });
  }
};

// Delete a delivery charge by ID
exports.deleteDeliveryCharge = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedDeliveryCharge = await DeliveryCharge.findByIdAndDelete(id);

    if (!deletedDeliveryCharge) {
      return res.status(404).json({ message: "Delivery charge not found" });
    }

    res.status(200).json({ message: "Delivery charge deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting delivery charge",
      error: error.message,
    });
  }
};
