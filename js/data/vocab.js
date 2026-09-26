// Shared vocabulary for HOMUNCULUS.
// Every data file (substances, recipes, diseases) and every engine module
// speaks in these ids. tests/data.test.js checks that nothing references an
// id that is not declared here.

// ---------------------------------------------------------------------------
// Aspect tags: what a substance *is*. Reactions between ingredients are keyed
// on tags, so tag generously.
// ---------------------------------------------------------------------------
export const TAGS = {
  fire:        { name: 'Fire',        color: '#ff6a2b' },
  ice:         { name: 'Ice',         color: '#8fe3ff' },
  water:       { name: 'Water',       color: '#3a9dff' },
  earth:       { name: 'Earth',       color: '#a57a4a' },
  air:         { name: 'Air',         color: '#cfe8f0' },
  lightning:   { name: 'Lightning',   color: '#ffe84a' },
  light:       { name: 'Light',       color: '#fff6c2' },
  shadow:      { name: 'Shadow',      color: '#6b4c9a' },
  life:        { name: 'Life',        color: '#58e07a' },
  death:       { name: 'Death',       color: '#7d8a6a' },
  arcane:      { name: 'Arcane',      color: '#b36bff' },
  void:        { name: 'Void',        color: '#3b2f5c' },
  time:        { name: 'Time',        color: '#e8c36a' },
  cosmic:      { name: 'Cosmic',      color: '#7a8cff' },
  holy:        { name: 'Holy',        color: '#fff0a0' },
  unholy:      { name: 'Unholy',      color: '#8a1c3a' },
  nature:      { name: 'Nature',      color: '#6cbf3c' },
  beast:       { name: 'Beast',       color: '#b5763c' },
  blood:       { name: 'Blood',       color: '#c21f35' },
  metal:       { name: 'Metal',       color: '#b8c2cc' },
  crystal:     { name: 'Crystal',     color: '#9ff5ea' },
  acid:        { name: 'Acid',        color: '#c6ff3a' },
  base:        { name: 'Alkali',      color: '#9fd4ff' },
  toxic:       { name: 'Toxic',       color: '#8ccf2e' },
  radioactive: { name: 'Radioactive', color: '#9dff4a' },
  tech:        { name: 'Tech',        color: '#4ad8ff' },
  psychic:     { name: 'Psychic',     color: '#ff7ad9' },
  dream:       { name: 'Dream',       color: '#c7a8ff' },
  spirit:      { name: 'Spirit',      color: '#b8f2ff' },
  chaos:       { name: 'Chaos',       color: '#ff3ad2' },
  volatile:    { name: 'Volatile',    color: '#ff9f1a' },
  // pharmacological / chemical classes
  stimulant:   { name: 'Stimulant',   color: '#ff8a3d' },
  sedative:    { name: 'Sedative',    color: '#6d8cff' },
  opioid:      { name: 'Opioid',      color: '#9aa8ff' },
  alcohol:     { name: 'Alcohol',     color: '#e6c86e' },
  psychedelic: { name: 'Psychedelic', color: '#ff6ef0' },
  hormone:     { name: 'Hormone',     color: '#ffb36b' },
  venom:       { name: 'Venom',       color: '#7bd13a' },
  pathogen:    { name: 'Pathogen',    color: '#a4c639' },
  antidote:    { name: 'Antidote',    color: '#7af0c1' },
  sugar:       { name: 'Sugar',       color: '#ffd7e8' },
  mineral:     { name: 'Mineral',     color: '#c9b79c' },
  catalyst:    { name: 'Catalyst',    color: '#ffd24a' },
  gas:         { name: 'Gas',         color: '#d8f0ff' },
  explosive:   { name: 'Explosive',   color: '#ff4a1a' },
  antimatter:  { name: 'Antimatter',  color: '#ffffff' },
};

