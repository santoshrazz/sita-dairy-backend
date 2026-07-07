import mongoose, { Schema } from 'mongoose'
const orderSchema = new Schema({
    weight: {
        type: String,
        required: [true, "Weight is required"],
        trim: true
    },
    contact: {
        type: String,
        required: [true, "Phone Number is required"],
        trim: true,
        minLength: 10
    },
    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending"
    },
    date: {
        type: Date,
        required: [true, "Date is required"],
        trim: true
    },
    byUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    }
}, { timestamps: true })

export const orderModal = mongoose.models.orders || mongoose.model("order", orderSchema)
