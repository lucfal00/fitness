// Exercise library (built-in, not stored in the document) and exercise resolution.
// No DOM, no storage.

export const GROUPS = [
  'petto', 'dorso', 'spalle', 'bicipiti', 'tricipiti', 'avambracci',
  'addome', 'glutei', 'quadricipiti', 'femorali', 'polpacci',
];

export const KINDS = ['weight', 'body', 'cardio', 'sport'];

// [slug, name, group, also]
const WEIGHT = [
  // petto
  ['panca_piana', 'Panca piana con bilanciere', 'petto', ['tricipiti', 'spalle']],
  ['panca_inclinata', 'Panca inclinata con bilanciere', 'petto', ['spalle', 'tricipiti']],
  ['panca_declinata', 'Panca declinata con bilanciere', 'petto', ['tricipiti']],
  ['panca_manubri', 'Panca piana con manubri', 'petto', ['tricipiti', 'spalle']],
  ['panca_inclinata_manubri', 'Panca inclinata con manubri', 'petto', ['spalle', 'tricipiti']],
  ['croci_manubri', 'Croci con manubri', 'petto', ['spalle']],
  ['croci_cavi', 'Croci ai cavi', 'petto', ['spalle']],
  ['pec_deck', 'Pec deck', 'petto', ['spalle']],
  ['chest_press', 'Chest press', 'petto', ['tricipiti', 'spalle']],
  ['pullover_manubrio', 'Pullover con manubrio', 'petto', ['dorso', 'tricipiti']],
  // dorso
  ['lat_machine', 'Lat machine presa larga', 'dorso', ['bicipiti']],
  ['lat_machine_stretta', 'Lat machine presa stretta', 'dorso', ['bicipiti']],
  ['rematore_bilanciere', 'Rematore con bilanciere', 'dorso', ['bicipiti', 'spalle']],
  ['rematore_manubrio', 'Rematore con manubrio', 'dorso', ['bicipiti', 'spalle']],
  ['pulley', 'Pulley basso', 'dorso', ['bicipiti', 'spalle']],
  ['t_bar', 'Rematore con T-bar', 'dorso', ['bicipiti', 'spalle']],
  ['rematore_macchina', 'Rematore alla macchina', 'dorso', ['bicipiti', 'spalle']],
  ['stacco', 'Stacco da terra', 'dorso', ['glutei', 'femorali', 'quadricipiti', 'avambracci']],
  ['pulldown_braccia_tese', 'Pulldown a braccia tese', 'dorso', ['tricipiti']],
  ['hyperextension', 'Iperestensioni', 'dorso', ['glutei', 'femorali']],
  // spalle
  ['military_press', 'Military press con bilanciere', 'spalle', ['tricipiti']],
  ['lento_manubri', 'Lento avanti con manubri', 'spalle', ['tricipiti']],
  ['shoulder_press', 'Shoulder press alla macchina', 'spalle', ['tricipiti']],
  ['alzate_laterali', 'Alzate laterali con manubri', 'spalle', []],
  ['alzate_laterali_cavo', 'Alzate laterali al cavo', 'spalle', []],
  ['alzate_frontali', 'Alzate frontali', 'spalle', ['petto']],
  ['alzate_posteriori', 'Alzate posteriori con manubri', 'spalle', ['dorso']],
  ['face_pull', 'Face pull', 'spalle', ['dorso']],
  ['tirate_mento', 'Tirate al mento', 'spalle', ['bicipiti']],
  ['scrollate', 'Scrollate con manubri', 'spalle', ['avambracci']],
  ['arnold_press', 'Arnold press', 'spalle', ['tricipiti']],
  // bicipiti
  ['curl_bilanciere', 'Curl con bilanciere', 'bicipiti', ['avambracci']],
  ['curl_manubri', 'Curl con manubri', 'bicipiti', ['avambracci']],
  ['curl_martello', 'Curl a martello', 'bicipiti', ['avambracci']],
  ['curl_panca_scott', 'Curl alla panca Scott', 'bicipiti', []],
  ['curl_cavo', 'Curl al cavo basso', 'bicipiti', ['avambracci']],
  ['curl_concentrato', 'Curl concentrato', 'bicipiti', []],
  ['curl_inclinata', 'Curl su panca inclinata', 'bicipiti', []],
  // tricipiti
  ['push_down', 'Push down al cavo', 'tricipiti', []],
  ['french_press', 'French press', 'tricipiti', []],
  ['estensioni_sopra_testa', 'Estensioni sopra la testa con manubrio', 'tricipiti', []],
  ['panca_presa_stretta', 'Panca presa stretta', 'tricipiti', ['petto', 'spalle']],
  ['kickback', 'Kickback con manubrio', 'tricipiti', []],
  ['estensioni_cavo_corda', 'Estensioni al cavo con corda', 'tricipiti', []],
  // avambracci
  ['curl_polso', 'Curl polsi con bilanciere', 'avambracci', []],
  ['curl_polso_inverso', 'Curl polsi inverso', 'avambracci', []],
  ['curl_inverso', 'Curl inverso', 'avambracci', ['bicipiti']],
  ['farmer_walk', 'Farmer walk', 'avambracci', ['spalle', 'addome']],
  // quadricipiti
  ['squat', 'Squat con bilanciere', 'quadricipiti', ['glutei', 'femorali']],
  ['front_squat', 'Front squat', 'quadricipiti', ['glutei', 'addome']],
  ['leg_press', 'Leg press', 'quadricipiti', ['glutei', 'femorali']],
  ['leg_extension', 'Leg extension', 'quadricipiti', []],
  ['hack_squat', 'Hack squat', 'quadricipiti', ['glutei']],
  ['squat_bulgaro', 'Squat bulgaro con manubri', 'quadricipiti', ['glutei']],
  ['affondi_manubri', 'Affondi con manubri', 'quadricipiti', ['glutei', 'femorali']],
  ['affondi_camminati', 'Affondi camminati', 'quadricipiti', ['glutei', 'femorali']],
  ['goblet_squat', 'Goblet squat', 'quadricipiti', ['glutei']],
  ['step_up', 'Step up con manubri', 'quadricipiti', ['glutei']],
  ['multipower_squat', 'Squat al multipower', 'quadricipiti', ['glutei']],
  ['adduttori_macchina', 'Adduttori alla macchina', 'quadricipiti', []],
  // femorali
  ['stacco_rumeno', 'Stacco rumeno', 'femorali', ['glutei', 'dorso']],
  ['leg_curl_sdraiato', 'Leg curl sdraiato', 'femorali', []],
  ['leg_curl_seduto', 'Leg curl seduto', 'femorali', []],
  ['good_morning', 'Good morning', 'femorali', ['glutei', 'dorso']],
  ['stacco_gamba_tesa', 'Stacco a gambe tese', 'femorali', ['glutei', 'dorso']],
  // glutei
  ['hip_thrust', 'Hip thrust con bilanciere', 'glutei', ['femorali']],
  ['glute_bridge', 'Glute bridge con bilanciere', 'glutei', ['femorali']],
  ['calci_cavo', 'Calci indietro al cavo', 'glutei', ['femorali']],
  ['abduzioni_macchina', 'Abduzioni alla macchina', 'glutei', []],
  ['glute_machine', 'Glute machine', 'glutei', ['femorali']],
  ['sumo_deadlift', 'Stacco sumo', 'glutei', ['quadricipiti', 'femorali', 'dorso']],
  // polpacci
  ['calf_in_piedi', 'Calf in piedi', 'polpacci', []],
  ['calf_seduto', 'Calf seduto', 'polpacci', []],
  ['calf_leg_press', 'Calf alla leg press', 'polpacci', []],
  // addome (con attrezzo)
  ['crunch_cavo', 'Crunch al cavo', 'addome', []],
  ['crunch_macchina', 'Crunch alla macchina', 'addome', []],
  ['woodchop', 'Woodchop al cavo', 'addome', ['spalle']],
  ['ab_wheel', 'Ruota addominale', 'addome', ['spalle', 'dorso']],
  ['russian_twist_peso', 'Russian twist con peso', 'addome', []],
];

