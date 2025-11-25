require("dotenv").config();
const mongoose = require("mongoose");
const Vendor = require("./src/modules/Vendor/model");

const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("Connected to MongoDB");

    try {
      console.log("Checking vendors for missing location data...");
      const vendors = await Vendor.find({});
      
      for (const vendor of vendors) {
        let updated = false;
        if (!vendor.location || !vendor.location.type || !vendor.location.coordinates) {
          console.log(`Fixing location for vendor: ${vendor.name} (${vendor._id})`);
          vendor.location = {
            type: "Point",
            coordinates: [0, 0],
          };
          updated = true;
        } else if (vendor.location.coordinates.length !== 2) {
             console.log(`Fixing coordinates for vendor: ${vendor.name} (${vendor._id})`);
             vendor.location.coordinates = [0, 0];
             updated = true;
        }

        if (updated) {
            await vendor.save();
        }
      }

      console.log("Ensuring indexes...");
      await Vendor.createIndexes();
      console.log("Indexes created successfully.");
      
      console.log("Done.");
      process.exit(0);
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Could not connect to MongoDB", err);
    process.exit(1);
  });
