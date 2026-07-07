import { Router } from 'express'
import { createSeller, dashboardData, getAllCustomerList, getSingleCustomerDetail, getSingleCustomerDetailAdmin, handleCreateUser, handleLoginUser, updateAdminPassword, updateUserDetails, deleteUserAccount, changeUserRole, changeUserPosition } from '../controllers/user.controller.js';
import { isAdmin, verifyUserToken } from '../middleware/userVerify.middeware.js'
import { createMilkOrder, deleteMilkOrder, getMilkOrder, updateMilkOrderStatus } from '../controllers/milk.controller.js';
import { upload } from '../utils/multer.js'
const userRoute = Router();

userRoute.route("/create").post(handleCreateUser)
userRoute.route('/login').post(handleLoginUser)
userRoute.route('/getSingleCustomerDetail').get(verifyUserToken, getSingleCustomerDetail)
userRoute.route('/get-user-profile/:id').get(verifyUserToken, isAdmin, getSingleCustomerDetailAdmin)
userRoute.route('/update').put(verifyUserToken, upload.single('profilePic'), updateUserDetails)
userRoute.route('/change-password').put(verifyUserToken, isAdmin, updateAdminPassword)
userRoute.route('/delete-account').delete(verifyUserToken, deleteUserAccount)
// Route for managing orders
userRoute.route('/order').post(verifyUserToken, createMilkOrder).get(verifyUserToken, getMilkOrder).put(verifyUserToken, isAdmin, updateMilkOrderStatus).delete(verifyUserToken, isAdmin, deleteMilkOrder)

userRoute.route('/dashboard').get(verifyUserToken, dashboardData)
// Admin related controller
userRoute.route('/all-customers').get(verifyUserToken, isAdmin, getAllCustomerList)
userRoute.route('/change-user-role').post(verifyUserToken, isAdmin, changeUserRole)



// Routes for Customer Sale
userRoute.route('/create-seller').post(verifyUserToken, isAdmin, createSeller)

// Routes for Changing User Position
userRoute.route('/change-position').post(verifyUserToken, isAdmin, changeUserPosition)
export default userRoute