// ---------------------------------------------------------------------------
// Effects: what a substance *does* once it is inside (or on) the subject.
// Magnitude convention (substances): the value listed is the effect intensity
// produced by 10 ml of the PURE substance given intravenously.
//   0.2 barely noticeable · 0.5 mild · 1 clear · 2 strong · 4 severe · 8+ extreme
// Intensity at the body scales linearly with dose volume, and with route.
// `bad: true` effects count toward a mixture's displayed Toxicity.
// ---------------------------------------------------------------------------
export const EFFECTS = {
  // --- mind & nervous system -------------------------------------------------
  stimulant:    { name: 'Stimulant',       cat: 'neuro',  color: '#ff8a3d', desc: 'Raises heart rate, blood pressure and alertness. Overdose: arrhythmia, seizures.' },
  sedative:     { name: 'Sedative',        cat: 'neuro',  color: '#6d8cff', desc: 'Slows heart and breathing, lowers consciousness. Overdose: coma, respiratory arrest.' },
  analgesic:    { name: 'Analgesic',       cat: 'neuro',  color: '#9aa8ff', desc: 'Blocks pain. Heavy doses depress breathing.' },
  euphoria:     { name: 'Euphoria',        cat: 'mind',   color: '#ffcf3d', desc: 'Floods dopamine and serotonin. Subject becomes joyful, may dance.' },
  hallucinogen: { name: 'Hallucinogen',    cat: 'mind',   color: '#ff6ef0', desc: 'Distorts perception. Subject sees things that are not there.' },
  intoxication: { name: 'Intoxication',    cat: 'mind',   color: '#e6c86e', desc: 'Drunkenness: slurred speech, stumbling, poor judgement.', bad: true },
  intellect:    { name: 'Intellect',       cat: 'mind',   color: '#5fe3ff', desc: 'Sharpens cognition, memory and problem solving.' },
  amnesia:      { name: 'Amnesia',         cat: 'mind',   color: '#8a8fa8', desc: 'Erodes memory. Commands are forgotten mid-task.', bad: true },
  rage:         { name: 'Rage',            cat: 'mind',   color: '#ff2e2e', desc: 'Aggression and fury. Subject lashes out and ignores orders.' },
  fear:         { name: 'Fear',            cat: 'mind',   color: '#9b6bff', desc: 'Panic. Subject cowers, flees and trembles.' },
  calm:         { name: 'Calm',            cat: 'mind',   color: '#7fd6c2', desc: 'Lowers stress and quiets the amygdala.' },
  sleep:        { name: 'Sleep',           cat: 'mind',   color: '#5b6bd6', desc: 'Induces drowsiness and sleep.' },
  love:         { name: 'Infatuation',     cat: 'mind',   color: '#ff7aa8', desc: 'Affection floods the subject. Very eager to please.' },
  laughter:     { name: 'Laughter',        cat: 'mind',   color: '#ffe066', desc: 'Uncontrollable giggling fits.' },
  truth:        { name: 'Candor',          cat: 'mind',   color: '#f0f0ff', desc: 'The subject cannot help saying exactly what it thinks.' },
  telepathy:    { name: 'Telepathy',       cat: 'mind',   color: '#ff9ae8', desc: 'Inner thoughts become visible. Commands are anticipated.' },

  // --- toxic ------------------------------------------------------------------
  neurotoxin:   { name: 'Neurotoxin',      cat: 'toxic',  color: '#b7ff3a', desc: 'Damages nerves and brain. Paralysis, seizures.', bad: true },
  cardiotoxin:  { name: 'Cardiotoxin',     cat: 'toxic',  color: '#ff3a5c', desc: 'Damages heart muscle and disturbs its rhythm.', bad: true },
  hepatotoxin:  { name: 'Hepatotoxin',     cat: 'toxic',  color: '#c9a227', desc: 'Damages the liver.', bad: true },
  nephrotoxin:  { name: 'Nephrotoxin',     cat: 'toxic',  color: '#c97a27', desc: 'Damages the kidneys.', bad: true },
  poison:       { name: 'Poison',          cat: 'toxic',  color: '#8ccf2e', desc: 'General systemic toxicity. Loads the blood with toxins.', bad: true },
  corrosive:    { name: 'Corrosive',       cat: 'toxic',  color: '#c6ff3a', desc: 'Dissolves tissue at the point of contact.', bad: true },
  radiation:    { name: 'Radiation',       cat: 'toxic',  color: '#9dff4a', desc: 'Ionizing dose. Accumulates in sieverts; sickness, cancer, mutation.', bad: true },
  asphyxiant:   { name: 'Asphyxiant',      cat: 'toxic',  color: '#6a7fa0', desc: 'Stops cells using oxygen. Rapid hypoxia.', bad: true },
  hemorrhage:   { name: 'Hemorrhage',      cat: 'toxic',  color: '#c21f35', desc: 'Causes internal bleeding.', bad: true },
  nausea:       { name: 'Nausea',          cat: 'toxic',  color: '#a8c94a', desc: 'Upsets the stomach. Vomiting.', bad: true },
  allergen:     { name: 'Allergen',        cat: 'toxic',  color: '#ff9f7a', desc: 'May trigger a violent allergic reaction.', bad: true },
  necrotic:     { name: 'Necrotic',        cat: 'toxic',  color: '#5e6b4a', desc: 'Rots living tissue. Feeds undeath.', bad: true },
  blindness:    { name: 'Blindness',       cat: 'toxic',  color: '#444a5a', desc: 'Damages eyes and visual cortex.', bad: true },

  // --- elemental / physical ------------------------------------------------------
  heat:         { name: 'Heat',            cat: 'element', color: '#ff6a2b', desc: 'Raises core temperature. Burns at high intensity.' },
  cold:         { name: 'Cold',            cat: 'element', color: '#8fe3ff', desc: 'Lowers core temperature. Frostbite, cryostasis.' },
  electric:     { name: 'Electric',        cat: 'element', color: '#ffe84a', desc: 'Electrical charge. Muscle spasms, arrhythmia, faster nerves.' },
  explosive:    { name: 'Explosive',       cat: 'element', color: '#ff4a1a', desc: 'May detonate inside the subject.', bad: true },

  // --- restorative ---------------------------------------------------------------
  healing:      { name: 'Healing',         cat: 'restore', color: '#58e07a', desc: 'Repairs organs, muscle and skin.' },
  regeneration: { name: 'Regeneration',    cat: 'restore', color: '#3dffa0', desc: 'Regrows bone, nerve and brain tissue. Burns glucose.' },
  antidote:     { name: 'Antidote',        cat: 'restore', color: '#7af0c1', desc: 'Neutralises toxins and speeds their clearance.' },
  antibiotic:   { name: 'Antibiotic',      cat: 'restore', color: '#bdf0ff', desc: 'Kills bacterial infections.' },
  antiviral:    { name: 'Antiviral',       cat: 'restore', color: '#a8d8ff', desc: 'Suppresses viral infections.' },
  purify:       { name: 'Purify',          cat: 'restore', color: '#fff0a0', desc: 'Lifts curses and undeath. Burns the unholy.' },
  immuneBoost:  { name: 'Immune Boost',    cat: 'restore', color: '#9ff0d0', desc: 'Raises white cells and disease resistance.' },
  oxygenation:  { name: 'Oxygenation',     cat: 'restore', color: '#7fd0ff', desc: 'Saturates the blood with oxygen.' },
  hydration:    { name: 'Hydration',       cat: 'restore', color: '#3a9dff', desc: 'Restores body water.' },
  nutrition:    { name: 'Nutrition',       cat: 'restore', color: '#ffd7a8', desc: 'Raises blood glucose and energy.' },
  geneRepair:   { name: 'Gene Repair',     cat: 'restore', color: '#c4ffe0', desc: 'Reverts mutations and repairs radiation damage.' },
  resurrection: { name: 'Resurrection',    cat: 'restore', color: '#ffb84a', desc: 'Restarts a dead subject. Otherwise dormant.' },

  // --- body & physiology ----------------------------------------------------------
  strength:       { name: 'Strength',        cat: 'body', color: '#ff9d4a', desc: 'Multiplies muscle force.' },
  weakness:       { name: 'Weakness',        cat: 'body', color: '#a88a7a', desc: 'Saps muscle force.', bad: true },
  muscleGrowth:   { name: 'Muscle Growth',   cat: 'body', color: '#ff6b6b', desc: 'Builds muscle mass. Lasting.' },
  boneHardening:  { name: 'Bone Hardening',  cat: 'body', color: '#f0ead8', desc: 'Densifies the skeleton.' },
  boneSoftening:  { name: 'Bone Softening',  cat: 'body', color: '#b8a88a', desc: 'Leaches the skeleton. Fractures come easily.', bad: true },
  haste:          { name: 'Haste',           cat: 'body', color: '#5affd8', desc: 'Faster movement and reflexes.' },
  slow:           { name: 'Slow',            cat: 'body', color: '#6a7a8a', desc: 'Sluggish movement and reflexes.', bad: true },
  endurance:      { name: 'Endurance',       cat: 'body', color: '#ffc36b', desc: 'Resists fatigue.' },
  fatigue:        { name: 'Fatigue',         cat: 'body', color: '#8a7a6a', desc: 'Drains stamina.', bad: true },
  paralysis:      { name: 'Paralysis',       cat: 'body', color: '#7a8aa8', desc: 'Blocks signals to muscles.', bad: true },
  spasm:          { name: 'Spasm',           cat: 'body', color: '#ffb0b0', desc: 'Involuntary muscle contractions.', bad: true },
  anticoagulant:  { name: 'Anticoagulant',   cat: 'body', color: '#d44a5a', desc: 'Thins the blood. Bleeding risk.' },
  coagulant:      { name: 'Coagulant',       cat: 'body', color: '#7a1a2a', desc: 'Thickens the blood. Clot, stroke and infarct risk.' },
  dehydration:    { name: 'Dehydration',     cat: 'body', color: '#c9a86a', desc: 'Pulls water out of the body.', bad: true },
  hypoglycemic:   { name: 'Glucose Drop',    cat: 'body', color: '#d0a0ff', desc: 'Drives blood sugar down, like insulin.' },
  immuneSuppress: { name: 'Immunosuppressant', cat: 'body', color: '#8a9aa0', desc: 'Weakens the immune system.', bad: true },
  growth:         { name: 'Growth',          cat: 'body', color: '#6bff8a', desc: 'The subject grows larger.' },
  shrink:         { name: 'Shrink',          cat: 'body', color: '#ff8ae0', desc: 'The subject shrinks.' },
  aging:          { name: 'Aging',           cat: 'body', color: '#b0a090', desc: 'Years pass in seconds.', bad: true },
  youth:          { name: 'Youth',           cat: 'body', color: '#ffe0f0', desc: 'Winds the biological clock backwards.' },

  // --- arcane & transformation -----------------------------------------------------
  mana:          { name: 'Mana',            cat: 'arcane', color: '#b36bff', desc: 'Raw magical energy. Overload burns.' },
  glow:          { name: 'Luminescence',    cat: 'arcane', color: '#fff6c2', desc: 'The subject glows.' },
  invisibility:  { name: 'Invisibility',    cat: 'arcane', color: '#e0f0ff', desc: 'Skin and muscle turn transparent.' },
  levitation:    { name: 'Levitation',      cat: 'arcane', color: '#cfe8f0', desc: 'Defies gravity.' },
  heavy:         { name: 'Density',         cat: 'arcane', color: '#5a5a6a', desc: 'The subject becomes crushingly heavy.' },
  ethereal:      { name: 'Ethereal',        cat: 'arcane', color: '#b8f2ff', desc: 'Drifts toward a ghostly, spectral state.' },
  petrify:       { name: 'Petrify',         cat: 'arcane', color: '#9a9a90', desc: 'Flesh slowly turns to stone.', bad: true },
  undeath:       { name: 'Undeath',         cat: 'arcane', color: '#7d8a6a', desc: 'Zombification. The dead may rise.', bad: true },
  lycanthropy:   { name: 'Lycanthropy',     cat: 'arcane', color: '#b5763c', desc: 'Werewolf transformation.' },
  vampirism:     { name: 'Vampirism',       cat: 'arcane', color: '#8a1c3a', desc: 'Vampiric transformation.' },
  crystallize:   { name: 'Crystallize',     cat: 'arcane', color: '#9ff5ea', desc: 'Tissue turns to living crystal.', bad: true },
  metallize:     { name: 'Metallize',       cat: 'arcane', color: '#b8c2cc', desc: 'Skin hardens to metal.' },
  gilding:       { name: 'Gilding',         cat: 'arcane', color: '#ffd24a', desc: 'The subject turns, slowly, to gold.', bad: true },
  elastic:       { name: 'Elasticity',      cat: 'arcane', color: '#ff9ad5', desc: 'Rubbery body. Stretches, bounces, never breaks.' },
  divinity:      { name: 'Divinity',        cat: 'arcane', color: '#ffe9a0', desc: 'Halo, radiance, levitation. Too much and the subject ascends.' },
  mutagen:       { name: 'Mutagen',         cat: 'arcane', color: '#a0ff3a', desc: 'Random mutations: horns, tails, wings, extra limbs.', bad: true },
  fireBreath:    { name: 'Fire Breath',     cat: 'arcane', color: '#ff7a1a', desc: 'The subject exhales flame.' },
  timeDilation:  { name: 'Time Dilation',   cat: 'arcane', color: '#e8c36a', desc: 'Personal time runs fast: quick movement, fast metabolism, aging.' },
  teleport:      { name: 'Teleportation',   cat: 'arcane', color: '#7a8cff', desc: 'The subject blinks from place to place.' },
  chaos:         { name: 'Chaos',           cat: 'arcane', color: '#ff3ad2', desc: 'Every other effect surges and fades at random.' },
  photosynthesis:{ name: 'Photosynthesis',  cat: 'arcane', color: '#6cbf3c', desc: 'Green skin that feeds on light.' },
  helium:        { name: 'Squeaky Voice',   cat: 'arcane', color: '#d8f0ff', desc: 'Voice rises several octaves.' },
};

