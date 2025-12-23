const Vendor = require("./model.js");
const Product = require("../Product/model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
// ✅ Import S3 delete utils
const {
  deleteS3Objects,
  extractS3KeyFromUrl,
} = require("../Middleware/s3DeleteUtil");
const crypto = require("crypto");
const { sendResetPasswordEmail } = require("../utils/emailService");
require("dotenv").config();
const secret = process.env.JWT_SECRET;

const NodeGeocoder = require("node-geocoder");
const options = {
  provider: "google",
  apiKey: process.env.GOOGLE_MAPS_API_KEY, // From your .env file
  formatter: null,
};
const geocoder = NodeGeocoder(options);

// Controller function to create a new vendor
exports.createVendor = async (req, res) => {
  try {
    // 1. Get file locations from S3 middleware (if any)
    const shopImageLocations = req.files
      ? req.files.map((file) => file.location)
      : [];

    // 2. Get text data from req.body
    const { name, password, email, vendorInfo } = req.body;

    // 3. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Parse vendorInfo (it's stringified JSON from FormData)
    let parsedVendorInfo = {};
    if (vendorInfo) {
      try {
        parsedVendorInfo = JSON.parse(vendorInfo);
      } catch (e) {
        console.error("Failed to parse vendorInfo:", e);
        return res.status(400).send({ error: "Invalid vendorInfo format." });
      }
    }

    // --- NEW: Geocode Address ---
    let location = {
      type: "Point",
      coordinates: [0, 0], // Default
    };

    // Extract address from parsedVendorInfo
    const { address } = parsedVendorInfo;

    if (address && address.addressLine1 && address.postalCode) {
      try {
        const fullAddress = `${address.addressLine1}, ${address.city}, ${address.state} ${address.postalCode}, ${address.country}`;
        const geoResult = await geocoder.geocode(fullAddress);

        if (geoResult && geoResult.length > 0) {
          location.coordinates = [
            geoResult[0].longitude,
            geoResult[0].latitude,
          ];
        }
      } catch (geoError) {
        console.error("Geocoding failed:", geoError.message);
        // Don't block registration, just log the error and save with default [0,0]
      }
    }
    // --- END NEW ---

    // 5. Create a new vendor
    const newVendor = new Vendor({
      name: name,
      password: hashedPassword,
      email: email,
      vendorInfo: {
        businessName: parsedVendorInfo.businessName,
        contactNumber: parsedVendorInfo.contactNumber,
        businessName: parsedVendorInfo.businessName,
        contactNumber: parsedVendorInfo.contactNumber,
        address: {
          ...parsedVendorInfo.address,
          location: location, // <-- Save the geocoded location inside address
        },
      },
      shopImages: shopImageLocations,
      role: "vendor",
      // serviceRadius and isOperational will use the defaults from your model
    });

    // 6. Save the new vendor to the database
    await newVendor.save();

    res.status(201).send(newVendor);
  } catch (error) {
    console.log("error===>>", error);
    // Handle duplicate email error
    if (error.code === 11000) {
      return res.status(400).send({ error: "Email already exists." });
    }
    res.status(400).send(error);
  }
};

// Controller function to update a vendor by ID
exports.updateVendor = async (req, res) => {
  // 1. Security Check
  if (req.user.id !== req.params.id && req.user.role !== "admin") {
    return res
      .status(403)
      .send({ error: "Access denied. You can only update your own account." });
  }

  try {
    // 2. Find Vendor
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).send({ error: "Vendor not found" });
    }

    // 3. Handle Shop Image Updates
    const { existingShopImages } = req.body;
    const currentImages = vendor.shopImages || [];
    let imagesToKeep;

    // Fix for partial updates (e.g. serviceRadius only):
    // If request is NOT multipart and existingShopImages is undefined, preserve current images.
    if (!req.is('multipart/form-data') && existingShopImages === undefined) {
      imagesToKeep = currentImages;
    } else {
      imagesToKeep = existingShopImages
        ? Array.isArray(existingShopImages)
          ? existingShopImages
          : [existingShopImages]
        : [];
    }

    const imagesToDelete = currentImages.filter(
      (url) => !imagesToKeep.includes(url)
    );

    if (imagesToDelete.length > 0) {
      const keysToDelete = imagesToDelete
        .map(extractS3KeyFromUrl)
        .filter((key) => key);
      if (keysToDelete.length > 0) {
        await deleteS3Objects(keysToDelete);
      }
    }

    const newImageLocations = req.files
      ? req.files.map((file) => file.location)
      : [];

    vendor.shopImages = [...imagesToKeep, ...newImageLocations];

    // 4. Handle Text & Other Data Updates
    let { name, email, vendorInfo, password, serviceRadius } = req.body;

    if (name) vendor.name = name;
    if (email) vendor.email = email;
    if (serviceRadius) vendor.serviceRadius = serviceRadius;

    // --- START: Parse vendorInfo from formData ---
    if (vendorInfo) {
      try {
        const parsedVendorInfo = JSON.parse(vendorInfo);

        // Ensure vendorInfo object exists before assigning
        if (!vendor.vendorInfo) {
          vendor.vendorInfo = {};
        }

        // Check and assign properties individually
        if (parsedVendorInfo.businessName !== undefined) {
          vendor.vendorInfo.businessName = parsedVendorInfo.businessName;
        }
        if (parsedVendorInfo.contactNumber !== undefined) {
          vendor.vendorInfo.contactNumber = parsedVendorInfo.contactNumber;
        }

        // --- NEW: Handle Address Update & Geocoding ---
        if (parsedVendorInfo.address) {
          const { address } = parsedVendorInfo;
          
          // Initialize location with default or existing values
          let location = {
             type: "Point",
             coordinates: [0, 0]
          };

          // If we have a valid address to geocode
          if (address.addressLine1 && address.postalCode) {
            try {
              const fullAddress = `${address.addressLine1}, ${address.city}, ${address.state} ${address.postalCode}, ${address.country}`;
              const geoResult = await geocoder.geocode(fullAddress);

              if (geoResult && geoResult.length > 0) {
                location.coordinates = [
                  geoResult[0].longitude,
                  geoResult[0].latitude,
                ];
              }
            } catch (geoError) {
              console.error("Geocoding failed during update:", geoError.message);
              // Keep default [0,0] or handle as needed
            }
          }

          // Update the address object in vendorInfo
          vendor.vendorInfo.address = {
            ...address,
            location: location
          };
        }
        // --- END NEW ---
      } catch (e) {
        console.error("Failed to parse vendorInfo:", e);
        return res.status(400).send({ error: "Invalid vendorInfo format." });
      }
    }
    // --- END: Parse vendorInfo ---

    // 5. Handle Password Update
    if (password) {
      vendor.password = await bcrypt.hash(password, 10);
    }

    // 6. Save and Respond
    const updatedVendor = await vendor.save();

    // Return the updated vendor (which includes the new shopImages array)
    res.status(200).send(updatedVendor);
  } catch (error) {
    console.error("Error updating vendor:", error);
    res
      .status(400)
      .send({ error: "Failed to update vendor", details: error.message });
  }
};

