import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const sourceFiles = [
  "apps/**/*.{js,cjs,mjs,ts,tsx}",
  "packages/**/*.{js,cjs,mjs,ts,tsx}",
  "scripts/**/*.{js,cjs,mjs,ts,tsx}",
  "*.{js,mjs,ts}"
];

export default tseslint.config(
  {
    ignores: ["**/dist/**", "coverage/**", "dist-desktop/**", "node_modules/**"]
  },
  {
    ...js.configs.recommended,
    files: sourceFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-console": "off",
      "no-control-regex": "off",
      "no-empty": "off",
      "no-unused-vars": "off",
      "no-useless-escape": "off"
    }
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ...config.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  })),
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off"
    }
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error"
    }
  }
);