// ---------------------------------------------------------------------------
// Symptoms: visible behaviours/appearance changes. Diseases list these per
// stage; the behaviour + renderer implement every id below.
// ---------------------------------------------------------------------------
export const SYMPTOMS = {
  cough: 'Coughing', sneeze: 'Sneezing', wheeze: 'Wheezing', vomit: 'Vomiting',
  nausea: 'Nausea', hiccup: 'Hiccups', seizure: 'Seizures', tremor: 'Tremor',
  twitch: 'Twitching', stiffness: 'Rigid muscles', itch: 'Itching', rash: 'Rash',
  spots: 'Spots', boils: 'Boils', limp: 'Limping', chestPain: 'Chest pain',
  headache: 'Headache', shiver: 'Shivering', sweat: 'Sweating', fever: 'Fever',
  drool: 'Drooling', nosebleed: 'Nosebleed', confusion: 'Confusion',
  delirium: 'Delirium', paranoia: 'Paranoia', aggression: 'Aggression',
  hydrophobia: 'Fear of water', dance: 'Compulsive dancing', laugh: 'Laughing fits',
  howl: 'Howling', moan: 'Moaning', drowsy: 'Drowsiness', insomnia: 'Insomnia',
  hunger: 'Ravenous hunger', thirst: 'Extreme thirst', jaundice: 'Jaundice',
  pallor: 'Pallor', cyanosis: 'Cyanosis', flushed: 'Flushing', glowEyes: 'Glowing eyes',
};

