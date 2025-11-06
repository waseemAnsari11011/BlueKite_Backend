const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    imageUrl: { type: String, default: null }, // S3 image URL
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    senderModel: {
      type: String,
      required: true,
      enum: ["Vendor"],
      default: "Vendor",
    },
    targetAudience: {
      type: String,
      enum: ["all"],
      default: "all",
    },
    recipientCount: {
      type: Number,
      default: 0,
    }, // Number of recipients who received the notification
    isResend: {
      type: Boolean,
      default: false,
    }, // Flag to indicate if this is a resent notification
    originalNotificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      default: null,
    }, // Reference to original notification if resent
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
