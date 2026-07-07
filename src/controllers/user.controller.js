import { userModal } from "../models/customer.modal.js";
import { ApiError } from "../middleware/errorHandler.middleware.js";
import { milkModal } from "../models/milk.modal.js";
import { uploadToCloudinery } from "../utils/cloudinery.js";

export const handleCreateUser = async (request, response, next) => {
  try {
    const { name, mobile, role } = request.body;
    if (!name || !mobile) {
      return next(new ApiError("No required information available", 400));
    }
    const isUserExists = await userModal.findOne({ mobile });
    if (isUserExists) {
      return next(
        new ApiError("User already exists try logging into your account", 400)
      );
    }
    const password = mobile.slice(0, 5);
    const createdUser = await userModal.create({
      id: password,
      name,
      mobile,
      password,
      role,
    });
    if (!createdUser) {
      return next(new ApiError("Unable to create user", 400));
    }

    const newUser = await userModal
      .findById(createdUser._id)
      .select("-password -isVerified");
    const userResponse = {
      id: newUser.id,
      _id: newUser._id,
      name: newUser.name,
      mobile: newUser.mobile,
      role: newUser.role,
      profilePic: newUser.profilePic,
    };
    const token = await newUser.generateAuthToken();
    newUser.token = token;
    response.status(201).json({
      message: "User created",
      token,
      user: userResponse,
      success: true,
    });
  } catch (error) {
    console.log("error", error);
    next(new ApiError("Error creating user", 400));
  }
};

export const handleLoginUser = async (request, response, next) => {
  const { mobile, password } = request.body;
  try {
    const user = await userModal.findOne({ mobile }).select("+password +role");
    if (!user && !user?.status) {
      return next(
        new ApiError("User does not exist. Please register first.", 404)
      );
    }
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new ApiError("Invalid email or password.", 401));
    }
    const token = await user.generateAuthToken();
    const userResponse = {
      id: user.id,
      _id: user._id,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
      profilePic: user.profilePic,
    };
    response.status(200).json({
      success: true,
      message: "Logged in successfully.",
      token,
      user: userResponse,
    });
  } catch (error) {
    console.log("error", error);
    next(new ApiError("Error logging user", 400));
  }
};

export const getAllCustomerList = async (request, response, next) => {
  try {
    const { role, page = 1, limit = 20 } = request.query;
    const filters = role ? { role } : { role: { $ne: "Admin" } };
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;
    const allCustomers = await userModal
      .find(filters)
      .skip(skip)
      .limit(pageSize);
    response.status(200).json({
      success: true,
      message: "customers retrieved successfully.",
      users: allCustomers,
    });
  } catch (error) {
    next(new ApiError("Error getting all customer list", 500));
  }
};

export const getSingleCustomerDetail = async (request, response, next) => {
  try {
    let userId = request.user._id;
    if (request.query.userId) {
      userId = request.query.userId;
    }
    if (!userId) {
      return next(new ApiError("userId is required to get the user info", 400));
    }
    const userDetails = await userModal.findById(userId);
    if (!userDetails) {
      return next(new ApiError("No user found with the given id", 400));
    }
    response.status(200).json({
      success: true,
      message: "user detail retrieved successfully.",
      user: userDetails,
    });
  } catch (error) {
    next(new ApiError("Error getting single user details", 400));
  }
};

export const getSingleCustomerDetailAdmin = async (request, response, next) => {
  try {
    const userId = request.params.id;
    if (!userId) {
      return next(new ApiError("userId is required to get the user info", 400));
    }
    const userDetails = await userModal.findById(userId);
    if (!userDetails) {
      return next(new ApiError("No user found with the given id", 400));
    }
    const milkWithCustomer = await milkModal
      .find({ byUser: userId })
      .sort({ createdAt: -1 });
    response.status(200).json({
      success: true,
      message: "user detail retrieved successfully.",
      user: userDetails,
      entry: milkWithCustomer,
    });
  } catch (error) {
    next(new ApiError("Error getting single user details", 400));
  }
};