// ---------------------------------------------------------------------------
// Anatomy ids
// ---------------------------------------------------------------------------
export const ORGANS = {
  brain:      { name: 'Brain' },
  eyes:       { name: 'Eyes' },
  heart:      { name: 'Heart' },
  lungL:      { name: 'Left Lung' },
  lungR:      { name: 'Right Lung' },
  liver:      { name: 'Liver' },
  stomach:    { name: 'Stomach' },
  intestines: { name: 'Intestines' },
  pancreas:   { name: 'Pancreas' },
  spleen:     { name: 'Spleen' },
  kidneyL:    { name: 'Left Kidney' },
  kidneyR:    { name: 'Right Kidney' },
  skin:       { name: 'Skin' },
};

export const BRAIN_REGIONS = {
  frontal:     { name: 'Frontal Lobe',   role: 'Judgement, obedience, planning' },
  motor:       { name: 'Motor Cortex',   role: 'Voluntary movement' },
  sensory:     { name: 'Parietal Lobe',  role: 'Touch, pain, body sense' },
  temporal:    { name: 'Temporal Lobe',  role: 'Hearing, language comprehension' },
  occipital:   { name: 'Occipital Lobe', role: 'Vision' },
  broca:       { name: "Broca's Area",   role: 'Speech production' },
  hippocampus: { name: 'Hippocampus',    role: 'Memory' },
  amygdala:    { name: 'Amygdala',       role: 'Fear and aggression' },
  cerebellum:  { name: 'Cerebellum',     role: 'Balance and coordination' },
  brainstem:   { name: 'Brainstem',      role: 'Breathing, heartbeat, consciousness' },
};

