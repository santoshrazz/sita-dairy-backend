import mongoose, { Schema } from "mongoose";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
const userSchema = new Schema(
  {
    id: {
      type: String,
      required: [true, "Id is required"],
    },
    name: {
      type: String,
      required: [true, "name is required"],
    },
    mobile: {
      type: String,
      required: [true, "mobile number is required"],
      trim: true,
    },
    collectionCenter: {
      type: String,
    },
    dailryName: {
      type: String,
    },
    fatherName: {
      type: String,
    },
    password: {
      type: String,
      minLength: [5, "Minimum 6 character required"],
      required: [true, "Password is require"],
    },
    address: {
      type: String,
    },
    walletAmount: {
      type: Number,
      default: 0,
    },
    positionNo: {
      type: Number,
      default: 1,
    },
    morningMilk: {
      type: String,
      default: "",
    },
    eveningMilk: {
      type: String,
      default: "",
    },
    milkRate: {
      type: String,
      default: 50,
    },
    latitude: {
      type: String,
    },
    longitude: {
      type: String,
    },
    preferedShift: {
      type: String,
      enum: ["Morning", "Evening", "Both"],
      default: "Both",
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      default: "Male",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    profilePic: {
      type: String,
      default:
        "https://res.cloudinary.com/dskra60sa/image/upload/v1743086699/man_rqv4zk.png",
    },
    role: {
      type: String,
      enum: ["User", "Admin", "Buyer", "Farmer"],
      default: "User",
    },
    status: {
      type: Boolean,
      default: true,
    },
    // byUser: {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: "user",
    //     required: true
    // }
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcryptjs.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return bcryptjs.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password comparison failed");
  }
};

userSchema.methods.generateAuthToken = async function () {
  return jwt.sign({ id: this.id, _id: this._id }, process.env.JWT_SECRET_KEY);
};

export const userModal =
  mongoose.models.users || mongoose.model("user", userSchema);
