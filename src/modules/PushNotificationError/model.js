const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const pushNotificationErrorSchema = new Schema(
  {
    // When the error occurred
    createdAt: {
      type: Date,
      default: Date.now,
      // This automatically deletes any document after 30 days.
      expires: "30d",
    },

    // The error details
    error: {
      code: { type: String },
      message: { type: String },
    },

    // The notification content that failed
    notification: {
      title: { type: String },
      body: { type: String },
      imageUrl: { type: String },
    },

    // The specific token that failed
    token: {
      type: String,
      index: true, // Index for faster searching by token
    },

    // --- START: NEW FIELD ---
    // Link to the customer who owns the token
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      index: true, // Index for faster searching by customer
    },
    // --- END: NEW FIELD ---
  },
  {
    // Use 'createdAt' as the timestamp
    timestamps: { createdAt: "createdAt", updatedAt: false },
  }
);

// Ensure the TTL index is created
pushNotificationErrorSchema.index({ createdAt: 1 }, { expireAfterSeconds: 0 });

const PushNotificationError = mongoose.model(
  "PushNotificationError",
  pushNotificationErrorSchema
);

module.exports = PushNotificationError;
