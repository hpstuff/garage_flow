// Load local env for integration tests without overriding real CI env vars.
import { config } from "dotenv";

config({ path: ".env.local", override: false });
config({ path: ".env", override: false });