export const updateUserDetails = async (request, response, next) => {
  try {
    let requestUserId = request.user?._id;
    const {
      name,
      mobile,
      fatherName,
      address,
      morningMilk,
      eveningMilk,
      milkRate,
      userId,
      status,
      gender,
      latitude,
      longitude,
      preferedShift,
    } = request.body;
    
    const updateData = {};
    if (userId) requestUserId = userId;
    if (!requestUserId) return next(new ApiError("userId is required", 400));

    const profilePic = request?.file?.buffer;
    if (profilePic) {
      const uploadUrl = await uploadToCloudinery(profilePic);
      if (uploadUrl) updateData.profilePic = uploadUrl;
    }

    if (name) updateData.name = name;
    if (mobile) updateData.mobile = mobile;
    if (fatherName) updateData.fatherName = fatherName;
    if (address) updateData.address = address;
    if (morningMilk) updateData.morningMilk = morningMilk;
    if (eveningMilk) updateData.eveningMilk = eveningMilk;
    if (milkRate) updateData.milkRate = milkRate;
    if (status !== undefined) updateData.status = status;
    if (gender) updateData.gender = gender;
    if (latitude) updateData.latitude = String(latitude);
    if (longitude) updateData.longitude = String(longitude);
    if (preferedShift) updateData.preferedShift = preferedShift;

    const updatedUser = await userModal.findByIdAndUpdate(
      requestUserId,
      updateData,
      { new: true, runValidators: true }
    );
    
    response.status(200).json({
      success: true,
      message: "User details updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    next(new ApiError("Error updating user details", 400));
  }
};

export const updateAdminPassword = async (request, response, next) => {
  try {
    const { oldPassword, newPassword } = request.body;
    const userId = request.user._id;
    if (!oldPassword || !newPassword) {
      return next(new ApiError("oldPassword and new password required", 400));
    }
    const currentUser = await userModal.findById(userId);
    if (!currentUser) {
      return next(new ApiError("no user found", 400));
    }
    const isCorrectPassword = await currentUser.comparePassword(oldPassword);
    if (!isCorrectPassword) {
      return next(new ApiError("Incorrect Password", 400));
    }
    currentUser.password = newPassword;
    await currentUser.save();
    response.status(200).json({ success: true, message: "password updated" });
  } catch (error) {
    next(new ApiError("Error while trying to update admin password", 500));
  }
};

export const deleteUserAccount = async (request, response, next) => {
  try {
    const userId = request.user._id;
    await userModal.findByIdAndUpdate(userId, { status: false });
    return response
      .status(200)
      .json({ success: true, message: "Account Deactivated successfully" });
  } catch (error) {
    return next(new ApiError("Error deleting user account", 400));
  }
};

export const dashboardData = async (request, response, next) => {
  const userId = request.user._id;
  try {
    const reqUser = await userModal.findById(userId);
    if (reqUser?.role === "Admin") {
      const totalCustomers = await userModal.countDocuments({
        role: { $ne: "Admin" },
      });
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      const monthlyData = await milkModal.find({
        date: { $gte: startOfMonth, $lte: endOfMonth },
      });
      const totalMonthlyEarnings = monthlyData.reduce((acc, entry) => acc + parseFloat(entry.price), 0).toFixed(1);
      const totalMonthlyMilk = monthlyData.reduce((acc, entry) => acc + parseFloat(entry.weight), 0).toFixed(1);

      const todayData = await milkModal.find({
        date: { $gte: startOfToday, $lt: endOfToday },
      });
      const totalTodaysEarnings = todayData.reduce((acc, entry) => acc + parseFloat(entry.price), 0).toFixed(1);
      const totalTodaysMilk = todayData.reduce((acc, entry) => acc + parseFloat(entry.weight), 0).toFixed(1);
      const lastFiveEntries = await milkModal.find({}).sort({ date: -1 }).limit(5).populate("byUser", "name profilePic");
      
      response.status(200).json({
        message: "Success",
        success: true,
        data: {
          totalCustomers,
          totalMonthlyEarnings,
          totalMonthlyMilk,
          totalTodaysMilk,
          totalTodaysEarnings,
          lastFiveEntries,
        }
      });
    } else {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      const monthlyData = await milkModal.find({ byUser: userId, date: { $gte: startOfMonth, $lte: endOfMonth } });
      const todayData = await milkModal.find({ byUser: userId, date: { $gte: startOfToday, $lt: endOfToday } });
      const lastFiveEntries = await milkModal.find({ byUser: userId }).sort({ date: -1 }).limit(5).populate("byUser", "name profilePic");

      const totalMonthlyEarnings = monthlyData.reduce((acc, entry) => acc + parseFloat(entry.price), 0).toFixed(1);
      const totalMonthlyMilk = monthlyData.reduce((acc, entry) => acc + parseFloat(entry.weight), 0).toFixed(1);
      const totalTodaysEarnings = todayData.reduce((acc, entry) => acc + parseFloat(entry.price), 0).toFixed(1);
      const totalTodaysMilk = todayData.reduce((acc, entry) => acc + parseFloat(entry.weight), 0).toFixed(1);
      const todaysFatValues = todayData.map((entry) => parseFloat(entry.fat || 0));
      const todaysSnfValues = todayData.map((entry) => parseFloat(entry.snf || 0));

      response.status(200).json({
        message: "Success",
        success: true,
        data: {
          monthlyEarning: totalMonthlyEarnings,
          totalMonthlyMilk,
          totalTodaysEarnings,
          totalTodaysMilk,
          todaysFatValues,
          todaysSnfValues,
          lastFiveEntries,
        }
      });
    }
  } catch (error) {
    next(new ApiError("Error dashboard data", 400));
  }
};

export const createSeller = async (request, response, next) => {
  try {
    const { name, mobile } = request.body;
    if (!name || !mobile) return next(new ApiError("Required info missing", 400));
    const isUserExists = await userModal.findOne({ mobile });
    if (isUserExists) return next(new ApiError("User already exists", 400));
    
    const password = mobile.slice(0, 5);
    const createdUser = await userModal.create({
      id: password, name, mobile, password, role: "Buyer"
    });
    const newUser = await userModal.findById(createdUser._id).select("-password -isVerified");
    const token = await newUser.generateAuthToken();
    
    response.status(201).json({
      message: "User created",
      token,
      user: newUser,
      success: true,
    });
  } catch (error) {
    next(new ApiError("Error creating buyer", 400));
  }
};

export const changeUserRole = async (req, res, next) => {
  try {
    const allUsersToUpdate = JSON.parse(req.body.users);
    const updatePromises = allUsersToUpdate.map((user) => {
      return userModal.findByIdAndUpdate(user.customerId, { role: user.role }, { new: true });
    });
    const updatedUsers = await Promise.all(updatePromises);
    return res.status(200).json({ success: true, message: "Roles updated", users: updatedUsers });
  } catch (error) {
    next(new ApiError("Error updating roles", 500));
  }
};

export const changeUserPosition = async (req, res, next) => {
  try {
    for (const { userId, positionNo } of req.body.users) {
      await userModal.updateOne({ _id: userId }, { $set: { positionNo } });
    }
    return res.status(200).json({ success: true, message: "Position updated" });
  } catch (error) {
    next(new ApiError("Error updating position", 500));
  }
};