export const writeAudit = async (client, actorId, action, entityType, entityId, metadata = {}) => {
  await client.query(
    `INSERT INTO operations_audit_log (actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId || null, action, entityType, String(entityId), JSON.stringify(metadata)],
  );
};
