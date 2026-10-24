/** Pins how a refused master delete reads. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { deleteRefusal } from "./delete-refusal";

test("a key refusal names what uses it, by what a person calls it", () => {
  const error = {
    code: "23503",
    message:
      'update or delete on table "vendors" violates foreign key constraint "purchase_orders_vendor_id_fkey" on table "purchase_orders"',
  };
  assert.equal(
    deleteRefusal(error, "vendor", true),
    "Purchase orders use this vendor, so it cannot be deleted. Untick Active to retire it instead.",
  );
  // A villa has no Active switch, and its own record's receipts are what refuse.
  assert.equal(
    deleteRefusal(
      {
        code: "23503",
        message:
          'update or delete on table "client_engagements" violates foreign key constraint "x" on table "client_receipts"',
      },
      "villa",
      false,
    ),
    "Client receipts use this villa, so it cannot be deleted.",
  );
  assert.equal(
    deleteRefusal({ code: "23503", message: 'on table "brand_new_table"' }, "store", true),
    "Other records use this store, so it cannot be deleted. Untick Active to retire it instead.",
  );
});

test("the guard's own words pass through; anything else is a plain retry", () => {
  assert.equal(
    deleteRefusal(
      { code: "P0001", message: "Items use this brand, so it cannot be deleted" },
      "brand",
      true,
    ),
    "Items use this brand, so it cannot be deleted. Untick Active to retire it instead.",
  );
  assert.equal(
    deleteRefusal(
      { message: "This villa is sold to a client, so it cannot be deleted" },
      "villa",
      false,
    ),
    "This villa is sold to a client, so it cannot be deleted.",
  );
  assert.equal(
    deleteRefusal({ code: "42501", message: "permission denied" }, "vendor", true),
    "Could not delete this vendor. Try again.",
  );
});
