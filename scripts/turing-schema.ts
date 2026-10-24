/**
 * Writes lib/turing/schema.generated.ts — what Turing may read — from the generated database
 * types. `npm run db:types` runs it after every types run.
 *
 *   npx tsx scripts/turing-schema.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parseSchema, schemaModule } from "../lib/turing/schema";

const schema = parseSchema(readFileSync("lib/supabase/database.types.ts", "utf8"));
writeFileSync("lib/turing/schema.generated.ts", schemaModule(schema));
console.log("Wrote lib/turing/schema.generated.ts.");
