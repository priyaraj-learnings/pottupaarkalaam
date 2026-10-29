// =======================================================
// GARMENT PROFILES
//
// What each category is and the AI rules for it, copied
// from UduthiPaar (garment-ai-saas lib/ai/
// garmentPromptProfile.ts, garment-profile-v2) so both
// apps dress people the same way. Copy improvements
// across when either changes.
// =======================================================

export type GarmentProfile = {
  // "Dress the customer in a <description>."
  description: string
  rules: string
  // What the finished garment must look like, and what it must never become:
  // repeated as the last check of every prompt, so a long fabric with a border
  // does not turn a chudidhar into a saree.
  shape: string
  never: string[]
}

const COAT_RULES = `
Treat the supplied fabric as one continuous visible outer-shell fabric.
Use it consistently across the body, sleeves, lapels, collar-facing areas,
cuffs and pocket welts. Do not introduce contrast fabric or decorative
panels. Keep buttons, thread and hidden lining neutral. Preserve pattern
direction, repeat scale and alignment naturally across tailoring seams.
`.trim()

const SAREE_RULES = `
SAREE-SPECIFIC DRAPING RULES:

Create an authentic Indian saree, not a stitched western dress or a men's
garment. Show a continuous six-yard drape with clearly formed waist pleats,
a floor-length lower drape and the pallu passing naturally over one shoulder.

Preserve the supplied fabric's body field, border, pallu area, motifs, weave,
pattern scale and colour placement wherever those details are visible. Do not
invent a contrasting border or ornamental work. Use a simple, coordinating
solid blouse only where a blouse is required and no distinct blouse-piece
design is identifiable in the reference.

Keep the full saree silhouette, lower hem and pallu visible. Do not transform
the saree into a kurta, salwar suit, gown, skirt, dress, dhoti, shirt or coat.
`.trim()

const SALWAR_RULES = `
SALWAR-SUIT-SPECIFIC RULES:
Create a coordinated Indian salwar suit with a kameez/top, lower garment and
dupatta. If the fabric photo shows separate pieces for the top, the bottom and
the dupatta (unstitched suit material often comes as three pieces), use each
piece only for its own part; if it shows one fabric, use it for the kameez and
make the salwar and dupatta in a plain colour taken from that fabric. Do not
transform the outfit into a saree, gown or western dress.
`.trim()

const LEHENGA_RULES = `
LEHENGA-SPECIFIC RULES:
Create an authentic Indian lehenga choli: a full, floor-length flared skirt
(lehenga), a fitted short blouse (choli) and a dupatta. Use the supplied fabric
for the lehenga skirt (if the photo shows separate blouse or dupatta pieces,
use those for the blouse and dupatta), keep
borders, embroidery and motifs at their natural scale and placement, and show
the full flare down to the hem. Do not transform the outfit into a saree,
gown, western skirt or salwar suit.
`.trim()

const CHUDIDHAR_RULES = `
CHUDIDHAR-SPECIFIC RULES:
Create an authentic Indian chudidhar set made of three separate parts:
1. A stitched kameez (tunic) with sleeves, reaching the knees or a little
   below, with side slits from the hip down.
2. Separate, close-fitting churidar trousers covering both legs, gathered in
   many small folds (bangles) at the ankles and clearly visible below the
   kameez hem.
3. A dupatta (long stole) worn over the shoulders or around the neck, falling
   loosely; never wrapped around the waist or pleated.
Unstitched chudidhar material often comes as three pieces (top, bottom,
dupatta); if the photo shows them, use each piece only for its own part. If it
shows one fabric, use it for the kameez and make the churidar and dupatta in a
plain colour taken from that fabric. A border on the fabric goes on the kameez
hem, sleeves or neckline, or on the dupatta edge. There are no waist pleats, no
wrapped skirt and no pallu. Do not transform the outfit into a saree,
half-saree, lehenga, gown or loose salwar.
`.trim()

const JACKET_RULES = `
JACKET-SPECIFIC RULES:
Create a well-made outer jacket worn over a plain top. Use the supplied fabric
for the jacket body and sleeves, keep the collar, front closure and pockets
consistent with that fabric, and keep linings and trims neutral. Do not turn
the jacket into a formal suit coat, shirt, sweater or long coat.
`.trim()

