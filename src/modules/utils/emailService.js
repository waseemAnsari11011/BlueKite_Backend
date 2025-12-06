const nodemailer = require("nodemailer");
require("dotenv").config();

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

exports.sendOrderConfirmationEmail = async (customerEmail, orderDetails) => {
  const mailOptions = {
    from: process.env.EMAIL,
    to: customerEmail,
    subject: "Order Confirmation",
    text: `Your order has been placed successfully. Order details: ${JSON.stringify(
      orderDetails
    )}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Order confirmation email sent to customer");
  } catch (error) {
    console.error("Error sending order confirmation email to customer:", error);
    throw error;
  }
};

exports.sendNewOrderNotificationEmail = async (
  vendorEmail,
  orderDetails,
  customerContactNumber
) => {
  console.log(
    "vendorEmail, orderDetails, customerContactNumber=>",
    vendorEmail,
    orderDetails,
    customerContactNumber
  );
  console.log("orderDetails=>", orderDetails.vendors[0].products);
  const mailOptions = {
    from: process.env.EMAIL,
    to: vendorEmail,
    subject: "New Order Placed",
    html: `
            <p>Hello,</p>
            <p>A new order has been placed. Here are the details:</p>
            <ul>
                <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
                <li><strong>Customer Number:</strong> ${customerContactNumber}</li>
                <li><strong>Shipping Address:</strong> <br>
                    ${orderDetails.shippingAddress.address}<br>
                    ${orderDetails.shippingAddress.city}, ${
      orderDetails.shippingAddress.state
    }, ${orderDetails.shippingAddress.country}<br>
                    Postal Code: ${orderDetails.shippingAddress.postalCode}
                </li>
                <li><strong>Order Date:</strong> ${new Date(
                  orderDetails.createdAt
                ).toLocaleString()}</li>
            </ul>
            <br>
            <p>Please process the order at your earliest convenience.</p>
            <br>
            <p>Thank you.</p>
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("New order notification email sent to vendor");
  } catch (error) {
    console.error(
      "Error sending new order notification email to vendor:",
      error
    );
    throw error;
  }
};

exports.sendResetPasswordEmail = async (email, resetUrl) => {
  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: "Password Reset Request",
    html: `
      <p>You requested a password reset.</p>
      <p>Click this link to reset your password:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Password reset email sent");
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};
