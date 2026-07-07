import { ApiError } from "../middleware/errorHandler.middleware.js";
import { ratechartModal } from "../models/ratechart.modal.js";

export const getRateChart = async (request, response, next) => {
  try {
    const rateChart = await ratechartModal.find({});
    const column = [
      { key: "fat", label: "Fat %", type: "number", editable: true },
      { key: "snf8_0", label: "8.0", type: "number", editable: true },
      { key: "snf8_1", label: "8.1", type: "number", editable: true },
      { key: "snf8_2", label: "8.2", type: "number", editable: true },
      { key: "snf8_3", label: "8.3", type: "number", editable: true },
      { key: "snf8_4", label: "8.4", type: "number", editable: true },
      { key: "snf8_5", label: "8.5", type: "number", editable: true },
    ];
    response.status(200).json({
      success: true,
      message: "Rate chart data retrieved successfully",
      column,
      row: rateChart,
    });
  } catch (error) {
    next(new ApiError("Error creating milk entry", 400));
  }
};

export const updateRateChart = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id) {
      return res.status(400).json({ message: "Rate ID is required" });
    }

    // Update by id field (not _id)
    const updatedRate = await ratechartModal.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({
      message: "Rate chart updated successfully",
      data: updatedRate,
    });
  } catch (error) {
    console.log("error", error);
    next(new ApiError("Error creating milk entry", 400));
  }
};
