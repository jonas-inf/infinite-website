import type { NextConfig } from "next";
import { redirects } from "./src/lib/redirects.ts";

const config: NextConfig = { skipTrailingSlashRedirect: true, redirects: async () => redirects() };
export default config;