export const NERVE_REGIONS = {
  cranial: { name: 'Cranial nerves' },
  spinal:  { name: 'Spinal cord' },
  armL:    { name: 'Left arm nerves' },
  armR:    { name: 'Right arm nerves' },
  legL:    { name: 'Left leg nerves' },
  legR:    { name: 'Right leg nerves' },
};

export const MUSCLES = {
  neck:  { name: 'Neck' },
  chest: { name: 'Chest' },
  core:  { name: 'Core' },
  armL:  { name: 'Left Arm' },
  armR:  { name: 'Right Arm' },
  legL:  { name: 'Left Leg' },
  legR:  { name: 'Right Leg' },
};

export const BONES = {
  skull:    { name: 'Skull' },
  spine:    { name: 'Spine' },
  ribs:     { name: 'Ribcage' },
  pelvis:   { name: 'Pelvis' },
  humerusL: { name: 'Left Humerus' },
  humerusR: { name: 'Right Humerus' },
  forearmL: { name: 'Left Radius/Ulna' },
  forearmR: { name: 'Right Radius/Ulna' },
  handL:    { name: 'Left Hand' },
  handR:    { name: 'Right Hand' },
  femurL:   { name: 'Left Femur' },
  femurR:   { name: 'Right Femur' },
  shinL:    { name: 'Left Tibia/Fibula' },
  shinR:    { name: 'Right Tibia/Fibula' },
  footL:    { name: 'Left Foot' },
  footR:    { name: 'Right Foot' },
};

