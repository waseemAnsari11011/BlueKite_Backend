const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Configure the AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

// Function to get the content type based on file extension
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
};

const uploadToS3 = (filePath, key) => {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(filePath);
    const contentType = getContentType(filePath);

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
    };

    s3.upload(params, (err, data) => {
      if (err) {
        return reject(err);
      }
      resolve(data.Location);
    });
  });
};

module.exports = uploadToS3;
