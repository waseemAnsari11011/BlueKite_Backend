const Notification = require("./model");
const Customer = require("../Customer/model");
const { sendPushNotification } = require("../utils/pushNotificationUtil");
const {
  extractS3KeyFromUrl,
  deleteS3Objects,
} = require("../Middleware/s3DeleteUtil");

exports.sendNotificationToAll = async (req, res) => {
  try {
    const { title, body } = req.body;
    const senderId = req.user.id;

    console.log("senderId===>>>", senderId);

    // DEBUG: Check what's in the request
    console.log("req.file===>>>", req.file);
    console.log("req.files===>>>", req.files);
    console.log("req.body===>>>", req.body);

    if (!title || !body) {
      return res
        .status(400)
        .json({ success: false, message: "Title and body are required." });
    }

    // Get image URL from uploaded file (if any)
    let imageUrl = null;
    if (req.file) {
      // Single file upload uses req.file
      imageUrl = req.file.location;
      console.log("imageUrl from req.file===>>>", imageUrl);
    } else if (req.files && req.files.length > 0) {
      // Multiple files upload uses req.files
      imageUrl = req.files[0].location;
      console.log("imageUrl from req.files===>>>", imageUrl);
    }

    console.log("Final imageUrl===>>>", imageUrl);

    // 1. Get all customer FCM tokens
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

    // 2. Send notification via FCM with optional image
    const dataPayload = { type: "marketing", screen: "Home" };
    await sendPushNotification(tokens, title, body, dataPayload, imageUrl);

    // 3. Log the notification
    const newNotification = new Notification({
      title,
      body,
      imageUrl,
      sender: senderId,
      senderModel: "Vendor",
      targetAudience: "all",
      recipientCount: tokens.length,
    });
    await newNotification.save();

    res.status(200).json({
      success: true,
      message: `Notification sent to ${tokens.length} customers.`,
      notification: newNotification,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get notification history
exports.getNotificationHistory = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ sender: senderId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Notification.countDocuments({ sender: senderId });

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalNotifications: total,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single notification by ID
exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const senderId = req.user.id;

    const notification = await Notification.findOne({
      _id: id,
      sender: senderId,
    }).lean();

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Resend notification
exports.resendNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const senderId = req.user.id;

    // Find the original notification
    const originalNotification = await Notification.findOne({
      _id: id,
      sender: senderId,
    }).lean();

    if (!originalNotification) {
      return res.status(404).json({
        success: false,
        message: "Original notification not found.",
      });
    }

    // Get all customer FCM tokens
    const customers = await Customer.find({ fcmDeviceToken: { $ne: null } })
      .select("fcmDeviceToken")
      .lean();

    const tokens = customers.map((c) => c.fcmDeviceToken);

    if (tokens.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No customers available to notify." });
    }

    // Send notification
    const dataPayload = { type: "marketing", screen: "Home" };
    await sendPushNotification(
      tokens,
      originalNotification.title,
      originalNotification.body,
      dataPayload,
      originalNotification.imageUrl
    );

    // Create new notification record
    const newNotification = new Notification({
      title: originalNotification.title,
      body: originalNotification.body,
      imageUrl: originalNotification.imageUrl,
      sender: senderId,
      senderModel: "Vendor",
      targetAudience: "all",
      recipientCount: tokens.length,
      isResend: true,
      originalNotificationId: id,
    });
    await newNotification.save();

    res.status(200).json({
      success: true,
      message: `Notification resent to ${tokens.length} customers.`,
      notification: newNotification,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const senderId = req.user.id;

    const notification = await Notification.findOne({
      _id: id,
      sender: senderId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    // Delete image from S3 if exists
    if (notification.imageUrl) {
      const s3Key = extractS3KeyFromUrl(notification.imageUrl);
      if (s3Key) {
        await deleteS3Objects([s3Key]);
      }
    }

    await Notification.deleteOne({ _id: id });

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