export const MUTATIONS = {
  horns:        { name: 'Horns',          desc: 'Curling horns sprout from the skull.' },
  tail:         { name: 'Tail',           desc: 'A prehensile tail. Better balance.' },
  wings:        { name: 'Wings',          desc: 'Membranous wings. Jumps become glides.' },
  extraArms:    { name: 'Extra Arms',     desc: 'A second pair of arms. Lifts much more.' },
  thirdEye:     { name: 'Third Eye',      desc: 'An eye in the forehead. Sharper sight, glimpses of thought.' },
  scales:       { name: 'Scales',         desc: 'Reptilian scales. Resists burns and cuts.' },
  gills:        { name: 'Gills',          desc: 'Neck gills. Tolerates low oxygen.' },
  claws:        { name: 'Claws',          desc: 'Hooked claws. Punches tear.' },
  antennae:     { name: 'Antennae',       desc: 'Twitching antennae. Keener hearing.' },
  glowingVeins: { name: 'Glowing Veins',  desc: 'Bioluminescent blood vessels.' },
  crystalSpikes:{ name: 'Crystal Spikes', desc: 'Crystal growths along the shoulders.' },
  tentacleHair: { name: 'Tentacle Hair',  desc: 'Hair replaced by writhing tentacles.' },
};

// Transformation meters (0..1). Effects push them up; reaching 1 completes the change.
export const TRANSFORMS = {
  stone:    { name: 'Petrified',  effect: 'petrify' },
  zombie:   { name: 'Undead',     effect: 'undeath' },
  werewolf: { name: 'Werewolf',   effect: 'lycanthropy' },
  vampire:  { name: 'Vampire',    effect: 'vampirism' },
  ghost:    { name: 'Spectral',   effect: 'ethereal' },
  crystal:  { name: 'Crystalline', effect: 'crystallize' },
  metal:    { name: 'Metallic',   effect: 'metallize' },
  gold:     { name: 'Golden',     effect: 'gilding' },
  elastic:  { name: 'Rubberized', effect: 'elastic' },
  divine:   { name: 'Divine',     effect: 'divinity' },
};