const WAISTCOAT_RULES = `
WAISTCOAT-SPECIFIC RULES:
Create a sleeveless waistcoat (such as a Nehru or Modi jacket) worn over a
plain kurta or shirt. Use the supplied fabric for the waistcoat only, keep the
garment underneath neutral and plain, and keep the collar, buttons and pockets
consistent. Do not add sleeves to the waistcoat or turn it into a coat.
`.trim()

const SHERWANI_RULES = `
SHERWANI-SPECIFIC RULES:
Create an authentic Indian sherwani: a long, knee-length, fitted coat with a
band (mandarin) collar and front buttons, worn over churidar or straight
bottoms. Use the supplied fabric for the sherwani, keep embroidery and motifs
at their natural scale and placement, and keep the bottoms neutral unless a
role-labelled reference says otherwise. Do not turn it into a suit coat,
kurta or western long coat.
`.trim()

const BLOUSE_RULES = `
BLOUSE-SPECIFIC RULES:
Create a fitted Indian saree blouse (choli) with the neckline, sleeve length
and hem natural to a tailored blouse. Use the supplied fabric for the blouse
only; keep any saree or skirt worn with it plain and neutral. Do not turn the
blouse into a kurta, shirt, crop top or dress.
`.trim()

const ANARKALI_RULES = `
ANARKALI-SPECIFIC RULES:
Create an authentic Indian anarkali: a fitted bodice flowing into a long,
flared, floor- or ankle-length kameez, worn with fitted churidar bottoms and a
dupatta. Respect role-labelled references for the dupatta and bottoms, and
show the full flare. Do not turn it into a gown, lehenga, saree or straight
salwar suit.
`.trim()

const GOWN_RULES = `
GOWN-SPECIFIC RULES:
Create an elegant floor-length gown in the supplied fabric with a natural
bodice, waist and skirt, showing the full length and drape. Do not turn it
into a saree, lehenga, anarkali or short dress.
`.trim()

const DHOTI_RULES = `
DHOTI-SPECIFIC RULES:
Create an authentic South Indian veshti/dhoti (or mundu) worn with a plain
shirt or kurta. Use the supplied fabric for the dhoti, including its border at
the hem, and keep the upper garment neutral (a plain white shirt unless the
customer chose a shirt to wear with it). Do not turn it into trousers,
a lungi with a western cut, or a skirt.
`.trim()

const PYJAMA_RULES = `
PYJAMA-SPECIFIC RULES:
Create traditional Indian pyjama trousers (straight or churidar-style) with an
elasticated or drawstring waist, worn under a kurta. Use the supplied fabric
for the pyjama only. Do not turn it into formal trousers, a dhoti or a skirt.
`.trim()

const KURTA_RULES = `
KURTA-SPECIFIC RULES:
Create an authentic tailored Indian kurta. Keep separately supplied neck/yoke,
sleeve/cuff, hem and back designs only in their designated areas. Do not repeat
a placement panel across the entire garment or transform the kurta into a
shirt, coat, gown or saree.
`.trim()

