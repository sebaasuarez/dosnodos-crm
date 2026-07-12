import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Los tests de Lead Hunter comparten una BD Postgres real (dev) para
    // probar dedupe/concurrencia sin mockear Prisma — se corre en serie para
    // que no compitan por las mismas filas entre archivos de test.
    fileParallelism: false,
  },
});
