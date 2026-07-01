async (page) => {
  const result = await page.evaluate(async () => {
    const {
      collection,
      deleteDoc,
      doc,
      getDocs,
      limit,
      query,
      serverTimestamp,
      updateDoc,
    } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseDb } = await import('/js/firebase-client.js');

    async function listCollection(name, max = 1200) {
      const snap = await getDocs(query(collection(firebaseDb, name), limit(max))).catch(() => ({ docs: [] }));
      return snap.docs || [];
    }

    async function deleteRefs(refs = []) {
      const unique = new Map(refs.filter(Boolean).map((ref) => [ref.path, ref]));
      await Promise.all([...unique.values()].map((ref) => deleteDoc(ref).catch(() => {})));
      return unique.size;
    }

    const classDocs = await listCollection('clases');
    const busyDocs = await listCollection('busySlots');
    const notificationDocs = await listCollection('notificaciones');
    const chatDocs = await listCollection('chats');

    let proposalsDeleted = 0;
    let scheduleMessagesDeleted = 0;
    let chatsReset = 0;
    const scheduleMessageNeedles = [
      'Horario semanal aceptado',
      'Horario semanal fijo propuesto',
      'Horario semanal propuesto',
      'Clase puntual aceptada',
      'Clase puntual propuesto',
      'Clase puntual propuesta',
      'clase creada',
      'Prueba automatica Codex',
    ];

    for (const chat of chatDocs) {
      const proposalSnap = await getDocs(collection(chat.ref, 'programaciones')).catch(() => ({ docs: [] }));
      proposalsDeleted += await deleteRefs((proposalSnap.docs || []).map((item) => item.ref));

      const messageSnap = await getDocs(collection(chat.ref, 'mensajes')).catch(() => ({ docs: [] }));
      const scheduleMessageRefs = (messageSnap.docs || [])
        .filter((item) => {
          const body = String(item.data()?.body || '');
          return scheduleMessageNeedles.some((needle) => body.includes(needle));
        })
        .map((item) => item.ref);
      scheduleMessagesDeleted += await deleteRefs(scheduleMessageRefs);

      await updateDoc(chat.ref, {
        activeClassId: null,
        schedulingStatus: 'pendiente_horario',
        relationshipStage: 'pendiente_horario',
        lastRelationshipEvent: 'class_artifacts_reset',
        lastMessage: 'Chat listo para acordar horario.',
        lastMessageAt: serverTimestamp(),
        relationshipUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      chatsReset += 1;
    }

    const classNotificationRefs = notificationDocs
      .filter((item) => {
        const data = item.data() || {};
        const type = String(data.type || '');
        const payload = data.payload || {};
        return type.startsWith('class_')
          || ['schedule_proposed', 'schedule_accepted', 'schedule_rejected'].includes(type)
          || Boolean(payload.classId || payload.scheduleProposalId);
      })
      .map((item) => item.ref);

    return {
      classesDeleted: await deleteRefs(classDocs.map((item) => item.ref)),
      busySlotsDeleted: await deleteRefs(busyDocs.map((item) => item.ref)),
      classNotificationsDeleted: await deleteRefs(classNotificationRefs),
      proposalsDeleted,
      scheduleMessagesDeleted,
      chatsReset,
    };
  });

  return result;
}
