import { ApiError } from "../middleware/errorHandler.middleware.js";
import { userModal } from "../models/customer.modal.js";

export const dropDown = async (request, response, next) => {
  try {
    const { code } = request.body;
    if (!code) {
      return next(new ApiError("Code is required", 500));
    }
    if (code === "USERS") {
      const { shift, userId, role } = request.body?.data;
      const filterObj = { status: true };
      if (shift) filterObj.preferedShift = shift;
      if (userId) filterObj._id = userId;
      if (role) filterObj.role = role ? role : { $ne: "Admin" };
      const usersData = await userModal.find(filterObj);
      return response.status(201).json({
        message: "User Retrieved",
        user: usersData,
        success: true,
      });
    }
    response.status(201).json({
      message: "Success",
      success: true,
    });
  } catch (error) {
    console.log("error", error);
    next(new ApiError("Error Getting Dropdown Data user", 400));
  }
};
