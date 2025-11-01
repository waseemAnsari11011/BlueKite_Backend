const Vendor = require("./model.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
// ✅ Import S3 delete utils
const {
  deleteS3Objects,
  extractS3KeyFromUrl,
} = require("../Middleware/s3DeleteUtil");
require("dotenv").config();
const secret = process.env.JWT_SECRET;

// Controller function to create a new vendor
exports.createVendor = async (req, res) => {
  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // Create a new vendor with the hashed password
    const newVendor = new Vendor({
      name: req.body.name,
      password: hashedPassword,
      email: req.body.email,
      vendorInfo: req.body.vendorInfo,
      role: "vendor",
    });

    // Save the new vendor to the database
    await newVendor.save();

    res.status(201).send(newVendor);
  } catch (error) {
    console.log("error===>>", error);
    res.status(400).send(error);
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

    const imagesToKeep = existingShopImages
      ? Array.isArray(existingShopImages)
        ? existingShopImages
        : [existingShopImages]
      : [];

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
    let { name, email, vendorInfo, password } = req.body;

    if (name) vendor.name = name;
    if (email) vendor.email = email;

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
