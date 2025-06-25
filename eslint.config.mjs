import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import nextPlugin from "@next/eslint-plugin-next"
import pluginQuery from "@tanstack/eslint-plugin-query"
import typescriptPlugin from "@typescript-eslint/eslint-plugin"
import typescriptParser from "@typescript-eslint/parser"
import jsxA11yPlugin from "eslint-plugin-jsx-a11y"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"

const compat = new FlatCompat({
    baseDirectory: process.cwd(),
})

export default [
    js.configs.recommended,
    ...compat.extends("next/core-web-vitals"),
    ...pluginQuery.configs["flat/recommended"],
    {
        files: ["**/*.{js,jsx,ts,tsx}"],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            "@next/next": nextPlugin,
            react: reactPlugin,
            "react-hooks": reactHooksPlugin,
            "jsx-a11y": jsxA11yPlugin,
            "@typescript-eslint": typescriptPlugin,
        },
        rules: {
            // Next.js specific rules
            "@next/next/no-html-link-for-pages": "error",
            "@next/next/no-img-element": "warn",
            "@next/next/no-unwanted-polyfillio": "error",
            "@next/next/no-page-custom-font": "error",

            // React rules
            "react/react-in-jsx-scope": "warn",
            "react/prop-types": "warn",
            "react/jsx-uses-react": "warn",
            "react/jsx-uses-vars": "error",
            "react/no-unescaped-entities": "warn",

            // React Hooks rules
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",

            // Accessibility rules
            "jsx-a11y/alt-text": "warn",
            "jsx-a11y/anchor-is-valid": "warn",

            // TypeScript rules
            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/no-explicit-any": "warn",

            // General best practices
            "no-console": "warn",
            "prefer-const": "error",
            "no-var": "error",
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    },
    {
        files: ["**/*.config.{js,mjs,ts}"],
        rules: {
            "no-console": "off",
        },
    },
]
