/** Its own module so both a "use server" file and a route handler can import it cleanly (a string re-export from a "use server" file drags the chunking along). */
export const DRAWINGS_BUCKET = "drawings";
