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
    notificationPayload.image = imageUrl; // Changed from imageUrl to image
  }

  // Handle single token
  if (typeof deviceTokens === "string") {
    const message = {
      notification: notificationPayload,
      data: stringifiedData,
      token: deviceTokens,
      // Android specific configuration
      android: imageUrl
        ? {
            notification: {
              image: imageUrl, // Changed from imageUrl to image
            },
          }
        : undefined,
      // iOS specific configuration
      apns: imageUrl
        ? {
            payload: {
              aps: {
                "mutable-content": 1,
              },
            },
            fcm_options: {
              image: imageUrl,
            },
          }
        : undefined,
    };

    try {
      const response = await admin.messaging().send(message);
      return `Successfully sent message: ${response}`;
    } catch (error) {
      console.error("Error sending message:", error.code, error.message);
      throw error;
    }
  }

  // Handle multiple tokens (array)
  if (Array.isArray(deviceTokens)) {
    if (deviceTokens.length === 0) {
      return "No tokens to send to";
    }

    // Filter out any null/undefined/empty tokens
    const validTokens = deviceTokens.filter((token) => {
      return token && typeof token === "string" && token.trim() !== "";
    });

    if (validTokens.length === 0) {
      return "No valid tokens to send to";
    }

    // Firebase has a limit of 500 tokens per batch
    const batchSize = 500;
    let totalSuccess = 0;
    let totalFailure = 0;

    const messaging = admin.messaging();

    // Check if sendAll exists, otherwise use sendEach
    const useSendEach = typeof messaging.sendAll !== "function";

    for (let i = 0; i < validTokens.length; i += batchSize) {
      const batch = validTokens.slice(i, i + batchSize);

      const messages = batch.map((token) => ({
        notification: notificationPayload,
        data: stringifiedData,
        token: token,
        // Android specific configuration
        android: imageUrl
          ? {
              notification: {
                image: imageUrl, // Changed from imageUrl to image
              },
            }
          : undefined,
        // iOS specific configuration
        apns: imageUrl
          ? {
              payload: {
                aps: {
                  "mutable-content": 1,
                },
              },
              fcm_options: {
                image: imageUrl,
              },
            }
          : undefined,
      }));

      try {
        let response;
        if (useSendEach) {
          response = await messaging.sendEach(messages);
        } else {
          response = await messaging.sendAll(messages);
        }

        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        // Log any failures in this batch
        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              console.error(
                `Failed to send to token ${batch[idx].substring(0, 20)}...:`,
                resp.error?.code,
                resp.error?.message
              );
            }
          });
        }
      } catch (error) {
        console.error("Error sending batch:", error.message);
        totalFailure += batch.length;
      }
    }

    console.log(
      `Notification sent - Success: ${totalSuccess}, Failure: ${totalFailure}`
    );
    return `Successfully sent to ${totalSuccess}/${validTokens.length} devices`;
  }

  throw new Error("deviceTokens must be a string or an array");
};

module.exports = {
  sendPushNotification,
};
