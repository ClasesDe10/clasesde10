/**
 * Generated from the Madrid City Council official street directory.
 * Regenerate with: npm run geo:generate-postal-centroids
 */

export const MADRID_POSTAL_CENTROIDS_SOURCE = Object.freeze({
  authority: 'Ayuntamiento de Madrid - Portal de Datos Abiertos',
  dataset: 'Direcciones postales vigentes con coordenadas geograficas',
  url: 'https://datos.madrid.es/dataset/200075-0-callejero/resource/200075-1-callejero-csv/download/200075-1-callejero-csv.csv',
  license: 'CC BY 4.0',
  generatedAt: '2026-08-21',
  method: 'median_of_official_address_coordinates',
});

export const MADRID_POSTAL_CENTROIDS = Object.freeze({
  '28001': Object.freeze({ lat: 40.425536, lng: -3.68396, samples: 1336 }),
  '28002': Object.freeze({ lat: 40.446683, lng: -3.674697, samples: 4523 }),
  '28003': Object.freeze({ lat: 40.442678, lng: -3.703113, samples: 1836 }),
  '28004': Object.freeze({ lat: 40.423992, lng: -3.701029, samples: 2812 }),
  '28005': Object.freeze({ lat: 40.408194, lng: -3.710492, samples: 3535 }),
  '28006': Object.freeze({ lat: 40.43394, lng: -3.681193, samples: 1920 }),
  '28007': Object.freeze({ lat: 40.405539, lng: -3.672197, samples: 2503 }),
  '28008': Object.freeze({ lat: 40.428111, lng: -3.721342, samples: 1923 }),
  '28009': Object.freeze({ lat: 40.420683, lng: -3.674742, samples: 1369 }),
  '28010': Object.freeze({ lat: 40.432747, lng: -3.698514, samples: 2006 }),
  '28011': Object.freeze({ lat: 40.408399, lng: -3.734701, samples: 4522 }),
  '28012': Object.freeze({ lat: 40.41059, lng: -3.701629, samples: 2744 }),
  '28013': Object.freeze({ lat: 40.418522, lng: -3.708469, samples: 1407 }),
  '28014': Object.freeze({ lat: 40.413543, lng: -3.69531, samples: 1478 }),
  '28015': Object.freeze({ lat: 40.432636, lng: -3.710039, samples: 2397 }),
  '28016': Object.freeze({ lat: 40.457369, lng: -3.672411, samples: 2685 }),
  '28017': Object.freeze({ lat: 40.428772, lng: -3.644975, samples: 4937 }),
  '28018': Object.freeze({ lat: 40.384731, lng: -3.655789, samples: 4037 }),
  '28019': Object.freeze({ lat: 40.393397, lng: -3.724904, samples: 6364 }),
  '28020': Object.freeze({ lat: 40.454789, lng: -3.698458, samples: 2587 }),
  '28021': Object.freeze({ lat: 40.345653, lng: -3.704606, samples: 7559 }),
  '28022': Object.freeze({ lat: 40.443889, lng: -3.604597, samples: 6519 }),
  '28023': Object.freeze({ lat: 40.458842, lng: -3.7829, samples: 9016 }),
  '28024': Object.freeze({ lat: 40.394289, lng: -3.772319, samples: 2398 }),
  '28025': Object.freeze({ lat: 40.383542, lng: -3.738833, samples: 5193 }),
  '28026': Object.freeze({ lat: 40.38421, lng: -3.706886, samples: 5384 }),
  '28027': Object.freeze({ lat: 40.440519, lng: -3.644717, samples: 5900 }),
  '28028': Object.freeze({ lat: 40.432368, lng: -3.666362, samples: 3770 }),
  '28029': Object.freeze({ lat: 40.470172, lng: -3.699, samples: 4457 }),
  '28030': Object.freeze({ lat: 40.406303, lng: -3.643531, samples: 3335 }),
  '28031': Object.freeze({ lat: 40.376111, lng: -3.621575, samples: 5827 }),
  '28032': Object.freeze({ lat: 40.404519, lng: -3.608733, samples: 4471 }),
  '28033': Object.freeze({ lat: 40.474236, lng: -3.658428, samples: 4858 }),
  '28034': Object.freeze({ lat: 40.493024, lng: -3.691211, samples: 5810 }),
  '28035': Object.freeze({ lat: 40.477447, lng: -3.726042, samples: 7009 }),
  '28036': Object.freeze({ lat: 40.464321, lng: -3.683599, samples: 1522 }),
  '28037': Object.freeze({ lat: 40.430542, lng: -3.62349, samples: 3602 }),
  '28038': Object.freeze({ lat: 40.397667, lng: -3.660122, samples: 4483 }),
  '28039': Object.freeze({ lat: 40.460578, lng: -3.706364, samples: 6423 }),
  '28040': Object.freeze({ lat: 40.449213, lng: -3.7164, samples: 818 }),
  '28041': Object.freeze({ lat: 40.368649, lng: -3.696919, samples: 5534 }),
  '28042': Object.freeze({ lat: 40.465144, lng: -3.589503, samples: 7275 }),
  '28043': Object.freeze({ lat: 40.459581, lng: -3.648511, samples: 7762 }),
  '28044': Object.freeze({ lat: 40.374332, lng: -3.760758, samples: 3684 }),
  '28045': Object.freeze({ lat: 40.396289, lng: -3.692772, samples: 3331 }),
  '28046': Object.freeze({ lat: 40.469644, lng: -3.687939, samples: 555 }),
  '28047': Object.freeze({ lat: 40.395922, lng: -3.745467, samples: 3815 }),
  '28048': Object.freeze({ lat: 40.530715, lng: -3.779793, samples: 762 }),
  '28049': Object.freeze({ lat: 40.504776, lng: -3.701569, samples: 2442 }),
  '28050': Object.freeze({ lat: 40.498158, lng: -3.664428, samples: 2837 }),
  '28051': Object.freeze({ lat: 40.363511, lng: -3.598986, samples: 3945 }),
  '28052': Object.freeze({ lat: 40.399119, lng: -3.557308, samples: 4187 }),
  '28053': Object.freeze({ lat: 40.381944, lng: -3.668564, samples: 8368 }),
  '28054': Object.freeze({ lat: 40.364882, lng: -3.757933, samples: 1478 }),
  '28055': Object.freeze({ lat: 40.488364, lng: -3.631947, samples: 4018 }),
});

export function madridPostalCentroid(postalCode) {
  const normalized = String(postalCode ?? '').trim();
  return MADRID_POSTAL_CENTROIDS[normalized] || null;
}
