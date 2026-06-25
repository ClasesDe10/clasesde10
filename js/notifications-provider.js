/**
 * ClasesDe10 - notifications provider.
 *
 * Uses the shared data client so dashboards do not depend on a backend vendor.
 */

export async function watchUnreadNotifications(db, usuarioId, callback) {
  if (!db || !usuarioId || typeof callback !== 'function') return null;

  const actualizar = async () => {
    const { count } = await db
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('usuario_id', usuarioId)
      .eq('leida', false);
    callback(Number(count || 0));
  };

  await actualizar();

  return db.channel(`notif-${usuarioId}`)
    .on('data_changes', {
      event: '*',
      table: 'notificaciones',
      filter: `usuario_id=eq.${usuarioId}`,
    }, actualizar)
    .subscribe();
}
