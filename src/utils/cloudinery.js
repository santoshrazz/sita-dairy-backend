import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'
import streamifier from 'streamifier'

dotenv.config()

cloudinary.config({
    cloud_name: process.env.CLOUDINERY_CLOUD_NAME,
    api_key: process.env.CLOUDINERY_API_KEY,
    api_secret: process.env.CLOUDINERY_API_SECRET
})

// Upload from memory (buffer)
const uploadToCloudinery = (buffer, folder = 'users') =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'image',
                folder,
                format: 'jpg',                 // force JPG extension
                transformation: [{ fetch_format: 'auto' }]
            },
            (err, result) => err ? reject(err) : resolve(result.secure_url)
        );
        streamifier.createReadStream(buffer).pipe(stream);
    });

export { uploadToCloudinery }
