import mongoose, { Schema } from 'mongoose'
const milkSchema = new Schema({
    weight: {
        type: String,
        required: [true, "Weight is required"],
        trim: true
    },
    price: {
        type: String,
        required: [true, "price is required"],
        trim: true,
    },
    fat: {
        type: String,
    },
    date: {
        type: Date,
        required: [true, "Date is required"],
        trim: true
    },
    rate: {
        type: String,
        required: [true, "rate is required"],
        trim: true,
    },
    snf: {
        type: String,
    },
    shift: {
        type: String,
        required: [true, "shift is required"],
        enum: ["Morning", "Evening"],
    },
    entryType: {
        type: String,
        required: [true, "shift is required"],
        enum: ["Buy", "Sell"],
        default: "Buy"
    },
    byUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    }
}, { timestamps: true })

export const milkModal = mongoose.models.milks || mongoose.model("milk", milkSchema)