// ---------------------------------------------------------------------------
// Numbers diseases can trigger on (see sim/physiology.js getStat()).
// ---------------------------------------------------------------------------
export const STATS = {
  radiation: 'Accumulated radiation dose, sieverts (normal 0; >1 sick; >6 lethal)',
  temp: 'Core temperature °C (normal 37)',
  glucose: 'Blood glucose mg/dL (normal 90)',
  toxins: 'Blood toxin index 0-100 (normal 0)',
  bloodVolume: 'Blood volume % (normal 100)',
  spo2: 'Oxygen saturation % (normal 98)',
  map: 'Mean arterial pressure mmHg (normal 93)',
  hr: 'Heart rate bpm (normal 72)',
  clotRisk: 'Clotting tendency 0-1 (normal 0.1)',
  mana: 'Mana level 0-150 (normal 0)',
  immune: 'Immune strength 0-100 (normal 70)',
  hydration: 'Hydration % (normal 90)',
  stress: 'Stress 0-100 (normal 20)',
  bac: 'Blood alcohol % (normal 0; 0.08 drunk; 0.3 dangerous)',
  age: 'Biological age in years (starts 30)',
  size: 'Body scale (normal 1.0)',
  pain: 'Pain 0-100',
  consciousness: 'Consciousness 0-100',
  fatigue: 'Average muscle fatigue 0-100',
  wbc: 'White cells x10^9/L (normal 7)',
  rbc: 'Red cells x10^12/L (normal 4.8)',
  heart: 'Heart health 0-100', liver: 'Liver health 0-100', kidneys: 'Average kidney health 0-100',
  lungs: 'Average lung health 0-100', brain: 'Brain health 0-100', skin: 'Skin health 0-100',
  dopamine: 'Neurotransmitter level 0-100 (baseline 50)', serotonin: 'baseline 50',
  norepinephrine: 'baseline 50', gaba: 'baseline 50', glutamate: 'baseline 50',
  acetylcholine: 'baseline 50', endorphin: 'baseline 50', melatonin: 'baseline 50',
  deadTime: 'Seconds since death (0 while alive)',
};

// Keys accepted in a disease stage's `damage` map (HP lost per second, negative heals):
//   any ORGANS id · 'lungs' · 'kidneys' · 'brain.<region>' · 'nerve.<region>' · 'nerves'
//   'muscle.<group>' · 'muscles' · 'bone.<id>' · 'bones'
// Keys accepted in a stage's `drain` map (amount removed per second, negative adds):
export const DRAIN_KEYS = ['bloodVolume', 'hydration', 'glucose', 'rbc', 'wbc', 'platelets', 'immune', 'mana', 'stamina'];

export const DISEASE_KINDS = [
  'viral', 'bacterial', 'fungal', 'parasitic', 'prion', 'toxic', 'cancer', 'cardiovascular',
  'neurological', 'metabolic', 'environmental', 'radiation', 'immune', 'curse', 'magical',
  'temporal', 'nanotech', 'psychological',
];

// Disease ids that exist (the diseases data file defines each of these).
export const DISEASE_IDS = [
  'common_cold', 'influenza', 'pneumonia', 'sepsis', 'tetanus', 'rabies', 'botulism', 'cholera',
  'malaria', 'bubonic_plague', 'food_poisoning', 'prion_disease', 'cancer', 'radiation_sickness',
  'heatstroke', 'hypothermia', 'frostbite', 'stroke', 'heart_attack', 'anaphylaxis',
  'diabetic_ketoacidosis', 'alcohol_poisoning', 'serotonin_syndrome', 'liver_failure',
  'kidney_failure', 'zombie_plague', 'cordyceps_bloom', 'lycanthropy', 'vampirism',
  'petrification_curse', 'mana_burn', 'chrono_sickness', 'nanite_plague', 'spectral_fade',
  'crystal_lung', 'wyrm_pox', 'dancing_plague', 'giggle_fever', 'sleeping_curse',
  'void_sickness', 'gigantism', 'midas_curse', 'mind_worms',
];

export const CATEGORIES = {
  elemental:  { name: 'Elemental',  color: '#ff8a4a', blurb: 'Pure forces of nature, bottled.' },
  mythical:   { name: 'Mythical',   color: '#c89bff', blurb: 'Harvested from legends.' },
  scientific: { name: 'Scientific', color: '#5fd0ff', blurb: 'Real chemistry and pharmacology.' },
  fictional:  { name: 'Fictional',  color: '#ff6ec7', blurb: 'Impossible materials from impossible labs.' },
  biological: { name: 'Biological', color: '#a4c639', blurb: 'Cultures, spores and strains. Handle with care.' },
};

export const STATES = ['liquid', 'powder', 'gas', 'crystal', 'plasma', 'ethereal', 'goo', 'solid'];
