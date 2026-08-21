async (page) => {
  const baseUrl = page.url().replace(/\/$/, '');
  const response = await page.request.get(`${baseUrl}/pages/dashboard/familia.html`);
  if (!response.ok()) throw new Error(`No se pudo cargar el panel familiar: ${response.status()}`);
  const source = await response.text();
  await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="${baseUrl}/css/dashboard.css"></head><body></body></html>`);
  const modalFound = await page.evaluate((html) => {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const modal = parsed.getElementById('modal-solicitud');
    if (!modal) return false;
    document.body.innerHTML = modal.outerHTML;
    return true;
  }, source);
  if (!modalFound) throw new Error('No se encontro el formulario real de solicitud.');
  await page.evaluate(async (moduleUrl) => {
    const course = await import(moduleUrl);
    window.__course = course;
    const modal = document.getElementById('modal-solicitud');
    const select = document.getElementById('sol-curso');
    const group = document.getElementById('sol-curso-otro-group');
    const input = document.getElementById('sol-curso-otro');
    modal.classList.add('open');
    const toggle = () => {
      const custom = select.value === course.CUSTOM_EDUCATION_COURSE_VALUE;
      group.hidden = !custom;
      input.disabled = !custom;
      input.required = custom;
      if (!custom) input.value = '';
    };
    select.addEventListener('change', toggle);
    window.__resolvedCourse = () => course.resolveEducationCourse(select.value, input.value);
    window.__educationStage = () => course.educationStageForCourse(window.__resolvedCourse());
    window.__applyStudentCourse = (student) => {
      const suggestion = course.educationCourseFromStudent(student);
      select.value = suggestion.selectValue;
      input.value = suggestion.customValue;
      toggle();
    };
    toggle();
  }, `${baseUrl}/js/education-course.js?v=ui-smoke`);

  const courseSelect = page.locator('#sol-curso');
  const customGroup = page.locator('#sol-curso-otro-group');
  const customInput = page.locator('#sol-curso-otro');
  if ((await courseSelect.getAttribute('required')) === null) throw new Error('El curso exacto no es obligatorio.');

  const optionValues = await courseSelect.locator('option').evaluateAll((options) => options.map((option) => option.value));
  if (optionValues.includes('ESO') || optionValues.includes('Primaria') || optionValues.includes('Bachillerato')) {
    throw new Error(`El selector aun permite franjas genericas: ${optionValues.join(', ')}`);
  }
  if (!optionValues.includes('3º ESO') || !optionValues.includes('2º Bachillerato')) {
    throw new Error('Faltan cursos escolares exactos en el selector.');
  }

  await courseSelect.selectOption('4º ESO');
  const standard = await page.evaluate(() => ({ course: window.__resolvedCourse(), stage: window.__educationStage() }));
  if (standard.course !== '4º ESO' || standard.stage !== 'ESO') throw new Error(`Curso estandar mal resuelto: ${JSON.stringify(standard)}`);

  await courseSelect.selectOption('__otro__');
  if (await customGroup.isHidden()) throw new Error('El campo de otro curso no se muestra.');
  if (!(await customInput.isEnabled())) throw new Error('El campo de otro curso sigue deshabilitado.');
  await customInput.fill('ESO');
  if (await page.evaluate(() => window.__resolvedCourse()) !== '') throw new Error('Una franja generica escrita manualmente se ha aceptado como curso exacto.');
  await customInput.fill('2º Conservatorio profesional');
  if (await page.evaluate(() => window.__resolvedCourse()) !== '2º Conservatorio profesional') throw new Error('No se conserva un curso personalizado valido.');

  await page.evaluate(() => window.__applyStudentCourse({ curso: '3º', nivel_educativo: 'ESO' }));
  const autofill = await courseSelect.inputValue();
  if (autofill !== '3º ESO') throw new Error(`El curso del alumno no se autocompleta: ${autofill}`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error('El formulario genera desbordamiento horizontal.');

  return {
    exactOptions: optionValues.filter((value) => value && value !== '__otro__').length,
    standard,
    custom: '2º Conservatorio profesional',
    autofill,
    overflow,
  };
}
