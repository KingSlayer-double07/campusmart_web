import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".kilo/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The API has its own ESLint config; generated service worker output isn't ours to lint
    "backend/**",
    "public/sw.js",
    "public/swe-worker-*.js",
  ]),
]);

export default eslintConfig;
