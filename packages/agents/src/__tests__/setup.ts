import { config } from "dotenv";
import { resolve } from "path";

// Load env vars from root .env and apps/web/.env (which has GROQ keys)
config({ path: resolve(__dirname, "../../../../.env") });
config({ path: resolve(__dirname, "../../../../apps/web/.env") });
