import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import path from "node:path";
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  test:{environment:"node",include:["tests/**/*.test.ts"],coverage:{provider:"v8",reporter:["text","json","html"],include:["src/lib/**/*.ts"]}},
  resolve:{alias:{"@":path.resolve(root,"src")}},
});
