import jwt from 'jsonwebtoken'
import { ApiError } from './errorHandler.middleware.js'
import { userModal } from '../models/customer.modal.js'

export async function verifyUserToken(req, res, next) {
    try {
        const token = req?.cookie?.token || req?.headers?.authorization?.split(" ")[1]
        if (!token) {
            return next(new ApiError("unauthenticated", 403))
        }
        const decodedPayload = jwt.verify(token, process.env.JWT_SECRET_KEY)
        req.user = decodedPayload
        next()
    } catch (error) {
        return next(new ApiError("unauthenticated", 403))
    }
}
export async function isAdmin(req, res, next) {
    try {
        const userId = req?.user?._id
        if (!userId) {
            return next(new ApiError("unauthenticated", 401))
        }
        const user = await userModal.findById(userId)
        if (!user) {
            return next(new ApiError("No user found ", 401))
        }
        if (user.role === "Admin") {
            next()
        }
        else {
            return next(new ApiError("This is admin access resource only", 403))
        }
    } catch (error) {
        return next(new ApiError("unauthenticated", 403))
    }
}