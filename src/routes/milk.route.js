import { Router } from 'express'
import { createMilkEntry, deleteMilkEntry, getMilkEntriesByUser, updateMilkEntry, createMilkOrder, getMilkOrder, sellMilk, getSellMilkEntriesByUser, updateSellMilkEntry, deleteSellMilkEntry } from '../controllers/milk.controller.js';
import { isAdmin, verifyUserToken } from '../middleware/userVerify.middeware.js';

const milkRouter = Router();

// Route for Admins
milkRouter.post('/create', verifyUserToken, isAdmin, createMilkEntry);
milkRouter.put('/update/:id', verifyUserToken, isAdmin, updateMilkEntry);
milkRouter.delete('/delete/:id', verifyUserToken, isAdmin, deleteMilkEntry);

// Route for User 
milkRouter.get('/get', verifyUserToken, getMilkEntriesByUser);
milkRouter.post('/order', verifyUserToken, createMilkOrder)
milkRouter.get('/order', verifyUserToken, getMilkOrder)

// Routes For sell milk
milkRouter.route('/sell')
    .get(verifyUserToken, getSellMilkEntriesByUser)
    .post(verifyUserToken, isAdmin, sellMilk)
milkRouter.put('/sell/:id', verifyUserToken, isAdmin, updateSellMilkEntry);
milkRouter.delete('/sell/:id', verifyUserToken, isAdmin, deleteSellMilkEntry);
export { milkRouter }