// Controller function for vendor login
exports.vendorLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find vendor by email
    const vendor = await Vendor.findOne({ email });

    // Check if vendor exists
    if (!vendor) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if the vendor is restricted
    if (vendor.isRestricted) {
      return res.status(403).json({
        message: "Your account is restricted. Please contact support.",
      });
    }

    // Check if password matches
    const isPasswordMatch = await vendor.comparePassword(password);
    console.log("isPasswordMatch==>>", isPasswordMatch);

    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: vendor._id, role: vendor.role }, secret);

    // Vendor authenticated successfully
    res
      .status(200)
      .json({ message: "Vendor authenticated successfully", vendor, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Controller to fetch all vendors with role 'vendor'
exports.getAllVendors = async (req, res) => {
  try {
    // Fetch only vendors with the role 'vendor'
    const vendors = await Vendor.find({ role: "vendor" });
    console.log("vendors api", vendors);
    res.status(200).send(vendors);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Controller function to get a vendor by ID
exports.getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).send();
    }
    res.status(200).send(vendor);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Controller function to delete a vendor by ID
exports.deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) {
      return res.status(404).send();
    }
    res.status(200).send(vendor);
  } catch (error) {
    res.status(500).send(error);
  }
};

//restrict vendor login
exports.restrictVendor = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the vendor by ID and update the isRestricted field to true
    const updatedVendor = await Vendor.findByIdAndUpdate(
      id,
      { isRestricted: true },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    // Send response confirming the update
    res.status(200).json({
      message: "Vendor restricted successfully",
      vendor: updatedVendor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to restrict vendor",
      error: error.message,
    });
  }
};

