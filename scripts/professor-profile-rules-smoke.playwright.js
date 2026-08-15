async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const email = process.env.CD10_TEMP_TEACHER_EMAIL;
  const password = process.env.CD10_TEMP_TEACHER_PASSWORD;
  if (!email || !password) throw new Error('Missing temporary teacher credentials.');

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});

  return await page.evaluate(async ({ email, password }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { doc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');

    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const uid = credential.user.uid;
    const tinyPhoto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==';

    try {
      await setDoc(doc(firebaseDb, 'users', uid), {
        email,
        nombre: 'Test Profesor',
        apellidos: 'Temporal',
        telefono: '600000000',
        role: 'profesor',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(`users write failed: ${error.message}`);
    }

    try {
      await setDoc(doc(firebaseDb, 'profesores', uid), {
        userUid: uid,
        email,
        nombre: 'Test Profesor',
        apellidos: 'Temporal',
        telefono: '600000000',
        active: true,
        status: 'pendiente_perfil',
        perfil_completo: false,
        profileComplete: false,
        estado_verificacion: 'pendiente_perfil',
        verificationStatus: 'pendiente_perfil',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(`profesores minimal write failed: ${error.message}`);
    }

    const professorRef = doc(firebaseDb, 'profesores', uid);
    const stages = [];
    function isPermissionDenied(error) {
      return String(error?.code || '').includes('permission-denied')
        || /missing or insufficient permissions|permission-denied|PERMISSION_DENIED/i.test(String(error?.message || error || ''));
    }
    async function mergeStage(stage, payload) {
      try {
        await setDoc(professorRef, {
          ...payload,
          updatedAt: serverTimestamp(),
          updated_at: new Date().toISOString(),
        }, { merge: true });
        stages.push(stage);
      } catch (error) {
        throw new Error(`profesores ${stage} failed: ${error.message}; passed=${stages.join(',')}`);
      }
    }

    await mergeStage('contact', {
      nombre: 'Test Profesor',
      apellidos: 'Temporal',
      telefono: '600000000',
    });
    await mergeStage('photo', {
      foto_url: tinyPhoto,
    });
    await mergeStage('street', {
      direccion: 'Calle Test 1',
    });
    await mergeStage('city-postal', {
      ciudad: 'Madrid',
      codigo_postal: '28001',
    });
    await mergeStage('zona', {
      zona: 'Madrid centro',
    });
    await mergeStage('study-level', {
      nivel_estudios: 'Grado universitario',
    });
    await mergeStage('exact-study', {
      estudio_exacto: 'Grado en Matematicas',
    });
    await mergeStage('school-legacy', {
      colegio: 'Colegio El Prado',
    });
    await mergeStage('study-center-legacy', {
      centro_estudios: 'Universidad Complutense de Madrid',
    });
    await mergeStage('grades', {
      nota_bachillerato: 8.5,
      nota_media_universidad: 8.1,
    });
    await mergeStage('offer', {
      bio: 'Profesor temporal de validacion con descripcion suficiente para probar reglas de perfil.',
      experiencia_anios: 3,
      disponibilidad_resumen: 'Tardes entre semana',
      materias: ['Matematicas', 'Padel', 'Guitarra'],
      niveles_educativos: ['ESO', 'Bachillerato', 'Deporte', 'Musica'],
      especialidades: ['EVAU', 'Padel iniciacion'],
      idiomas: ['Espanol', 'Ingles'],
      certificaciones: ['C1 Ingles'],
      acepta_bizum: true,
      tiene_coche: true,
      perfil_completo: true,
    });
    await mergeStage('payout', {
      frecuencia_cobro_profesor: 'quincenal',
      payoutFrequency: 'quincenal',
      fecha_inicio_cobro_profesor: '2026-07-15',
      payoutAnchorDate: '2026-07-15',
      dia_cobro_profesor: 15,
      payoutDayOfMonth: 15,
      payoutLockedAt: serverTimestamp(),
    });

    let payoutChangeDenied = false;
    try {
      await setDoc(professorRef, {
        frecuencia_cobro_profesor: 'mensual',
        payoutFrequency: 'mensual',
        fecha_inicio_cobro_profesor: '2026-08-01',
        payoutAnchorDate: '2026-08-01',
        dia_cobro_profesor: 1,
        payoutDayOfMonth: 1,
        payoutLockedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      if (!isPermissionDenied(error)) throw new Error(`profesores payout-lock failed unexpectedly: ${error.message}`);
      payoutChangeDenied = true;
    }
    if (!payoutChangeDenied) throw new Error('profesores payout-lock unexpectedly allowed a second payout change');

    return {
      uid,
      email,
      wroteUser: true,
      wroteTeacher: true,
      stages,
      payoutChangeDenied,
    };
  }, { email, password });
}
