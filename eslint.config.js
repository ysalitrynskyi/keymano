import js from "@eslint/js";
import ts from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default ts.config(
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "target/**",
      "node_modules/**",
      "coverage/**",
      "crates/**",
      // Generated wasm-bindgen glue (browser globals, not our source).
      "src/wasm/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, __APP_VERSION__: "readonly" },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      // New in eslint-plugin-react-hooks 7. Our effects call *async* loaders
      // (`void reload()`), so setState happens in a promise, not synchronously —
      // not the cascading-render antipattern this rule targets. Off to avoid
      // false positives on standard on-mount data loads.
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    languageOptions: { globals: { ...globals.node } },
  },
);
