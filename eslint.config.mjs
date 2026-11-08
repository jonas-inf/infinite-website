import next from "eslint-config-next";
const config = [...next, { ignores: [".next/**", "public/**", "next-env.d.ts"] }];
export default config;
