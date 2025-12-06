require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const mailOptions = {
  from: process.env.EMAIL,
  to: process.env.EMAIL, // Send to self for testing
  subject: "Test Email from BlueKite Backend",
  text: "If you see this, the email configuration is working correctly!",
};

async function sendTestEmail() {
  try {
    console.log("Attempting to send test email to:", process.env.EMAIL);
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully!");
    console.log("Message ID:", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
    process.exit(1);
  }
}

sendTestEmail();
