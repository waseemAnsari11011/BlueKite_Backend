const Notification = require("./model");
const Customer = require("../Customer/model"); // Import Customer model
const { sendPushNotification } = require("../utils/pushNotificationUtil");

exports.sendNotificationToAll = async (req, res) => {
  try {
    const { title, body } = req.body;

    // req.user comes from your authMiddleware
    // It is the logged-in admin or vendor from the 'Vendor' collection
    const senderId = req.user.id;

    console.log("senderId===>>>", senderId);

    if (!title || !body) {
      return res
        .status(400)
        .json({ success: false, message: "Title and body are required." });
    }

    // 1. Get all customer FCM tokens
    // We get these from the 'Customer' model (which you called 'User' model)
    const customers = await Customer.find({ fcmDeviceToken: { $ne: null } })
      .select("fcmDeviceToken")
      .lean();

    console.log("customers===>>>", customers);

    const tokens = customers.map((c) => c.fcmDeviceToken);
    console.log("tokens===>>>", tokens);

    if (tokens.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No customers available to notify." });
    }

    // 2. Send notification via FCM
    const dataPayload = { type: "marketing", screen: "Home" };
    await sendPushNotification(tokens, title, body, dataPayload);

    // 3. Log the notification (with corrected logic)
    const newNotification = new Notification({
      title,
      body,
      sender: senderId, // The ID of the admin/vendor
      senderModel: "Vendor", // This is now correct. It always points to the 'Vendor' model.
      targetAudience: "all",
    });
    await newNotification.save();

    res.status(200).json({
      success: true,
      message: `Notification sent to ${tokens.length} customers.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
