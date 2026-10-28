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
dupatta. Respect every role-labelled reference: never use the dupatta design
for the kameez or bottom, never use the bottom fabric for the top, and place
neck, sleeve and hem panels only in their designated areas. Do not transform
the outfit into a saree, gown or western dress.
`.trim()

const LEHENGA_RULES = `
LEHENGA-SPECIFIC RULES:
Create an authentic Indian lehenga choli: a full, floor-length flared skirt
(lehenga), a fitted short blouse (choli) and a dupatta. Use the supplied fabric
for the lehenga skirt unless role-labelled references say otherwise, keep
borders, embroidery and motifs at their natural scale and placement, and show
the full flare down to the hem. Do not transform the outfit into a saree,
gown, western skirt or salwar suit.
`.trim()

const CHUDIDHAR_RULES = `
CHUDIDHAR-SPECIFIC RULES:
Create an authentic Indian chudidhar set: a knee-length or longer kameez/kurta,
fitted churidar bottoms gathered in soft folds at the ankles, and a dupatta.
Respect every role-labelled reference: use the dupatta design only for the
dupatta and the bottom fabric only for the churidar. Do not transform the
outfit into a saree, lehenga, gown or loose salwar.
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
the hem, and keep the upper garment neutral. Do not turn it into trousers,
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
  SAREE: { description: 'authentically draped Indian saree', rules: SAREE_RULES },
  BLOUSE: { description: 'fitted Indian saree blouse', rules: BLOUSE_RULES },
  CHUDIDHAR: { description: 'authentic Indian chudidhar set with churidar bottoms and dupatta', rules: CHUDIDHAR_RULES },
  SALWAR_SUIT: { description: 'coordinated Indian salwar suit set', rules: SALWAR_RULES },
  KURTI: { description: "authentic tailored Indian women's kurti", rules: KURTA_RULES },
  ANARKALI: { description: 'authentic Indian anarkali suit with churidar and dupatta', rules: ANARKALI_RULES },
  LEHENGA: { description: 'authentic Indian lehenga choli with dupatta', rules: LEHENGA_RULES },
  GOWN: { description: 'elegant floor-length gown', rules: GOWN_RULES },
  FORMAL_SHIRT: { description: 'formal long-sleeve shirt', rules: '' },
  CASUAL_SHIRT: { description: 'casual shirt', rules: '' },
  TROUSER: { description: 'formal trousers', rules: '' },
  KURTA: { description: 'authentic tailored Indian kurta', rules: KURTA_RULES },
  PYJAMA: { description: 'traditional Indian pyjama', rules: PYJAMA_RULES },
  DHOTI: { description: 'authentic South Indian veshti / dhoti', rules: DHOTI_RULES },
  SHERWANI: { description: 'authentic Indian sherwani', rules: SHERWANI_RULES },
  COAT: { description: 'formal tailored coat or blazer', rules: COAT_RULES },
  WAISTCOAT: { description: 'sleeveless waistcoat (Nehru jacket)', rules: WAISTCOAT_RULES },
  JACKET: { description: 'well-made outer jacket', rules: JACKET_RULES },
  SAFARI: { description: 'professionally tailored safari suit', rules: '' },
}

export function garmentProfile(category: string): GarmentProfile {
  const profile = PROFILES[category]
  if (!profile) throw new Error(`No garment profile for ${category}.`)
  return profile
}

export function hasGarmentProfile(category: string) {
  return Boolean(PROFILES[category])
}