// [slug, name, group, also, measure]
const BODY = [
  ['trazioni', 'Trazioni alla sbarra', 'dorso', ['bicipiti', 'avambracci'], 'reps'],
  ['trazioni_supine', 'Trazioni presa supina', 'dorso', ['bicipiti'], 'reps'],
  ['piegamenti', 'Piegamenti sulle braccia', 'petto', ['tricipiti', 'spalle'], 'reps'],
  ['piegamenti_diamante', 'Piegamenti a diamante', 'tricipiti', ['petto', 'spalle'], 'reps'],
  ['piegamenti_inclinati', 'Piegamenti con piedi rialzati', 'petto', ['spalle', 'tricipiti'], 'reps'],
  ['dip', 'Dip alle parallele', 'tricipiti', ['petto', 'spalle'], 'reps'],
  ['dip_panca', 'Dip alla panca', 'tricipiti', ['spalle'], 'reps'],
  ['australian_pull_up', 'Rematore australiano', 'dorso', ['bicipiti'], 'reps'],
  ['squat_corpo_libero', 'Squat a corpo libero', 'quadricipiti', ['glutei', 'femorali'], 'reps'],
  ['affondi_corpo_libero', 'Affondi a corpo libero', 'quadricipiti', ['glutei', 'femorali'], 'reps'],
  ['pistol_squat', 'Pistol squat', 'quadricipiti', ['glutei'], 'reps'],
  ['ponte_glutei', 'Ponte per glutei', 'glutei', ['femorali'], 'reps'],
  ['calf_corpo_libero', 'Sollevamenti sui polpacci a corpo libero', 'polpacci', [], 'reps'],
  ['crunch', 'Crunch', 'addome', [], 'reps'],
  ['sit_up', 'Sit up', 'addome', [], 'reps'],
  ['leg_raise', 'Sollevamento gambe da sdraiato', 'addome', [], 'reps'],
  ['hanging_leg_raise', 'Sollevamento gambe alla sbarra', 'addome', ['avambracci'], 'reps'],
  ['russian_twist', 'Russian twist', 'addome', [], 'reps'],
  ['bicycle_crunch', 'Bicycle crunch', 'addome', [], 'reps'],
  ['mountain_climber', 'Mountain climber', 'addome', ['spalle', 'quadricipiti'], 'reps'],
  ['superman', 'Superman', 'dorso', ['glutei'], 'reps'],
  ['burpee', 'Burpee', 'quadricipiti', ['petto', 'spalle', 'addome'], 'reps'],
  ['plank', 'Plank', 'addome', ['spalle'], 'time'],
  ['plank_laterale', 'Plank laterale', 'addome', ['spalle'], 'time'],
  ['wall_sit', 'Wall sit', 'quadricipiti', ['glutei'], 'time'],
  ['hollow_hold', 'Hollow body hold', 'addome', [], 'time'],
  ['dead_hang', 'Sospensione alla sbarra', 'avambracci', ['dorso', 'spalle'], 'time'],
  ['ponte_glutei_isometrico', 'Ponte glutei isometrico', 'glutei', ['femorali'], 'time'],
  ['superman_isometrico', 'Superman isometrico', 'dorso', ['glutei'], 'time'],
];

