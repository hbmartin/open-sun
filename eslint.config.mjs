import { FlatCompat } from "@eslint/eslintrc"
import pluginJs from "@eslint/js"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import tailwind from "eslint-plugin-tailwindcss"
import eslintPluginUnicorn from "eslint-plugin-unicorn"
import globals from "globals"
import tseslint from "typescript-eslint"

const compat = new FlatCompat({
  // import.meta.dirname is available after Node.js v20.11.0
  baseDirectory: import.meta.dirname,
})

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: [".next/**", "public/**", "next.config.js", "postcss.config.js"] },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat["jsx-runtime"],
  eslintPluginUnicorn.configs.all,
  ...tailwind.configs["flat/recommended"],
  ...compat.config({
    extends: ["next"],
    settings: {
      next: {
        rootDir: ".",
      },
      react: {
        version: "detect",
      },
    },
  }),
  {
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
    },
  },
  {
    rules: {
      "react/react-in-jsx-scope": "off",
      "tailwindcss/no-custom-classname": "error",
      "@typescript-eslint/no-unused-vars": [
        "error", // or "error"
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": "error",
      "@typescript-eslint/no-var-requires": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-empty-interface": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-key": ["error", { checkFragmentShorthand: true }],
      "react/jsx-no-duplicate-props": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-pascal-case": "error",
      "react/no-children-prop": "error",
      "react/no-unescaped-entities": "error",
      "react/self-closing-comp": "error",
      "react/no-unknown-property": "error",
      "react/no-unused-prop-types": "error",
      "react/no-deprecated": "error",
      "react/no-did-mount-set-state": "error",
      "react/no-did-update-set-state": "error",
      "react/no-direct-mutation-state": "error",
      "tailwindcss/classnames-order": "off",
      "tailwindcss/enforces-negative-arbitrary-values": "error",
      "tailwindcss/enforces-shorthand": "error",
      "tailwindcss/migration-from-tailwind-2": "error",
      "tailwindcss/no-contradicting-classname": "error",
      "unicorn/prevent-abbreviations": [
        "error",
        {
          allowList: {
            ctx: true,
            req: true,
            res: true,
            utils: true,
          },
        },
      ],
      "unicorn/filename-case": "off",
      "unicorn/no-array-for-each": "error",
      "unicorn/no-array-push-push": "error",
      "unicorn/no-array-reduce": "error",
      "unicorn/prefer-module": "error",
      "unicorn/prefer-spread": "error",
      "unicorn/prefer-string-replace-all": "error",
      "unicorn/prefer-string-starts-ends-with": "error",
      "unicorn/prefer-string-trim-start-end": "error",
      "unicorn/no-keyword-prefix": "off", // catches `className`
      "no-undef": "error",
      "no-console": "off",
      "no-debugger": "error",
      "no-alert": "error",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      "template-curly-spacing": "error",
      "arrow-spacing": "error",
      "comma-dangle": ["error", "always-multiline"],
      semi: ["error", "never"],
      quotes: ["error", "double", { avoidEscape: true }],

      // Import/Export
      "sort-imports": ["error", { ignoreDeclarationSort: true }],

      // Security
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["*.config.{js,ts,mjs}", "**/.eslintrc.{js,cjs}"],
    rules: {
      "no-console": "off",
      "unicorn/prefer-module": "off",
    },
  },
  {
    files: ["**/*.{test,spec}.{js,ts,jsx,tsx}", "**/__tests__/**/*"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "unicorn/consistent-function-scoping": "off",
    },
  },
]
export default config
