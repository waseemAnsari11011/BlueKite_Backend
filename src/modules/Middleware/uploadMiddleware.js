const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Define the upload directory
const uploadDir = 'uploads/customers'; // Adjusted directory name

// Create the uploads directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Use the uploads directory
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});

// Middleware to handle both single and multiple file uploads
const upload = multer({ storage: storage }).any(); // Accepts any type of file or files

module.exports = upload;
