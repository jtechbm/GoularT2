import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SCHEMA } from "./schema.ts";

test("fechamentos e histórico usam a loja, não apenas a plataforma", () => {
  assert.match(SCHEMA, /idx_finance_loja_mes[\s\S]*client_marketplace_id, ref_month/);
  assert.match(SCHEMA, /idx_daily_loja_dia[\s\S]*client_marketplace_id, day/);
  assert.match(SCHEMA, /idx_ads_api[\s\S]*client_marketplace_id, external_id, period_start/);
  assert.match(SCHEMA, /finance_snapshots_client_marketplace_id_fkey[\s\S]*ON DELETE SET NULL/);
  assert.doesNotMatch(SCHEMA, /UNIQUE \(client_id, marketplace, ref_month\)/);
  assert.doesNotMatch(SCHEMA, /UNIQUE \(client_id, marketplace, day\)/);
});
