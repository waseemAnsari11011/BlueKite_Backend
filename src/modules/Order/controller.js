const Order = require("../Order/model"); // Adjust the path according to your project structure
const Product = require("../Product/model");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Customer = require("../Customer/model");
const { sendPushNotification } = require("../utils/pushNotificationUtil");
const emailService = require("../utils/emailService");
const Vendor = require("../Vendor/model");
const axios = require("axios");

//razorpay
const razorpay = new Razorpay({
  key_id: process.env.KEY_ID,
  key_secret: process.env.KEY_SECRET,
});

exports.createOrderRazorpay = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { customer, vendors, shippingAddress } = req.body;

    // Validate required fields
    if (!customer || !vendors || !shippingAddress) {
      return res
        .status(400)
        .json({ error: "All required fields must be provided" });
    }

    // Validate each vendor and their products
    for (const vendor of vendors) {
      if (!vendor.vendor || !vendor.products) {
        return res.status(400).json({
          error: "Each vendor must have a vendor ID and a list of products",
        });
      }
      for (const product of vendor.products) {
        if (!product.product || !product.quantity || !product.price) {
          return res.status(400).json({
            error: "Each product must have a product ID, quantity, and price",
          });
        }
      }
    }

    for (const vendor of vendors) {
      for (const productInfo of vendor.products) {
        const product = await Product.findById(productInfo.product);
        if (!product) {
          return res.status(400).json({
            error: `Product with ID ${productInfo.product} not found`,
          });
        }
        if (product.quantity < productInfo.quantity) {
          return res.status(400).json({
            error: `Not enough quantity available for product ${product.name}`,
          });
        }
      }
    }

    // Create a new order instance
    const newOrder = new Order({
      customer,
      vendors,
      shippingAddress,
    });

    // Save the order to the database
    const savedOrder = await newOrder.save();

    // Calculate total amount for the order
    let totalAmount = 0;
    savedOrder.vendors.forEach((vendor) => {
      vendor.products.forEach((product) => {
        totalAmount += product.totalAmount;
      });
    });

    // Create Razorpay order
    const options = {
      amount: totalAmount * 100, // Amount in paisa
      currency: "INR",
      receipt: savedOrder._id.toString(),
    };
    const razorpayOrder = await razorpay.orders.create(options);

    await session.commitTransaction();
    session.endSession();

    // Send response with order details and Razorpay order
    res.status(201).json({
      order: savedOrder,
      razorpayOrder,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("error--->>", error);
    res.status(400).json({ error: error.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    // Extract required fields from the request body
    const {
      orderId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      vendors,
    } = req.body;

    console.log("vendors-->>", vendors);

    // Ensure all required fields are present
    if (
      !orderId ||
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the order in the database using the orderId
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Create a hmac object using the key_secret
    const hmac = crypto.createHmac("sha256", razorpay.key_secret);

    // Generate the expected signature
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest("hex");

    // Verify the signature
    if (generated_signature === razorpay_signature) {
      // Update the order status to reflect successful payment
      order.isPaymentVerified = true;
      order.paymentStatus = "Paid";
      order.razorpay_payment_id = razorpay_payment_id;
      order.razorpay_order_id = razorpay_order_id;
      order.razorpay_signature = razorpay_signature;

      // Update product quantities and save the order to the database
      for (const vendor of vendors) {
        for (const productInfo of vendor.products) {
          const product = await Product.findById(productInfo.product);
          product.quantity -= productInfo.quantity;
          await product.save();
        }
      }
    } else {
      // Update the order status to reflect failed payment
      order.isPaymentVerified = false;
      order.paymentStatus = "Unpaid";
    }

    // Save the updated order
    const updatedOrder = await order.save();

    res.status(200).json(updatedOrder);
  } catch (error) {
    console.log("error-->>", error);
    res.status(400).json({ error: error.message });
  }
};

exports.updatePaymentStatusManually = async (req, res) => {
  try {
    console.log("updatePaymentStatus");
    // Extract required fields from the request body
    const { orderId, newStatus } = req.body; // orderId here refers to your custom string ID

    // Ensure all required fields are present
    if (!newStatus || !orderId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the order in the database using the custom orderId field
    // Changed from findById(orderId) to findOne({ orderId: orderId })
    let order = await Order.findOne({ orderId: orderId });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (newStatus === "Paid") {
      order.isPaymentVerified = true;
      order.paymentStatus = "Paid";
    } else {
      order.isPaymentVerified = false;
      order.paymentStatus = "Unpaid";
    }

    // Save the updated order
    const updatedOrder = await order.save();

    res.status(200).json(updatedOrder);
  } catch (error) {
    // It's good practice to log the actual error on the server
    console.error("Error updating payment status manually:", error);
    res.status(400).json({ error: error.message });
  }
};

//

const sendSms = async (phoneNumber, message) => {
  const API = process.env.SMS_API_KEY;
  const url = `https://sms.renflair.in/V1.php?API=${API}&PHONE=${phoneNumber}&OTP=${message}`;
  try {
    const smsResponse = await axios.get(url);
    if (smsResponse.data.status !== "SUCCESS") {
      console.error(
        `SMS sending failed for number: ${phoneNumber}`,
        smsResponse.data
      );
    }
  } catch (smsError) {
    console.error(
      `Error sending SMS to number: ${phoneNumber}`,
      smsError.message
    );
  }
};

exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { customer, vendors, shippingAddress, deliveryCharge } = req.body;
    console.log("deliveryCharge--->>", deliveryCharge);

    // Validate required fields
    if (!customer || !vendors || !shippingAddress) {
      return res
        .status(400)
        .json({ error: "All required fields must be provided" });
    }

    const customerDetails = await Customer.findById(customer);

    // Validate each vendor and their products
    for (const vendor of vendors) {
      if (!vendor.vendor || !vendor.products) {
        return res.status(400).json({
          error: "Each vendor must have a vendor ID and a list of products",
        });
      }
      for (const product of vendor.products) {
        if (!product.product || !product.quantity || !product.price) {
          return res.status(400).json({
            error: "Each product must have a product ID, quantity, and price",
          });
        }
      }
    }

    // Create a new order instance
    const newOrder = new Order({
      customer,
      vendors,
      shippingAddress,
      deliveryCharge,
    });

    // Update product quantities and save the order to the database
    for (const vendor of vendors) {
      for (const productInfo of vendor.products) {
        const product = await Product.findById(productInfo.product);
        if (!product) {
          return res.status(400).json({
            error: `Product with ID ${productInfo.product} not found`,
          });
        }
        if (product.quantity < productInfo.quantity) {
          console.error("error quantity");

          return res.status(400).json({
            error: `Not enough quantity available for product ${product.name}`,
          });
        }
        product.quantity -= productInfo.quantity;
        await product.save({ session });
      }
    }

    // Save the order to the database
    const savedOrder = await newOrder.save({ session });

    // Send new order notification email and SMS to each vendor
    // Send new order notification email and Push Notification to each vendor
    for (const vendor of vendors) {
      // Robustly handle if vendor.vendor is passed as an object instead of an ID string
      let vendorIdRaw = vendor.vendor;
      if (typeof vendorIdRaw === 'object' && vendorIdRaw !== null && vendorIdRaw._id) {
        vendorIdRaw = vendorIdRaw._id;
      }
      const vendorId = new mongoose.Types.ObjectId(vendorIdRaw);

      // Fetch the vendor's details using the vendorId
      const vendorDetails = await Vendor.findById(vendorId);

      if (vendorDetails) {
        // Send email
        await emailService.sendNewOrderNotificationEmail(
          vendorDetails.email,
          savedOrder,
          customerDetails.contactNumber
        );

        // Send Push Notification
        if (vendorDetails.fcmDeviceToken) {
          const title = "New Order Recieved!";
          const body = `You have received a new order with Order ID: ${savedOrder.orderId}. Please check the app for details.`;
          try {
            await sendPushNotification(
              vendorDetails.fcmDeviceToken,
              title,
              body,
              {
                type: "new_order",
                orderId: savedOrder.orderId.toString(),
                mongoOrderId: savedOrder._id.toString()
              }
            );
            console.log(`Push notification sent to vendor ${vendorDetails._id}`);
          } catch (pushError) {
            console.error(
              `Error sending push notification to vendor ${vendorDetails._id}:`,
              pushError.message
            );
          }
        } else {
             console.log(`No FCM token found for vendor ${vendorDetails._id}, skipping push notification.`);
        }
      }
    }
    // Send OTP to the additional hardcoded number
    await sendSms("9554948693", "1111");

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(savedOrder);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ error: error.message });
  }
};

