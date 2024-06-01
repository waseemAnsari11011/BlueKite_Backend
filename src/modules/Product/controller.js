const Product = require('./model'); // Adjust the path as necessary
const fs = require('fs');
const path = require('path');

// Controller function to add a new product
exports.addProduct = async (req, res) => {
    console.log("Request body:", req.body);
    console.log("Uploaded files:", req.files);

    try {
        const { name, price, discount, description, category, vendor } = req.body;
        const images = req.files.map(file => file.path); // Get the paths of the uploaded images


        // Create a new product instance
        const newProduct = new Product({
            name,
            images,
            price,
            discount,
            description,
            category ,
            vendor
        });

        // Save the product to the database
        const savedProduct = await newProduct.save();

        // Send response
        res.status(201).json({
            message: 'Product created successfully',
            product: savedProduct
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to create product',
            error: error.message
        });
    }
};

// Controller function to get all products
exports.getAllProducts = async (req, res) => {
    try {
        // Find all products and populate the category field
        const products = await Product.find().populate('category');

        // Send response with the products
        res.status(200).json({
            message: 'Products retrieved successfully',
            products
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to retrieve products',
            error: error.message
        });
    }
};

// Controller function to get a product by ID
exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        // Find the product by ID and populate the category field
        const product = await Product.findById(id)

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Send the product in the response
        res.status(200).json({
            message: 'Product retrieved successfully',
            product
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to retrieve product',
            error: error.message
        });
    }
};

// Controller function to update an existing product
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, discount, description, category, existingImages, vendor } = req.body;

        // Find the product by ID
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Update the product details
        product.name = name || product.name;
        product.price = price || product.price;
        product.discount = discount || product.discount;
        product.description = description || product.description;
        product.category = category || product.category;
        product.vendor = vendor || product.vendor;

        // Combine existing images and new uploaded images
        const newImages = req.files.map(file => file.path);
        product.images = existingImages ? existingImages.concat(newImages) : newImages;

        console.log("req.files update product--->>>", req.files)

        // Save the updated product to the database
        const updatedProduct = await product.save();

        // Send response
        res.status(200).json({
            message: 'Product updated successfully',
            product: updatedProduct
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to update product',
            error: error.message
        });
    }
};

// Controller function to delete a product by ID
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Find the product by ID
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Delete product images from the file system
        product.images.forEach(imagePath => {
            const fullPath = path.join(imagePath);
            fs.unlink(fullPath, err => {
                if (err) {
                    console.error(`Failed to delete image file: ${fullPath}`, err);
                }
            });
        });

        // Delete the product from the database
        const deletedProduct = await Product.findByIdAndDelete(id);

        // Send response confirming deletion
        res.status(200).json({
            message: 'Product deleted successfully',
            product: deletedProduct
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to delete product',
            error: error.message
        });
    }
};
