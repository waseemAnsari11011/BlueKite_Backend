const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor", // It will always reference the Vendor model
      required: true,
    },
    senderModel: {
      type: String,
      required: true,
      enum: ["Vendor"], // This makes it clear
      default: "Vendor",
    },
    targetAudience: {
      type: String,
      enum: ["all"],
      default: "all",
    },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