// Controller function to get all orders for a particular vendor

exports.getOrdersByVendor = async (req, res) => {
  try {
    const vendorId = new mongoose.Types.ObjectId(req.params.vendorId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const result = await Order.aggregate([
      // Unwind the vendors array to work with individual vendor documents
      { $unwind: "$vendors" },
      // Match only those documents where the vendor ID matches
      { $match: { "vendors.vendor": vendorId } },
      // Sort immediately after match to ensure consistent order before pagination
      { $sort: { createdAt: -1 } },
      // Use $facet to get both count and paginated data
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limit },
            // Lookup to join customer details
            {
              $lookup: {
                from: "customers", // The name of the customers collection
                localField: "customer",
                foreignField: "_id",
                as: "customerDetails",
              },
            },
            // Unwind the customerDetails array to get the object
            { $unwind: "$customerDetails" },
            // Lookup to join vendor details
            {
              $lookup: {
                from: "vendors", // The name of the vendors collection
                localField: "vendors.vendor",
                foreignField: "_id",
                as: "vendorDetails",
              },
            },
            // Unwind the vendorDetails array to get the object
            { $unwind: "$vendorDetails" },
            // Unwind the products array to work with individual product documents
            { $unwind: "$vendors.products" },
            // Lookup to join product details
            {
              $lookup: {
                from: "products", // The name of the products collection
                localField: "vendors.products.product",
                foreignField: "_id",
                as: "productDetails",
              },
            },
            // Unwind the productDetails array to get the object
            { $unwind: "$productDetails" },
            // Group back the products and vendors
            {
              $group: {
                _id: {
                  orderId: "$orderId",
                  customer: "$customerDetails",
                  shippingAddress: "$shippingAddress",
                  vendor: "$vendorDetails",
                  orderStatus: "$vendors.orderStatus",
                  isPaymentVerified: "$isPaymentVerified",
                  paymentStatus: "$paymentStatus",
                  razorpay_payment_id: "$razorpay_payment_id",
                  deliveryCharge: "$deliveryCharge", // Include delivery charge in grouping
                  createdAt: "$createdAt", // Include createdAt in grouping for consistent sorting after group
                },
                products: {
                  $push: {
                    product: "$productDetails",
                    quantity: "$vendors.products.quantity",
                    price: "$vendors.products.price",
                    discount: "$vendors.products.discount",
                    _id: "$vendors.products._id",
                    totalAmount: "$vendors.products.totalAmount",
                  },
                },
              },
            },
            // Re-sort after grouping to maintain the order based on createdAt
            { $sort: { "_id.createdAt": -1 } },
            // Project to reshape the output document
            {
              $project: {
                _id: 0,
                orderId: "$_id.orderId",
                customer: "$_id.customer",
                shippingAddress: "$_id.shippingAddress",
                isPaymentVerified: "$_id.isPaymentVerified",
                paymentStatus: "$_id.paymentStatus",
                razorpay_payment_id: "$_id.razorpay_payment_id",
                deliveryCharge: "$_id.deliveryCharge", // Add delivery charge to the projection
                createdAt: "$_id.createdAt", // Add createdAt to the projection
                vendors: {
                  vendor: "$_id.vendor",
                  orderStatus: "$_id.orderStatus",
                  products: "$products",
                },
              },
            },
          ],
        },
      },
    ]);

    const orders = result[0].data;
    const totalOrders = result[0].metadata[0] ? result[0].metadata[0].total : 0;
    const totalPages = Math.ceil(totalOrders / limit);


    res.status(200).json({
      success: true,
      data: {
        orders,
        totalOrders,
        currentPage: page,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching orders for vendor: ", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.getRecentOrdersByVendor = async (req, res) => {
  try {
    const vendorId = new mongoose.Types.ObjectId(req.params.vendorId);

    const recentVendorOrders = await Order.aggregate([
      { $unwind: "$vendors" },
      { $match: { "vendors.vendor": vendorId } },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDetails",
        },
      },
      { $unwind: "$customerDetails" },
      {
        $lookup: {
          from: "vendors",
          localField: "vendors.vendor",
          foreignField: "_id",
          as: "vendorDetails",
        },
      },
      { $unwind: "$vendorDetails" },
      { $unwind: "$vendors.products" },
      {
        $lookup: {
          from: "products",
          localField: "vendors.products.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: "$productDetails" },
      {
        $group: {
          _id: {
            orderId: "$_id",
            customer: "$customerDetails",
            shippingAddress: "$shippingAddress",
            vendor: "$vendorDetails",
            orderStatus: "$vendors.orderStatus",
            isPaymentVerified: "$isPaymentVerified",
            paymentStatus: "$paymentStatus",
            razorpay_payment_id: "$razorpay_payment_id",
            createdAt: "$createdAt",
          },
          products: {
            $push: {
              product: "$productDetails",
              quantity: "$vendors.products.quantity",
              price: "$vendors.products.price",
              discount: "$vendors.products.discount",
              _id: "$vendors.products._id",
              totalAmount: "$vendors.products.totalAmount",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          orderId: "$_id.orderId",
          customer: "$_id.customer",
          shippingAddress: "$_id.shippingAddress",
          isPaymentVerified: "$_id.isPaymentVerified",
          paymentStatus: "$_id.paymentStatus",
          razorpay_payment_id: "$_id.razorpay_payment_id",
          createdAt: "$_id.createdAt",
          vendors: {
            vendor: "$_id.vendor",
            orderStatus: "$_id.orderStatus",
            products: "$products",
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
    ]);

    res.status(200).json({
      success: true,
      data: recentVendorOrders,
    });
  } catch (error) {
    console.error("Error fetching recent orders for vendor: ", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId, vendorId } = req.params;
  const { newStatus } = req.body;

  console.log(orderId, vendorId, newStatus);

  try {
    // Find the order by ID and update the status for the specific vendor
    let order = await Order.findOneAndUpdate(
      {
        orderId: orderId,
        "vendors.vendor": new mongoose.Types.ObjectId(vendorId),
      },
      { $set: { "vendors.$.orderStatus": newStatus } },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order or vendor not found" });
    }

    // --- Arrival Time Calculation Logic ---
    if (newStatus === "Processing") {
      try {
        // 1. Get Vendor Location
        const vendorDoc = await Vendor.findById(vendorId);
        if (
          !vendorDoc ||
          !vendorDoc.vendorInfo ||
          !vendorDoc.vendorInfo.address ||
          !vendorDoc.vendorInfo.address.location
        ) {
          console.warn("Vendor location not found for arrival time calculation");
        } else {
          const vendorLocation = vendorDoc.vendorInfo.address.location.coordinates; // [long, lat]

          // 2. Get Customer Location from Order
          if (
            order.shippingAddress &&
            order.shippingAddress.location &&
            order.shippingAddress.location.coordinates
          ) {
            const customerLocation = order.shippingAddress.location.coordinates; // [long, lat]

            // 3. Calculate Distance (Haversine Formula)
            const toRad = (value) => (value * Math.PI) / 180;
            const R = 6371; // Radius of Earth in km
            const dLat = toRad(customerLocation[1] - vendorLocation[1]);
            const dLon = toRad(customerLocation[0] - vendorLocation[0]);
            const lat1 = toRad(vendorLocation[1]);
            const lat2 = toRad(customerLocation[1]);

            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) *
                Math.sin(dLon / 2) *
                Math.cos(lat1) *
                Math.cos(lat2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distanceKm = R * c;

            // 4. Calculate Travel Time (Speed = 30 kmph)
            // Time = Distance / Speed
            const travelTimeHours = distanceKm / 30;
            const travelTimeMinutes = travelTimeHours * 60;

            // 5. Get Max Food Preparation Time
            // We need to find the products for this specific vendor in the order
            const vendorOrderEntry = order.vendors.find(
              (v) => v.vendor.toString() === vendorId
            );

            let maxPrepTime = 0;
            if (vendorOrderEntry && vendorOrderEntry.products) {
              for (const prodEntry of vendorOrderEntry.products) {
                const product = await Product.findById(prodEntry.product);
                if (product && product.foodPreparationTime) {
                  if (product.foodPreparationTime > maxPrepTime) {
                    maxPrepTime = product.foodPreparationTime;
                  }
                }
              }
            }

            // 6. Total Time & Estimated Delivery Date
            const totalTimeMinutes = maxPrepTime + travelTimeMinutes;
            const now = new Date();
            const estimatedDeliveryDate = new Date(
              now.getTime() + totalTimeMinutes * 60000
            );

            // 7. Update Order with Estimated Delivery Date
            // We need to update the specific vendor entry in the array again
            await Order.findOneAndUpdate(
              {
                orderId: orderId,
                "vendors.vendor": new mongoose.Types.ObjectId(vendorId),
              },
              {
                $set: { "vendors.$.estimatedDeliveryDate": estimatedDeliveryDate },
              }
            );
            
            // Refresh order object to return updated data
             order = await Order.findOne({
                orderId: orderId,
             });

          } else {
             console.warn("Customer location not found in order for arrival time calculation");
          }
        }
      } catch (calcError) {
        console.error("Error calculating arrival time:", calcError);
        // Don't block the status update if calculation fails
      }
    }
    // --------------------------------------

    // Extract customer ID from the order
    const customerId = order.customer._id;

    // Retrieve the customer from database to get FCM token
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const fcmtoken = customer.fcmDeviceToken; // Get FCM token from customer

    const title = "Order Status Updated";
    const body = `The status of your order ${orderId} has been updated to ${newStatus}.`;
    try {
      // Assuming you have a function or service to send push notifications
      let pushNotificationRes = await sendPushNotification(
        fcmtoken,
        title,
        body
      );
      console.log("Push notification response:", pushNotificationRes);
    } catch (error) {
      console.error("Error sending push notification:", error);
    }

    res.json(order);
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getOrdersByCustomerAndStatus = async (req, res) => {
  const { customerId } = req.params;
  const { status } = req.query;

  try {
    // Convert customerId to a mongoose ObjectId
    const customerObjectId = new mongoose.Types.ObjectId(customerId);

    // Use aggregation pipeline to filter orders and vendors by status and lookup product details
    const orders = await Order.aggregate([
      {
        $match: {
          customer: customerObjectId,
          "vendors.orderStatus": status,
        },
      },
      {
        $unwind: "$vendors",
      },
      {
        $unwind: "$vendors.products",
      },
      {
        $match: {
          "vendors.orderStatus": status,
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "vendors.products.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $unwind: "$productDetails",
      },
      {
        $group: {
          _id: "$_id",
          customer: { $first: "$customer" },
          shippingAddress: { $first: "$shippingAddress" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          vendors: {
            $push: {
              vendor: "$vendors.vendor",
              products: {
                product: "$productDetails",
                quantity: "$vendors.products.quantity",
                price: "$vendors.products.price",
                discount: "$vendors.products.discount",
                _id: "$vendors.products._id",
                totalAmount: "$vendors.products.totalAmount",
              },
              orderStatus: "$vendors.orderStatus",
              _id: "$vendors._id",
            },
          },
        },
      },
      {
        $match: {
          vendors: { $ne: [] }, // Ensure there are vendors with the specified status
        },
      },
    ]);

    // Check if orders exist
    if (!orders || orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found for the specified customer and status",
      });
    }

    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getOrdersByCustomerId = async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const orders = await Order.find({ customer: customerId })
      .populate("customer")
      .populate("vendors.vendor")
      .populate("vendors.products.product")
      .exec();
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getStatsForDateRange = async (req, res) => {
  try {
    const { from, to } = req.query; // e.g. ?from=2025-11-01&to=2025-11-27

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "Please provide both 'from' and 'to' dates.",
      });
    }

    // 1. Set Start Date (00:00:00)
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);

    // 2. Set End Date (23:59:59) - Inclusive of the last day
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    const stats = await Order.aggregate([
      // 1. Match orders within the date range first (Optimization)
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },

      // 2. Unwind vendors to filter specific vendor statuses
      // (Since an order can have multiple vendors with different statuses)
      { $unwind: "$vendors" },

      // 3. FILTER: Only allow 'Delivered' orders
      {
        $match: {
          "vendors.orderStatus": "Delivered",
        },
      },

      // 4. Unwind products to calculate revenue
      { $unwind: "$vendors.products" },

      // 5. Group to calculate totals
      {
        $group: {
          _id: null,
          // count distinct orders (in case multiple vendors in one order are delivered)
          totalOrders: { $addToSet: "$_id" },
          totalRevenue: { $sum: "$vendors.products.totalAmount" },
        },
      },

      // 6. Format the output
      {
        $project: {
          _id: 0,
          from: from,
          to: to,
          totalOrders: { $size: "$totalOrders" },
          totalRevenue: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: stats[0] || {
        from,
        to,
        totalOrders: 0,
        totalRevenue: 0,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch order stats",
      error: error.message,
    });
  }
};
