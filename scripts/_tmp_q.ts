import { sql } from "./supabase-management";
(async () => console.log(JSON.stringify(await sql("ipstebqawrvhkyntctrv", process.argv[2]), null, 0)))();
