const admin = require("firebase-admin");
const serviceAccount = require("../../../firebaseConfig.json");

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

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
      console.error("Error sending message:", error.code, error.message);
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

              console.error(
                `Failed to send to token ${token.substring(0, 20)}...:`,
                errorCode,
                resp.error?.message
              );

              // Track invalid tokens for database cleanup
              if (isInvalidToken(resp.error)) {
                invalidTokens.push(token);
              }
            }
          });
        }
      } catch (error) {
        console.error("Error sending batch:", error.message);
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
