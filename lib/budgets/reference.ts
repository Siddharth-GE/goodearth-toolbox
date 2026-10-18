/**
 * The reference is identity: it includes the version so a corrected quotation differs from the one sent (0012).
 * Spaces stripped and case fixed so one unit never mints two references (unit names are unique per project, 0017).
 */
export function quoteReference(unitName: string, revisionNo: number, version: number): string {
  return `QT/${unitName}/R${revisionNo}-V${version}`.toUpperCase().replace(/\s+/g, "");
}
