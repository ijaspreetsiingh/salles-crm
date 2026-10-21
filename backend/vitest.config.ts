import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      PORT: "4123",
      DATABASE_URL: "file:./data/test.db",
      JWT_ACCESS_SECRET: "test-access-secret-000000000000000000",
      JWT_REFRESH_SECRET: "test-refresh-secret-000000000000000000",
      SEED_ON_START: "false",
      UPLOAD_DIR: "./data/test-uploads",
    },
    fileParallelism: false,
  },
});
