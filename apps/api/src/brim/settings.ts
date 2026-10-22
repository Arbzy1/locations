import { z } from 'zod';
import type { Context } from 'hono';
import { getSettings, getVehicle, saveSettings } from './db/repo';
import { createDb, brimTenant, type BrimContext } from "./context";

const patchBody = z.object({
  defaultVehicleId: z.string().nullable().optional(),
});

export async function getSettingsHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const row = await getSettings(createDb(c.env), tenant);
  return c.json({
    defaultVehicleId: row?.default_vehicle_id ?? null,
  });
}

export async function patchSettingsHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const parsed = patchBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const db = createDb(c.env);
  const defaultVehicleId = parsed.data.defaultVehicleId;
  if (defaultVehicleId) {
    if (!(await getVehicle(db, tenant, defaultVehicleId))) {
      return c.json({ error: 'not_found' }, 404);
    }
  }
  const existing = await getSettings(db, tenant);
  if (defaultVehicleId === null) {
    await saveSettings(db, {
      tenant: tenant,
      updated_at: new Date().toISOString(),
    });
    return c.json({ defaultVehicleId: null });
  }
  const row = await saveSettings(db, {
    tenant: tenant,
    updated_at: new Date().toISOString(),
    ...(defaultVehicleId
      ? { default_vehicle_id: defaultVehicleId }
      : existing?.default_vehicle_id
        ? { default_vehicle_id: existing.default_vehicle_id }
        : {}),
  });
  return c.json({ defaultVehicleId: row.default_vehicle_id ?? null });
}