//Un-restrict vendor login
exports.unRestrictVendor = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the vendor by ID and update the isRestricted field to true
    const updatedVendor = await Vendor.findByIdAndUpdate(
      id,
      { isRestricted: false },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    // Send response confirming the update
    res.status(200).json({
      message: "Vendor unrestricted successfully",
      vendor: updatedVendor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to unrestrict vendor",
      error: error.message,
    });
  }
};

// Controller function to get vendors near a customer
exports.getVendorsNearMe = async (req, res) => {
  console.log("it is called!!");
  const { lat, long } = req.query;
  console.log(`Request Params - Lat: ${lat}, Long: ${long}`);

  if (!lat || !long) {
    return res
      .status(400)
      .send({ error: "Latitude and longitude are required." });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(long);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).send({ error: "Invalid latitude or longitude." });
  }

  try {
    // DEBUG: Dump all vendors to see what's in the DB
    const allVendorsInDb = await Vendor.find({});
    console.log(`--- DEBUG: Dumping ${allVendorsInDb.length} Vendors from DB ---`);
    allVendorsInDb.forEach(v => {
      const loc = v.vendorInfo?.address?.location;
      console.log(`ID: ${v._id}, Name: ${v.name}`);
      console.log(`   Coords: ${JSON.stringify(loc?.coordinates)}, Type: ${loc?.type}`);
      console.log(`   isOperational: ${v.isOperational}, Role: ${v.role}, ServiceRadius: ${v.serviceRadius}`);
    });
    console.log("------------------------------------------------");

    // 1. Get all nearby vendors without filtering by radius yet
    const allNearbyVendors = await Vendor.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          key: "vendorInfo.address.location",
          distanceField: "distance",
          spherical: true,
          query: {
            isOperational: true,
            role: { $in: ["vendor", "admin"] },
          },
        },
      },
      // Removed $match stage to debug
    ]);

    console.log(`Found ${allNearbyVendors.length} vendors nearby (via $geoNear):`);
    allNearbyVendors.forEach(v => {
      console.log(`- Vendor: ${v.name}, Dist: ${v.distance.toFixed(2)}m, Radius: ${v.serviceRadius}km`);
    });

    // 2. Filter in JS
    const vendors = allNearbyVendors.filter(v => {
      const radiusInMeters = (v.serviceRadius || 5) * 1000;
      return v.distance <= radiusInMeters;
    });

    console.log(`Returning ${vendors.length} vendors after radius filter.`);

    res.status(200).send(vendors);
  } catch (error) {
    console.error("Error finding vendors near_me:", error);
    res.status(500).send({ message: error.message, error: error });
  }
};

