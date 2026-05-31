/**
 * ClasesDe10 — SEO Components
 * Inyecta schema.org, OpenGraph y meta tags dinámicamente.
 */

const SITE = {
  name:    'ClasesDe10',
  url:     'https://www.clasesde10.es',
  logo:    'https://clasesde10.wordpress.com/wp-content/uploads/2025/07/cropped-chatgpt-image-17-jul-2025-20_00_31.png',
  phone:   '+34 600 000 000',
  email:   'hola@clasesde10.es',
  address: { street: 'Madrid', city: 'Madrid', region: 'Comunidad de Madrid', country: 'ES', postal: '28001' },
  social:  { instagram: 'https://instagram.com/clasesde10', facebook: 'https://facebook.com/clasesde10' },
};

/**
 * Inyecta JSON-LD en <head>
 */
function injectSchema(schema) {
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.textContent = JSON.stringify(schema, null, 2);
  document.head.appendChild(el);
}

/**
 * Schema: EducationalOrganization + LocalBusiness (página principal)
 */
export function schemaOrganizacion() {
  injectSchema({
    '@context': 'https://schema.org',
    '@type': ['EducationalOrganization', 'LocalBusiness'],
    name: SITE.name,
    url: SITE.url,
    logo: SITE.logo,
    telephone: SITE.phone,
    email: SITE.email,
    description: 'ClasesDe10 conecta familias con profesores particulares de confianza en Madrid. Clases de matemáticas, inglés, física, química, lengua y más para Primaria, ESO, Bachillerato y Universidad.',
    priceRange: '€€',
    currenciesAccepted: 'EUR',
    paymentAccepted: 'Bizum, Transferencia bancaria',
    openingHours: 'Mo-Su 08:00-22:00',
    image: SITE.logo,
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.street,
      addressLocality: SITE.address.city,
      addressRegion: SITE.address.region,
      postalCode: SITE.address.postal,
      addressCountry: SITE.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: 40.4168, longitude: -3.7038 },
    areaServed: {
      '@type': 'City',
      name: 'Madrid',
      '@id': 'https://www.wikidata.org/wiki/Q2807',
    },
    sameAs: [SITE.social.instagram, SITE.social.facebook],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Clases particulares',
      itemListElement: [
        { '@type': 'Offer', itemOffered: { '@type': 'Course', name: 'Clases de Matemáticas', provider: { '@type': 'Organization', name: SITE.name } } },
        { '@type': 'Offer', itemOffered: { '@type': 'Course', name: 'Clases de Inglés', provider: { '@type': 'Organization', name: SITE.name } } },
        { '@type': 'Offer', itemOffered: { '@type': 'Course', name: 'Clases de Física y Química', provider: { '@type': 'Organization', name: SITE.name } } },
        { '@type': 'Offer', itemOffered: { '@type': 'Course', name: 'Clases de Bachillerato', provider: { '@type': 'Organization', name: SITE.name } } },
      ],
    },
  });
}

/**
 * Schema: Course (páginas de materia)
 */
export function schemaCurso({ nombre, descripcion, nivel, url }) {
  injectSchema({
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: nombre,
    description: descripcion,
    url: `${SITE.url}${url}`,
    provider: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
    },
    educationalLevel: nivel,
    inLanguage: 'es',
    availableLanguage: 'es',
    offers: {
      '@type': 'Offer',
      price: '15',
      priceCurrency: 'EUR',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '15',
        priceCurrency: 'EUR',
        unitText: 'HOUR',
      },
      availability: 'https://schema.org/InStock',
      validFrom: '2024-09-01',
    },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: ['onsite', 'online'],
      location: {
        '@type': 'Place',
        name: 'Madrid',
        address: { '@type': 'PostalAddress', addressLocality: 'Madrid', addressCountry: 'ES' },
      },
    },
  });
}

/**
 * Schema: FAQ
 */
export function schemaFAQ(preguntas) {
  injectSchema({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: preguntas.map(p => ({
      '@type': 'Question',
      name: p.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: p.respuesta },
    })),
  });
}

/**
 * Schema: BreadcrumbList
 */
export function schemaBreadcrumb(items) {
  injectSchema({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE.url}${item.url}`,
    })),
  });
}

/**
 * Inyectar OpenGraph y Twitter Cards
 */
export function injectOpenGraph({ title, description, url, image, type = 'website' }) {
  const meta = [
    ['og:type',        type],
    ['og:title',       title],
    ['og:description', description],
    ['og:url',         `${SITE.url}${url}`],
    ['og:image',       image || SITE.logo],
    ['og:site_name',   SITE.name],
    ['og:locale',      'es_ES'],
    ['twitter:card',   'summary_large_image'],
    ['twitter:title',  title],
    ['twitter:description', description],
    ['twitter:image',  image || SITE.logo],
  ];

  meta.forEach(([name, content]) => {
    let el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(name.startsWith('twitter') ? 'name' : 'property', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  });

  // Canonical
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `${SITE.url}${url}`;
}

/**
 * Render breadcrumb HTML visible + schema
 */
export function renderBreadcrumb(contenedor, items) {
  if (!contenedor) return;

  schemaBreadcrumb(items);

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Ruta de navegación');
  nav.style.cssText = 'font-size:.8rem;color:#8a8478;margin-bottom:16px';

  nav.innerHTML = items.map((item, i) => {
    const isLast = i === items.length - 1;
    return isLast
      ? `<span style="color:#1a1612;font-weight:600">${item.name}</span>`
      : `<a href="${item.url}" style="color:#8a8478;text-decoration:none">${item.name}</a> <span style="margin:0 6px">›</span>`;
  }).join('');

  contenedor.prepend(nav);
}
