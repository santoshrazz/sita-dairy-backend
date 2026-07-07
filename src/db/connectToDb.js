import mongoose from "mongoose";
import dotenv from 'dotenv'
dotenv.config({ path: "./.env" })

export const connectToDb = async () => {
    const MongoDbURI = process.env.MongoDbURI;
    if (!MongoDbURI) {
        throw new Error("MongoDbURI is not defined in the environment variables");
    }

    try {
        // Establish connection to MongoDB
        await mongoose.connect(MongoDbURI);

        console.log("Database connected successfully");

        // Optional: Handle mongoose connection events
        mongoose.connection.on("error", (error) => {
            console.error("Error in MongoDB connection:", error);
        });

    } catch (error) {
        console.error("Failed to connect to the database:", error);
        process.exit(1); // Exit the application if DB connection fails
    }
};
