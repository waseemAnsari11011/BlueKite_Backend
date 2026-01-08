const mongoose = require("mongoose");
require("dotenv").config();

// Define minimal schemas to avoid importing the whole app structure if not needed,
// but it's safer to use the actual models if possible.
// Given strict file access, I will try to require the models from their paths.
// If that fails due to dependencies, I will define ad-hoc schemas.

const Order = require("./src/modules/Order/model");
const Customer = require("./src/modules/Customer/model");
const Vendor = require("./src/modules/Vendor/model");
const Product = require("./src/modules/Product/model");

const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

async function checkOrder() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const orderId = "695f99dc439a6fc7daf8bedf"; // The ID provided by the user
    console.log(`Checking Order ID: ${orderId}`);

    // Fetch the raw order first
    const order = await Order.findById(orderId);
    if (!order) {
      console.log("Order NOT FOUND in database.");
      return;
    }
    console.log("Order FOUND.");
    console.log("Order Customer ID:", order.customer);
    console.log("Order Vendors Count:", order.vendors.length);

    // Simulate Controller Query
    const customerIdStr = order.customer.toString();
    console.log(`Simulating controller query for Customer ID: ${customerIdStr}`);
    const orders = await Order.find({ customer: customerIdStr })
      .populate("customer")
      .populate("vendors.vendor")
      .populate("vendors.products.product")
      .exec();
    
    const foundInQuery = orders.find(o => o._id.toString() === orderId);
    if (foundInQuery) {
        console.log("SUCCESS: Order found in customer query.");
        console.log(`Total orders found for customer: ${orders.length}`);
        
        // Inspect Populated Data
        foundInQuery.vendors.forEach((v, i) => {
            console.log(`--- Vendor [${i}] ---`);
            if (v.vendor) {
                console.log(`Vendor ID: ${v.vendor._id}`);
                console.log(`Vendor Name: ${v.vendor.name}`);
                console.log(`Vendor Email: ${v.vendor.email}`);
            } else {
                console.error(`ERROR: Vendor at index ${i} is NULL after populate!`); 
                // This would cause the app to crash or not render if accessing properties
            }

            v.products.forEach((p, j) => {
                console.log(`   --- Product [${j}] ---`);
                if (p.product) {
                    console.log(`   Product Name: ${p.product.name}`);
                } else {
                     console.warn(`   WARNING: Product at index ${j} is NULL (Product Unavailable)`);
                }
            });
        });

    } else {
        console.error("FAILURE: Order NOT found in customer query!");
        console.log(`Total orders found for customer: ${orders.length}`);
        console.log("Orders found IDs:", orders.map(o => o._id.toString()));
    }

    // Check Customer
    const customer = await Customer.findById(order.customer);
    if (!customer) {
      console.error("CRITICAL: Customer referenced in order does NOT exist!");
    } else {
      console.log("Customer exists:", customer.name || customer.email || customer._id);
    }

    // Check Vendors and Products
    for (const vendorEntry of order.vendors) {
      const vendorId = vendorEntry.vendor;
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        console.error(`CRITICAL: Vendor ${vendorId} referenced in order does NOT exist!`);
      } else {
        console.log(`Vendor ${vendorId} exists.`);
      }

      for (const productEntry of vendorEntry.products) {
        const productId = productEntry.product;
        const product = await Product.findById(productId);
        if (!product) {
          console.error(`CRITICAL: Product ${productId} referenced in order does NOT exist!`);
        } else {
          console.log(`Product ${productId} exists.`);
        }
      }
    }

    // Attempt populate to see if it fails or returns nulls
    console.log("Attempting full populate...");
    const populatedOrder = await Order.findById(orderId)
      .populate("customer")
      .populate("vendors.vendor")
      .populate("vendors.products.product");
    
    // Check if any populated field is null
    if (!populatedOrder.customer) console.error("Populated customer is null");
    
    populatedOrder.vendors.forEach((v, i) => {
        if (!v.vendor) console.error(`Populated vendor at index ${i} is null`);
        v.products.forEach((p, j) => {
            if (!p.product) console.error(`Populated product at index ${i}, product ${j} is null`);
        });
    });

    console.log("Check complete.");

  } catch (error) {
    console.error("Error during check:", error);
  } finally {
    await mongoose.disconnect();
  }
}

checkOrder();
