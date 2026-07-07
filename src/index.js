import dotenv from "dotenv";
import { app } from "./app.js";
import { connectToDb } from "./db/connectToDb.js";
import serverless from "serverless-http";

dotenv.config({ path: "./.env" });
const PORT = process.env.PORT || 8080;
await connectToDb().then(() => {
  app.listen(PORT, () => {
    console.log(`APP IS LISTNING AT ${PORT}`);
  });
});
export const handler = serverless(app);
