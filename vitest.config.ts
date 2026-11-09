import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The audio/lesson tests run whole pitch pipelines; the default 5 s is too tight when many run in parallel.
    testTimeout: 20000,
    // Claude Code session worktrees live in .claude/worktrees and contain copies of every test.
    exclude: ["**/node_modules/**", "**/.next/**", ".claude/**"],
  },
});
