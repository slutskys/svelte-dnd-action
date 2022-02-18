module.exports = {
    parser: "@typescript-eslint/parser",
    env: {
        browser: true,
        es2021: true
    },
    extends: ["eslint:recommended", "plugin:@typescript-eslint/eslint-recommended", "plugin:@typescript-eslint/recommended"],
    parserOptions: {
        ecmaVersion: 12,
        sourceType: "module"
    },
    rules: {
        "@typescript-eslint/no-empty-function": 0
    }
};
