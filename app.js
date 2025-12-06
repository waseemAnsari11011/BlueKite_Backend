require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const customerRoutes = require("./src/modules/Customer/route"); // Adjust the path as per your project structure
const vendorRoutes = require("./src/modules/Vendor/route"); // Adjust the path as per your project structure
const ProductRoutes = require("./src/modules/Product/route");
const CategoryRoutes = require("./src/modules/Category/route");
const OrderRoutes = require("./src/modules/Order/route");
const ReportRoutes = require("./src/modules/Reports/route");
const InquiryRoutes = require("./src/modules/Inquiry/route");
const FaqsRoutes = require("./src/modules/HelpCenter/route");
const ContactRoutes = require("./src/modules/Contactus/route");
const BannerRoutes = require("./src/modules/Banner/route");
const DeliveryRoutes = require("./src/modules/Delivery/route");
const notificationRoutes = require("./src/modules/Notification/route");

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB connection
const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
mongoose
  .connect(mongoUri)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB", err));

// Routes
app.use("/api/", customerRoutes);
app.use("/api/", vendorRoutes);
app.use("/api/", ProductRoutes);
app.use("/api/", CategoryRoutes);
app.use("/api/", OrderRoutes);
app.use("/api/", ReportRoutes);
app.use("/api/", InquiryRoutes);
app.use("/api/", FaqsRoutes);
app.use("/api/", ContactRoutes);
app.use("/api/", BannerRoutes);
app.use("/api/", DeliveryRoutes);
app.use("/api/notification", notificationRoutes);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
