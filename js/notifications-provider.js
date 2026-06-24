/**
 * ClasesDe10 - notifications provider.
 *
 * Current implementation: Supabase `notificaciones` + realtime channel.
 * Future Firebase cutover: replace with Firestore `onSnapshot` in this file.
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
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'notificaciones',
      filter: `usuario_id=eq.${usuarioId}`,
    }, actualizar)
    .subscribe();
}

