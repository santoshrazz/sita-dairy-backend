import mongoose, { Schema } from 'mongoose'

const productSchema = new Schema({
    title: {
        type: String,
        required: [true, "Product title required"]
    },
    description: {
        type: String
    },
    thumbnail: {
        type: String
    },
    buyerCount: {
        type: Number,
        default: 0
    },
    isFeatured: {
        type: Boolean,
        default: true,
    },
    price: {
        type: Number
    }
}, { timestamps: true })

export const productModel = mongoose.models.Product || mongoose.model("product", productSchema)