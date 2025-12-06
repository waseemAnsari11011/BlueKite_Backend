const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");

// Define the schema
const vendorSchema = new Schema({
  name: {
    type: String,
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  shopImages: {
    type: [String], // Array of S3 URLs
    default: [],
  },
  vendorInfo: {
    businessName: {
      type: String,
    },
    contactNumber: {
      type: String,
      required: true,
    },
    address: {
      addressLine1: {
        type: String,
      },
      addressLine2: String,
      city: {
        type: String,
      },
      state: {
        type: String,
      },
      country: {
        type: String,
      },
      postalCode: {
        type: String,
      },
      location: {
        type: {
          type: String,
          enum: ["Point"], // 'location.type' must be 'Point'
          default: "Point",
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          default: [0, 0],
        },
      },
    },
  },
  serviceRadius: {
    type: Number, // Service radius in kilometers
    default: 5, // Default service radius (e.g., 5km)
  },
  isOperational: {
    type: Boolean, // Is the vendor open and accepting orders?
    default: true,
  },
  role: {
    type: String,
    default: "vendor",
  },
  isRestricted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
});

// Method to compare passwords
vendorSchema.methods.comparePassword = async function (candidatePassword) {
  console.log("candidatePassword", candidatePassword);
  return bcrypt.compare(candidatePassword, this.password);
};

// Add 2dsphere index
vendorSchema.index({ "vendorInfo.address.location": "2dsphere" });

// Create the model
const Vendor = mongoose.model("Vendor", vendorSchema);

module.exports = Vendor;