// Controller function to get vendors with discounted products
exports.getDiscountedVendors = async (req, res) => {
  try {
    const { lat, long } = req.query;

    // 1. Find all products with a discount > 0
    const discountedProducts = await Product.find({ discount: { $gt: 0 } }).select("vendor");
    
    // 2. Extract unique vendor IDs and cast to ObjectId
    const vendorIds = [...new Set(discountedProducts.map(p => p.vendor.toString()))].map(id => new mongoose.Types.ObjectId(id));

    let vendors;

    // 3. If location is provided, filter by proximity and service radius
    if (lat && long) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(long);

      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Invalid latitude or longitude." });
      }

      vendors = await Vendor.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            key: "vendorInfo.address.location",
            distanceField: "distance",
            spherical: true,
            query: {
              _id: { $in: vendorIds },
              isOperational: true,
              role: { $in: ["vendor", "admin"] },
            },
          },
        },
        {
          $match: {
            $expr: {
              $lte: ["$distance", { $multiply: [{ $ifNull: ["$serviceRadius", 5] }, 1000] }],
            },
          },
        },
      ]);
    } else {
      vendors = await Vendor.find({
        _id: { $in: vendorIds },
        role: { $in: ["vendor", "admin"] },
        isOperational: true
      });
    }

    res.status(200).json(vendors);
  } catch (error) {
    console.error("Error fetching discounted vendors:", error);
    res.status(500).json({ message: "Failed to fetch discounted vendors", error: error.message });
  }
};

// Controller function to get new arrival vendors
exports.getNewArrivalVendors = async (req, res) => {
  try {
    const { lat, long } = req.query;
    let vendors;

    // If location is provided, filter by proximity and service radius
    if (lat && long) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(long);

      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Invalid latitude or longitude." });
      }

      vendors = await Vendor.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            key: "vendorInfo.address.location",
            distanceField: "distance",
            spherical: true,
            query: {
              isOperational: true,
              role: { $in: ["vendor", "admin"] },
            },
          },
        },
        {
          $match: {
            $expr: {
              $lte: ["$distance", { $multiply: [{ $ifNull: ["$serviceRadius", 5] }, 1000] }],
            },
          },
        },
        {
          $sort: { createdAt: -1 }
        }
      ]);
    } else {
      // Fetch vendors sorted by createdAt descending
      vendors = await Vendor.find({
        role: { $in: ["vendor", "admin"] },
        isOperational: true
      }).sort({ createdAt: -1 });
    }

    res.status(200).json(vendors);
  } catch (error) {
    console.error("Error fetching new arrival vendors:", error);
    res.status(500).json({ message: "Failed to fetch new arrival vendors", error: error.message });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate token
    const token = crypto.randomBytes(20).toString("hex");

    // Set token and expiry (1 hour)
    vendor.resetPasswordToken = token;
    vendor.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await vendor.save();

    // Create reset URL (Frontend URL)
    // Assuming frontend is running on localhost:3000 or similar for now, or just sending the token
    // Ideally this should be an environment variable like FRONTEND_URL
    const resetUrl = `http://localhost:3000/#/reset-password/${token}`;

    await sendResetPasswordEmail(vendor.email, resetUrl);

    res.status(200).json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const vendor = await Vendor.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!vendor) {
      return res.status(400).json({ message: "Password reset token is invalid or has expired" });
    }

    // Hash new password
    vendor.password = await bcrypt.hash(password, 10);
    vendor.resetPasswordToken = undefined;
    vendor.resetPasswordExpires = undefined;

    await vendor.save();

    res.status(200).json({ message: "Password has been reset" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update FCM Token
exports.updateFcmToken = async (req, res) => {
  const { id } = req.params;
  const { fcmToken } = req.body;

  try {
    const vendor = await Vendor.findByIdAndUpdate(
      id,
      { fcmDeviceToken: fcmToken },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.status(200).json({ message: "FCM Token updated successfully", vendor });
  } catch (error) {
    console.error("Error updating FCM token:", error);
    res.status(500).json({ message: "Failed to update FCM token", error: error.message });
  }
};
