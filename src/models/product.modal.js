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
    isPopular: {
        type: Boolean,
        default: false,
    },
    price: {
        type: Number
    },
    category: {
        type: String,
        enum: ["Dahi", "Milk", "Ghee", "Paneer", "Mawa"]
    }
}, { timestamps: true })

export const productModel = mongoose.models.Product || mongoose.model("product", productSchema)