const admin = require("firebase-admin");
const serviceAccount = require("../../../firebaseConfig.json");
// --- 1. IMPORT THE ERROR MODEL ---
const PushNotificationError = require("../PushNotificationError/model");
// --- 2. IMPORT THE CUSTOMER MODEL ---
const Customer = require("../Customer/model");

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/**
 * Saves a notification error to the database.
 * This runs asynchronously in the background ("fire and forget")
 * to avoid slowing down the main notification function.
 */
const logErrorToDB = (error, notification, token) => {
  // We use an async IIFE (Immediately Invoked Function Expression)
  // to perform async actions (like finding a customer)
  // without forcing the caller to use 'await'.
  (async () => {
    try {
      const logPayload = {
        error: {
          code: error.code,
          message: error.message,
        },
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.image || null,
        },
        token: token,
      };

      // --- 3. TRY TO FIND THE CUSTOMER ID ---
      // Find the customer who has this fcmDeviceToken
      const customer = await Customer.findOne({ fcmDeviceToken: token })
        .select("_id")
        .lean();

      if (customer) {
        logPayload.customer = customer._id;
      }
      // --- END OF CHANGE ---

      // Create and save the error log
      const errorLog = new PushNotificationError(logPayload);
      await errorLog.save();
    } catch (dbError) {
      // If saving the log fails, just log to console.
      // We don't want a log failure to crash the app.
      console.error(
        "CRITICAL: Failed to save notification error to database:",
        dbError
      );
      console.error("Original notification error was:", {
        error: { code: error.code, message: error.message },
        token,
      });
    }
  })(); // <-- Immediately invoke the async function
};

const sendPushNotification = async (
  deviceTokens,
  title,
  body,
  data = {},
  imageUrl = null
) => {
  if (!deviceTokens || !title || !body) {
    throw new Error("Device token(s), title, and body are required");
  }

  // Convert data object values to strings (Firebase requirement)
  const stringifiedData = {};
  Object.keys(data).forEach((key) => {
    stringifiedData[key] = String(data[key]);
  });

  // Build notification object with optional image
  const notificationPayload = {
    title,
    body,
  };

  // Add image to notification payload if provided
  if (imageUrl) {
    notificationPayload.image = imageUrl;
  }

  // Handle single token
  if (typeof deviceTokens === "string") {
    const message = {
      notification: notificationPayload,
      data: stringifiedData,
      token: deviceTokens,
      // Android specific configuration
      android: {
        priority: "high", // Ensure delivery
        notification: {
          ...(imageUrl && { image: imageUrl }),
          sound: "default",
          channelId: "default", // Make sure this channel exists in your app
          priority: "high",
        },
      },
      // iOS specific configuration
      apns: {
        headers: {
          "apns-priority": "10", // High priority for iOS
        },
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
            sound: "default",
            badge: 1,
            ...(imageUrl && { "mutable-content": 1 }),
          },
        },
        ...(imageUrl && {
          fcm_options: {
            image: imageUrl,
          },
        }),
      },
    };

    try {
      const response = await admin.messaging().send(message);
      return {
        success: true,
        messageId: response,
        successCount: 1,
        failureCount: 0,
      };
    } catch (error) {
      // --- 4. USE THE UPDATED LOGGER ---
      logErrorToDB(error, notificationPayload, deviceTokens);

      return {
        success: false,
        error: error,
        successCount: 0,
        failureCount: 1,
        invalidTokens: isInvalidToken(error) ? [deviceTokens] : [],
      };
    }
  }

  // Handle multiple tokens (array)
  if (Array.isArray(deviceTokens)) {
    if (deviceTokens.length === 0) {
      return {
        success: true,
        message: "No tokens to send to",
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
      };
    }

    // Filter out any null/undefined/empty tokens
    const validTokens = deviceTokens.filter((token) => {
      return token && typeof token === "string" && token.trim() !== "";
    });

    if (validTokens.length === 0) {
      return {
        success: true,
        message: "No valid tokens to send to",
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
      };
    }

    // Firebase has a limit of 500 tokens per batch
    const batchSize = 500;
    let totalSuccess = 0;
    let totalFailure = 0;
    const invalidTokens = [];

    const messaging = admin.messaging();

    for (let i = 0; i < validTokens.length; i += batchSize) {
      const batch = validTokens.slice(i, i + batchSize);

      const messages = batch.map((token) => ({
        notification: notificationPayload,
        data: stringifiedData,
        token: token,
        // Android specific configuration
        android: {
          priority: "high",
          notification: {
            ...(imageUrl && { image: imageUrl }),
            sound: "default",
            channelId: "default",
            priority: "high",
          },
        },
        // iOS specific configuration
        apns: {
          headers: {
            "apns-priority": "10",
          },
          payload: {
            aps: {
              alert: {
                title,
                body,
              },
              sound: "default",
              badge: 1,
              ...(imageUrl && { "mutable-content": 1 }),
            },
          },
          ...(imageUrl && {
            fcm_options: {
              image: imageUrl,
            },
          }),
        },
      }));

      try {
        // Use sendEach for better error handling
        const response = await messaging.sendEach(messages);

        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        // Track invalid tokens for cleanup
        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errorCode = resp.error?.code;
              const token = batch[idx];

              // --- 5. USE THE UPDATED LOGGER ---
              logErrorToDB(resp.error, notificationPayload, token);

              // Track invalid tokens for database cleanup
              if (isInvalidToken(resp.error)) {
                invalidTokens.push(token);
              }
            }
          });
        }
      } catch (error) {
        // --- 6. USE THE UPDATED LOGGER ---
        logErrorToDB(
          error,
          notificationPayload,
          `CRITICAL_BATCH_ERROR: ${batch.length} tokens`
        );
        totalFailure += batch.length;
      }
    }

    console.log(
      `Notification sent - Success: ${totalSuccess}, Failure: ${totalFailure}, Invalid Tokens: ${invalidTokens.length}`
    );

    return {
      success: true,
      successCount: totalSuccess,
      failureCount: totalFailure,
      totalTokens: validTokens.length,
      invalidTokens: invalidTokens,
      message: `Successfully sent to ${totalSuccess}/${validTokens.length} devices`,
    };
  }

  throw new Error("deviceTokens must be a string or an array");
};

// Helper function to identify invalid token errors
const isInvalidToken = (error) => {
  const invalidTokenErrors = [
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
    "messaging/invalid-argument",
    "messaging/mismatched-credential",
  ];
  return error && invalidTokenErrors.includes(error.code);
};

module.exports = {
  sendPushNotification,
};