// [slug, name]
const CARDIO = [
  ['corsa', 'Corsa'],
  ['camminata', 'Camminata'],
  ['bici', 'Bici'],
  ['cyclette', 'Cyclette'],
  ['tapis_roulant', 'Tapis roulant'],
  ['ellittica', 'Ellittica'],
  ['vogatore', 'Vogatore'],
  ['nuoto', 'Nuoto'],
  ['salto_corda', 'Salto con la corda'],
];

const SPORT = [
  ['calcetto', 'Calcetto'],
  ['padel', 'Padel'],
  ['tennis', 'Tennis'],
  ['basket', 'Basket'],
  ['pallavolo', 'Pallavolo'],
  ['arrampicata', 'Arrampicata'],
  ['yoga', 'Yoga'],
  ['pilates', 'Pilates'],
];

export const LIBRARY = [
  ...WEIGHT.map(([s, name, group, also]) => ({ id: `lib_${s}`, name, kind: 'weight', group, also })),
  ...BODY.map(([s, name, group, also, measure]) => ({ id: `lib_${s}`, name, kind: 'body', measure, group, also })),
  ...CARDIO.map(([s, name]) => ({ id: `lib_${s}`, name, kind: 'cardio', group: null, also: [] })),
  ...SPORT.map(([s, name]) => ({ id: `lib_${s}`, name, kind: 'sport', group: null, also: [] })),
];

const BY_ID = new Map(LIBRARY.map((e) => [e.id, e]));

/** Exercise by id: own (even if deleted, for history), else library + edits; null if unknown. */
export function resolveExercise(doc, id) {
  const own = doc.exercises.find((e) => e.id === id);
  if (own) return own;
  const lib = BY_ID.get(id);
  if (!lib) return null;
  const edit = doc.exerciseEdits[id];
  if (!edit) return lib;
  const out = { ...lib };
  if (edit.name != null) out.name = edit.name;
  if (edit.hidden != null) out.hidden = edit.hidden;
  return out;
}

/** Library + own exercises, sorted by name; deleted always out, hidden out unless requested. */
export function listExercises(doc, { hidden = false } = {}) {
  const lib = LIBRARY.map((e) => resolveExercise(doc, e.id)).filter((e) => hidden || !e.hidden);
  const own = doc.exercises.filter((e) => !e.deleted);
  return [...lib, ...own].sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
