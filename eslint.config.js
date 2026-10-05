import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions is Deno code with its own toolchain; .kilo holds editor worktrees.
  { ignores: ["dist", "dev-dist", ".kilo", "supabase/functions"] },
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
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Backend access goes through the routed feature api.ts modules (src/data), so demo mode
    // can answer every call. Only Supabase implementations (*.supabase.ts) and the auth
    // screens may touch the client. Demo code is loaded only with import("@/demo"), never
    // statically, so it stays out of the main bundle.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.supabase.ts",
      "src/**/*.test.{ts,tsx}",
      "src/integrations/supabase/**",
      "src/demo/**",
      "src/contexts/SupabaseAuthProvider.tsx",
      "src/pages/AcceptInvite.tsx",
      "src/pages/ResetPassword.tsx",
      "src/components/auth/ForgotPasswordModal.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/integrations/supabase/client",
              message: "Call the backend through a feature's api.ts (routed for demo mode), not the Supabase client.",
            },
          ],
          patterns: [
            {
              group: ["@/demo", "@/demo/*"],
              message: "Load demo code lazily with import(\"@/demo\") so it stays out of the main bundle.",
            },
          ],
        },
      ],
    },
  },
  {
    // shadcn/ui primitives are generated and never edited (see ARCHITECTURE.md).
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "react-refresh/only-export-components": "off",
    },
  }
);
