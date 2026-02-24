import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig([
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{ts,tsx,js}"],
        ignores: [
            "dist/",
            "build/",
            "node_modules/",
            "test-results/",
            "workspaces/",
            "zeus-data/",
            "assets/",
            "resources/",
            "docs/",
            "tests/",
            "playwright.config.ts",
            "vite.config.ts",
            "svelte.config.js",
            "Dockerfile*",
            "eslint-report.json"
        ],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module"
        },
        rules: {
            "no-console": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "no-control-regex": "off"
        }
    }
]);