const PROFILES: Record<string, GarmentProfile> = {
  SAREE: {
    description: 'authentically draped Indian saree', rules: SAREE_RULES,
    shape: 'one long unstitched length of fabric draped around the body: pleats at the waist, a floor-length wrap and the pallu over one shoulder, worn with a blouse',
    never: ['chudidhar', 'salwar suit', 'kurta', 'lehenga', 'gown', 'dress'],
  },
  BLOUSE: {
    description: 'fitted Indian saree blouse', rules: BLOUSE_RULES,
    shape: 'a short, fitted blouse (choli) ending above the waist',
    never: ['kurta', 'shirt', 'crop top', 'dress'],
  },
  CHUDIDHAR: {
    description: 'authentic Indian chudidhar set (kameez, churidar trousers and dupatta)', rules: CHUDIDHAR_RULES,
    shape: 'a stitched knee-length kameez (tunic) over separate fitted churidar trousers that bunch in folds at the ankles, with a dupatta over the shoulders; the legs are covered by the churidar, visible below the kameez',
    never: ['saree', 'half-saree', 'lehenga', 'gown', 'anarkali', 'loose salwar'],
  },
  SALWAR_SUIT: {
    description: 'coordinated Indian salwar suit set', rules: SALWAR_RULES,
    shape: 'a stitched kameez (tunic) over loose salwar trousers gathered at the ankles, with a dupatta over the shoulders',
    never: ['saree', 'lehenga', 'gown', 'western dress'],
  },
  KURTI: {
    description: "authentic tailored Indian women's kurti", rules: KURTA_RULES,
    shape: "a women's tunic (kurti) reaching the hips or knees, worn over trousers or leggings",
    never: ['saree', 'gown', 'shirt', 'dress'],
  },
  ANARKALI: {
    description: 'authentic Indian anarkali suit with churidar and dupatta', rules: ANARKALI_RULES,
    shape: 'a fitted bodice flowing into a long, flared kameez to the ankles, over fitted churidar trousers, with a dupatta',
    never: ['saree', 'lehenga', 'gown', 'straight salwar suit'],
  },
  LEHENGA: {
    description: 'authentic Indian lehenga choli with dupatta', rules: LEHENGA_RULES,
    shape: 'a full, flared, floor-length skirt with a separate short fitted blouse (choli) and a dupatta',
    never: ['saree', 'gown', 'chudidhar', 'salwar suit'],
  },
  GOWN: {
    description: 'elegant floor-length gown', rules: GOWN_RULES,
    shape: 'a one-piece floor-length dress with a fitted bodice and a long skirt',
    never: ['saree', 'lehenga', 'anarkali', 'chudidhar', 'short dress'],
  },
  FORMAL_SHIRT: {
    description: 'formal long-sleeve shirt', rules: '',
    shape: 'a long-sleeve collared shirt buttoned down the front, with cuffs',
    never: ['kurta', 'T-shirt', 'jacket', 'coat'],
  },
  CASUAL_SHIRT: {
    description: 'casual shirt', rules: '',
    shape: 'a collared shirt buttoned down the front, with half or full sleeves, worn casually',
    never: ['kurta', 'T-shirt', 'jacket'],
  },
  TROUSER: {
    description: 'formal trousers', rules: '',
    shape: 'full-length tailored trousers with a waistband and front creases',
    never: ['dhoti', 'pyjama', 'jeans', 'shorts'],
  },
  KURTA: {
    description: 'authentic tailored Indian kurta', rules: KURTA_RULES,
    shape: 'a long tunic reaching the knees, with a band collar or no collar and side slits, worn over pyjama or trousers',
    never: ['shirt', 'sherwani', 'coat', 'saree'],
  },
  PYJAMA: {
    description: 'traditional Indian pyjama', rules: PYJAMA_RULES,
    shape: 'loose or churidar-style trousers with a drawstring waist, worn under a kurta',
    never: ['formal trousers', 'dhoti', 'skirt'],
  },
  DHOTI: {
    description: 'authentic South Indian veshti / dhoti', rules: DHOTI_RULES,
    shape: 'an unstitched cloth wrapped around the waist and falling to the ankles, with its border at the hem',
    never: ['trousers', 'pyjama', 'skirt', 'saree'],
  },
  SHERWANI: {
    description: 'authentic Indian sherwani', rules: SHERWANI_RULES,
    shape: 'a long, fitted, knee-length coat with a band collar and buttons down the front, over churidar or straight trousers',
    never: ['suit coat', 'kurta', 'western long coat'],
  },
  COAT: {
    description: 'formal tailored coat or blazer', rules: COAT_RULES,
    shape: 'a tailored blazer or suit coat with lapels and front buttons, over a shirt',
    never: ['kurta', 'sherwani', 'shirt', 'jacket'],
  },
  WAISTCOAT: {
    description: 'sleeveless waistcoat (Nehru jacket)', rules: WAISTCOAT_RULES,
    shape: 'a sleeveless, hip-length waistcoat with a band collar and front buttons, over a kurta or shirt',
    never: ['coat with sleeves', 'shirt', 'kurta'],
  },
  JACKET: {
    description: 'well-made outer jacket', rules: JACKET_RULES,
    shape: 'a waist- or hip-length outer jacket with sleeves and a front closure, over a plain top',
    never: ['blazer', 'suit coat', 'shirt', 'long coat'],
  },
  SAFARI: {
    description: 'professionally tailored safari suit', rules: '',
    shape: 'a matching safari suit: a belted bush jacket with patch pockets and shoulder straps, and matching trousers',
    never: ['blazer suit', 'kurta', 'shirt'],
  },
}

export function garmentProfile(category: string): GarmentProfile {
  const profile = PROFILES[category]
  if (!profile) throw new Error(`No garment profile for ${category}.`)
  return profile
}

export function hasGarmentProfile(category: string) {
  return Boolean(PROFILES[category])
}
