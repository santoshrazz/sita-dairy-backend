import { ApiError } from "../middleware/errorHandler.middleware.js"
import { productModel } from "../models/product.modal.js"
import { uploadToCloudinery } from "../utils/cloudinery.js"

export const createProduct = async (request, response, next) => {
    const { title, description, price, isFeatured = true } = request.body
    let thumbnail = ""
    const thumbnailFile = request?.file?.buffer;
    try {
        if (thumbnailFile) {
            const thumbnailUrl = await uploadToCloudinery(thumbnailFile)
            if (!thumbnailUrl) {
                return new ApiError("Error  Uploading Product Picture", 400)
            }
            thumbnail = thumbnailUrl
        }
        const createdProduct = await productModel.create({ title, description, price, thumbnail, isFeatured })
        response.status(200).json({ success: true, message: "Product created", product: createdProduct })
    } catch (error) {
        return next(new ApiError("Error while creating product", 500))
    }
}

export const getAllProducts = async (request, response, next) => {
    try {
        const allProduct = await productModel.find({ isFeatured: true });
        return response.status(200).json({ success: true, message: "All product retrived", product: allProduct })
    } catch (error) {
        return next(new ApiError("Error while retrieving products", 500))
    }
}

export const deleteProduct = async (request, response, next) => {
    const productId = request.params.id
    if (!productId) {
        return new ApiError("Product id required to delete product", 400)
    }
    try {
        const deletedProduct = await productModel.findByIdAndDelete(productId)
        return response.status(200).json({ success: true, message: "Product deleted" })
    } catch (error) {
        return next(new ApiError("Having error while deleting product", 500))
    }
}

export const updateProduct = async (request, response, next) => {
    const productId = request.params.id;
    const updates = request.body; // Contains the fields the user wants to update
    let thumbnail = "";
    const thumbnailFile = request?.file?.buffer;

    if (!productId) {
        return new ApiError("Product ID is required to update the product", 400);
    }

    try {
        // Check if the product exists
        const existingProduct = await productModel.findById(productId);
        if (!existingProduct) {
            return response.status(404).json({ success: false, message: "Product not found" });
        }

        // If a new thumbnail is uploaded, update it
        if (thumbnailFile) {
            const thumbnailUrl = await uploadToCloudinery(thumbnailFile);
            if (thumbnailUrl) {
                updates.thumbnail = thumbnailUrl;
            }
        }

        // Update only the provided fields dynamically
        const updatedProduct = await productModel.findByIdAndUpdate(
            productId,
            { $set: updates }, // Update only specified fields
            { new: true, runValidators: true } // Returns updated product and applies schema validation
        );

        return response.status(200).json({ success: true, message: "Product updated", product: updatedProduct });
    } catch (error) {
        return next(new ApiError("Error while updating product", 500))
    }
};
