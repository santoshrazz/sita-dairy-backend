import { Router } from 'express'
import { upload } from '../utils/multer.js';
import { isAdmin, verifyUserToken } from '../middleware/userVerify.middeware.js';
import { deleteProduct, getAllProducts, updateProduct, createProduct } from '../controllers/product.controller.js';
const productRoute = Router();

productRoute.get('/all', verifyUserToken, getAllProducts);
productRoute.post('/create', verifyUserToken, isAdmin, upload.single('thumbnail'), createProduct);
productRoute.put('/update/:id', verifyUserToken, isAdmin, upload.single('thumbnail'), updateProduct)
productRoute.delete('/delete/:id', verifyUserToken, isAdmin, deleteProduct);

export default productRoute