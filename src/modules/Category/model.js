// Import mongoose
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the Category Schema
const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // ADD THIS FIELD:
    // This links the category to a specific vendor
    vendor: {
      type: Schema.Types.ObjectId, // Stores the Vendor's _id
      ref: "Vendor", // Tells Mongoose this references the 'Vendor' model
      required: true,
    },
    images: {
      type: [String], // Array of strings to store image URLs or paths
      validate: [arrayLimit, "{PATH} exceeds the limit of 10"],
    },
    imagesS3: {
      type: [String],
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt timestamps
  }
);

// Custom validator to limit array size
function arrayLimit(val) {
  return val.length <= 10;
}

// ADD THIS INDEX:
// This is critical for your requirement.
// It ensures the 'name' is unique *per vendor*.
// - Vendor A can have a "Shirts" category.
// - Vendor B can also have a "Shirts" category.
// - But Vendor A cannot have two "Shirts" categories.
categorySchema.index({ vendor: 1, name: 1 }, { unique: true });

// Create the Category Model
const Category = mongoose.model("Category", categorySchema);

// Export the Category Model
module.exports = Category;
