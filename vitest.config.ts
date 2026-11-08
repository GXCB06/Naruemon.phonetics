import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Claude Code session worktrees live in .claude/worktrees and contain copies of every test.
    exclude: ["**/node_modules/**", "**/.next/**", ".claude/**"],
  },
});
