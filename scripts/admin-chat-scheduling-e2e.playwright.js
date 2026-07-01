async (page) => {
  const smokeId = `smoke_chat_schedule_${Date.now()}`;
  const cleanup = async () => page.evaluate(async ({ smokeId }) => {
    const {
      collection,
      deleteDoc,
      doc,
      getDocs,
      query,
      where,
    } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseDb } = await import('/js/firebase-client.js');

    const chatRef = doc(firebaseDb, 'chats', smokeId);
    const proposalSnap = await getDocs(collection(chatRef, 'programaciones')).catch(() => ({ docs: [] }));
    await Promise.all((proposalSnap.docs || []).map((item) => deleteDoc(item.ref).catch(() => {})));
    const messageSnap = await getDocs(collection(chatRef, 'mensajes')).catch(() => ({ docs: [] }));
    await Promise.all((messageSnap.docs || []).map((item) => deleteDoc(item.ref).catch(() => {})));
    const classSnap = await getDocs(query(collection(firebaseDb, 'clases'), where('assignmentId', '==', smokeId))).catch(() => ({ docs: [] }));
    await Promise.all((classSnap.docs || []).map((item) => deleteDoc(item.ref).catch(() => {})));
    await deleteDoc(chatRef).catch(() => {});
    await deleteDoc(doc(firebaseDb, 'asignaciones', smokeId)).catch(() => {});
  }, { smokeId }).catch(() => {});

  try {
    await cleanup();
    await page.evaluate(async ({ smokeId }) => {
      const {
        doc,
        serverTimestamp,
        setDoc,
      } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const adminUid = window.CD10CurrentUser?.uid || window.CD10CurrentUser?.id || '';
      const familyUid = `${smokeId}_family`;
      const teacherUid = `${smokeId}_teacher`;
      const studentId = `${smokeId}_student`;
      const participantUids = {
        [adminUid]: true,
        [familyUid]: true,
        [teacherUid]: true,
      };

      await setDoc(doc(firebaseDb, 'asignaciones', smokeId), {
        id: smokeId,
        requestId: smokeId,
        solicitud_id: smokeId,
        familyUid,
        familia_id: familyUid,
        teacherUid,
        profesor_id: teacherUid,
        studentId,
        alumno_id: studentId,
        materia: 'Smoke horario',
        subject: 'Smoke horario',
        active: true,
        activa: true,
        status: 'activa',
        estado: 'activa',
        schedulingStatus: 'pendiente_horario',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(firebaseDb, 'chats', smokeId), {
        assignmentId: smokeId,
        asignacion_id: smokeId,
        familyUid,
        familia_id: familyUid,
        teacherUid,
        profesor_id: teacherUid,
        studentId,
        alumno_id: studentId,
        familyName: 'Familia Smoke',
        teacherName: 'Profesor Smoke',
        studentName: 'Alumno Smoke',
        materia: 'Smoke horario',
        participantUids,
        active: true,
        schedulingStatus: 'pendiente_horario',
        lastMessage: 'Smoke test',
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }, { smokeId });

    await page.locator('[data-section="chats"]').click();
    await page.waitForSelector('[data-chat-tab="chats"]', { timeout: 20000 });
    await page.locator('[data-chat-tab="chats"]').click();
    await page.waitForSelector('[data-chat-list]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.locator('[data-chat-id]').filter({ hasText: 'Smoke horario' }).first().click();
    await page.waitForSelector('[data-open-schedule-planner]', { timeout: 20000 });
    await page.locator('[data-open-schedule-planner]').filter({ hasText: 'Proponer semanal' }).first().click();
    await page.waitForSelector('[data-schedule-form]', { timeout: 20000 });

    const date = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.locator('[data-schedule-date]').fill(date);
    await page.locator('[data-schedule-start]').fill('18:00');
    await page.locator('[data-schedule-end]').fill('19:00');
    await page.locator('[data-schedule-modality]').selectOption('online');
    await page.locator('[data-schedule-notes]').fill('Smoke test temporal');
    await page.locator('[data-schedule-form]').evaluate((form) => form.requestSubmit());
    await page.waitForSelector('[data-schedule-proposal-id]', { timeout: 20000 });
    await page.locator('[data-accept-schedule]').first().click();
    await page.waitForTimeout(2500);

    const result = await page.evaluate(async ({ smokeId }) => {
      const {
        collection,
        getDocs,
        query,
        where,
      } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const classSnap = await getDocs(query(collection(firebaseDb, 'clases'), where('assignmentId', '==', smokeId)));
      const classes = classSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
      return {
        classes: classes.map((item) => ({
          id: item.id,
          estado: item.estado,
          status: item.status,
          materia: item.materia,
          scheduleProposalId: item.scheduleProposalId,
          createdFrom: item.createdFrom,
        })),
      };
    }, { smokeId });

    if (result.classes.length !== 1) throw new Error(`Expected one smoke class, got ${result.classes.length}.`);
    const created = result.classes[0];
    if (created.createdFrom !== 'chat_schedule_proposal' || created.status !== 'confirmada') {
      throw new Error(`Unexpected smoke class payload: ${JSON.stringify(created)}`);
    }

    return {
      smokeId,
      classCreated: true,
      classStatus: created.status,
      createdFrom: created.createdFrom,
    };
  } finally {
    await cleanup();
  }
}
