async (page) => {
  const email = process.env.CD10_PUBLIC_FAMILY_SMOKE_EMAIL;
  const longNeed = [
    'Necesitamos apoyo intensivo y personalizado en Matemáticas para 3º de ESO,',
    'con especial atención a álgebra, ecuaciones, geometría y resolución de problemas,',
    'preparación de exámenes, organización del estudio y seguimiento semanal.',
    'Preferimos clases presenciales en Madrid los martes y jueves por la tarde,',
    'aunque también podemos valorar alguna sesión online de refuerzo cuando sea necesario.',
  ].join(' ');

  const result = await page.evaluate(async ({ smokeEmail, need }) => {
    const { submitLead } = await import(`/js/public-leads.js?v=production-smoke-${Date.now()}`);
    return submitLead({
      tipo: 'familia',
      nombre: 'Familia QA Solicitud Larga',
      email: smokeEmail,
      telefono: '+34600000000',
      asunto: `Profesor para ${need.slice(0, 140)}`,
      mensaje: need,
      accountStatus: 'pending_activation',
      metadata: {
        alumno: 'Alumno QA Solicitud Larga',
        materia: need,
        account_mode: 'assisted_parent_activation',
        canal: 'production_browser_smoke',
        consent_privacy: true,
      },
    });
  }, { smokeEmail: email, need: longNeed });

  if (result.error) throw new Error(result.error.message || 'Public family request failed.');
  if (!result.data?.id) throw new Error('The public family request did not return a lead ID.');
  return {
    leadId: result.data.id,
    longInputCharacters: longNeed.length,
    accepted: true,
  };
}
