import type { Entry } from "../catalogue-fields";

/** An entries file's list, keeping each key's own name for the runners' type. Its own file: catalogue-fields imports the entries. */
export const defineEntries = <K extends string>(entries: Entry<K>[]): Entry<K>[] => entries;
