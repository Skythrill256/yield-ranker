import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      // Backend has its own tooling; keep the root ESLint run focused on the frontend app.
      "server/**",
      // Server scripts are operational tooling; linting them under the frontend ruleset is noisy.
      "server/scripts/**",
      "yield-ranker/server/scripts/**",
      // Avoid linting duplicate nested app copy (if present in workspace)
      "yield-ranker/**",
      // Generated typings
      "**/*.d.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // This repo intentionally uses `any` in a number of integration-heavy spots (APIs, charts, etc.).
      // Enforcing a blanket ban here creates too much churn/noise for day-to-day work.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
