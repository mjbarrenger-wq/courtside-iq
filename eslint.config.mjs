import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // One-off data-load scripts kept at the repo root for reference. They are
    // plain Node (CommonJS `require`) and never ship with the app, so the
    // TypeScript/Next rules don't apply to them.
    "generate_insights.js",
    "import_opponent_stats.js",
    "populate_team_game_stats.js",
  ]),
  {
    rules: {
      // The React Compiler-era hooks rules flag two patterns this codebase uses
      // deliberately in the capture/watch/align screens: hydrating state from
      // localStorage in a mount effect, and the "latest ref" technique (assigning
      // a fresh callback into a ref during render so a keyboard or video-tick
      // handler always sees current closures). Neither is a bug here, so they
      // are advisory rather than blocking. Re-tighten if the compiler is adopted.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
