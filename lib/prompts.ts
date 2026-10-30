import { garmentProfile } from '@/lib/garments'
import { categoryLabel, type GarmentSource, type PairRole } from '@/lib/rules'

// =======================================================
// TRY-ON INSTRUCTIONS FOR THE IMAGE MODEL
//
// Image 1 is the customer; image 2 the (main) garment;
// image 3 the garment worn with it in a pair. Customers
// photograph garments on their phones, so the wording
// tells the model what to ignore in those photos (hands,
// packing, the person wearing a dress) and what to keep.
// =======================================================

export const PROMPT_VERSION = 'pp-try-on-v3'

export type PromptGarment = {
  category: string
  source: GarmentSource
}

const CUSTOMER = `
IMAGE 1 is the customer. Keep exactly the same person: face, facial features,
skin tone, hair, age, body shape and proportions, and gender presentation. Do
not beautify, slim or lighten the skin, and never replace the customer with a
model. Keep their pose and background where possible. If IMAGE 1 shows only the
face or upper body, extend the picture naturally so the whole outfit shows,
keeping the face and features unchanged.

Replace everything the customer is wearing in IMAGE 1 with the new outfit. Do
not keep any of their current clothes, and do not let the type of garment they
are wearing now (for example a saree) decide the type of the new garment.
`.trim()

const PRIORITY = `
INSTRUCTION PRIORITY:
Preserve a supplied ready-made garment's actual construction before applying
any fabric construction defaults. Explicit companion references own their
assigned pieces and override supporting-piece defaults and set descriptions.
Apply fabric construction rules only to FABRIC inputs, never to STITCHED inputs.
In a pair, garment shape checks describe each selected garment only; they do
not prescribe extra clothes or replace the selected companion.
`.trim()

const OUTPUT = `
Make one photorealistic, full-length photo (head to feet) of the customer
wearing the outfit, with natural light, natural anatomy, a realistic fit and
physically plausible drape and folds. Do not add text, logos, watermarks or
other people. Preserve the supplied garments' colours and designs without
adding embroidery or prints. Plain supporting pieces and neutral functional
trims are allowed only as specified in REFERENCE ALLOCATION.
`.trim()

// "a" or "an" before a garment name.
const withArticle = (text: string) => `${/^[aeiou]/i.test(text) ? 'an' : 'a'} ${text}`

// The last instruction of every prompt: the garment type the customer chose.
function typeCheck(garment: PromptGarment, who = 'The customer') {
  const label = categoryLabel(garment.category).toLowerCase()
  if (garment.source === 'STITCHED') return `${who} chose ${withArticle(label)}. Preserve the photographed garment's actual silhouette, length, sleeves, neckline, panels and trims; do not reconstruct it using fabric defaults.`
  const { shape, never } = garmentProfile(garment.category)
  return `${who} chose ${withArticle(label)}. It must look like ${shape}. It must not look like any of these: ${never.join(', ')}.`
}

function sourceText(image: number, garment: PromptGarment, wearer = 'the customer') {
  const label = categoryLabel(garment.category).toLowerCase()
  const { description } = garmentProfile(garment.category)
  if (garment.source === 'STITCHED') {
    return `
IMAGE ${image} is a photo of a READY-MADE, STITCHED ${label}. It may be on a
hanger or mannequin, laid flat, or worn by another person. Copy that garment
faithfully - cut, neckline, sleeves, length, colour, print, border and
embellishment - onto ${wearer}. Never copy the face, body, hair, skin or
pose of anyone shown in IMAGE ${image}.
`.trim()
  }
  return `
IMAGE ${image} is a phone photo of UNSTITCHED FABRIC for the ${label}. It may be
folded, rolled, held in hands, on a table or still in its packing. Ignore the
hands, background, packing, tags and folds. Use only the material itself - its
colour, weave, texture, motifs, checks, stripes, borders, pattern direction and
repeat scale - and tailor a new ${description} from it. The length of the
fabric, a border or a decorated end does not decide the garment type: it is
${withArticle(label)}, as the customer chose.
`.trim()
}

// Construction defaults never run for stitched references (including final checks).
function garmentName(garment: PromptGarment) {
  return garment.source === 'STITCHED'
    ? categoryLabel(garment.category).toLowerCase()
    : garmentProfile(garment.category).description
}

function garmentRules(garment: PromptGarment) {
  return garment.source === 'STITCHED'
    ? "READY-MADE PRESERVATION: Retain the photographed cut, length, sleeve style, neckline, contrast panels, buttons and trims. Do not add or remove design details to match a generic category template."
    : garmentProfile(garment.category).rules || 'Tailor the selected garment naturally from the supplied fabric.'
}

const SUPPORT: Record<string, string> = {
  SAREE: 'a plain coordinating blouse and an unobtrusive underskirt',
  BLOUSE: 'a plain coordinating saree or skirt',
  LEHENGA: 'a plain coordinating choli and dupatta',
  CHUDIDHAR: 'plain fitted churidar bottoms and a plain dupatta',
  SALWAR_SUIT: 'plain loose salwar bottoms and a plain dupatta',
  ANARKALI: 'plain fitted churidar bottoms and a plain dupatta',
  KURTI: 'plain coordinating trousers', KURTA: 'plain coordinating pyjama trousers',
  FORMAL_SHIRT: 'plain neutral trousers', CASUAL_SHIRT: 'plain neutral trousers',
  TROUSER: 'a plain neutral shirt', PYJAMA: 'a plain neutral kurta',
  DHOTI: 'a plain neutral shirt', SHERWANI: 'plain neutral churidar or straight bottoms',
  COAT: 'a plain neutral inner shirt and trousers',
  JACKET: 'a plain neutral inner top and trousers',
  WAISTCOAT: 'a plain neutral inner kurta or shirt and trousers',
}

function allocation(garment: PromptGarment, image: number, companionRole?: PairRole) {
  const missing = SUPPORT[garment.category]
  return `REFERENCE ALLOCATION for IMAGE ${image} (${categoryLabel(garment.category)}):
An explicitly supplied companion reference takes priority for its assigned piece.
Use distinct component fabrics visible in this photo only when their roles are
visually clear. There are no additional labelled neck, sleeve, bottom or dupatta
photos: do not assume any exist or guess roles for ambiguous pieces.
${garment.source === 'FABRIC'
    ? 'For a single fabric, apply it to the selected main garment (the skirt for lehenga; the kameez for a suit set; BOTH jacket and trousers for safari).'
    : 'Keep every visible piece of the ready-made outfit faithful to this photo; do not replace visible pieces with plain defaults.'}
${companionRole === 'BOTTOM'
    ? 'IMAGE 3 supplies the bottom, including colour and pattern; no neutral-bottom default applies. Do not add a second bottom. For a set, use visible top/dupatta pieces from IMAGE 2; if its dupatta is absent, add a plain coordinating dupatta using a colour from IMAGE 2.'
    : companionRole === 'INNER'
      ? 'IMAGE 3 supplies the inner garment; no plain-inner default applies. Add only plain neutral trousers if no lower garment is supplied.'
      : companionRole === 'BLOUSE'
        ? 'IMAGE 3 supplies the blouse; no plain-blouse default applies. If a lehenga dupatta is missing, use a plain coordinating colour from IMAGE 2.'
        : missing ? `Only for pieces absent from the reference, complete the outfit with ${missing}. For coordinating pieces use a solid colour from the target fabric; neutral pieces may use a restrained neutral colour.` : 'No additional supporting garment is required.'}
Never invent embroidery or extra prints on supporting pieces. Neutral buttons,
thread and hidden lining are permitted for fabric construction; retain visible
ready-made trims as photographed.`
}

function bottomRules(main: PromptGarment, bottom: PromptGarment) {
  if (bottom.source === 'STITCHED') return garmentRules(bottom)
  if (bottom.category === 'PYJAMA' && ['CHUDIDHAR', 'ANARKALI'].includes(main.category)) {
    return 'Use IMAGE 3 only for fitted churidar trousers with ankle gathers. Do not add a kurta or change the selected main top.'
  }
  if (bottom.category === 'PYJAMA' && main.category === 'SALWAR_SUIT') {
    return 'Use IMAGE 3 only for loose salwar trousers gathered at the ankles. Do not add a kurta or change the selected main top.'
  }
  return garmentRules(bottom)
}

export function buildSinglePrompt(garment: PromptGarment): string {
  return [
    'Create a photorealistic virtual try-on photo.',
    CUSTOMER,
    PRIORITY,
    sourceText(2, garment),
    `Dress the customer in ${withArticle(garmentName(garment))}. Do not turn it into a different kind of garment.`,
    garmentRules(garment),
    allocation(garment, 2),
    OUTPUT,
    `GARMENT TYPE CHECK: ${typeCheck(garment)}`,
  ].filter(Boolean).join('\n\n')
}

// =======================================================
// PAIRS: two garments in one picture
// =======================================================

const ROLE_NAMES: Record<PairRole, string> = {
  BOTTOM: 'LOWER GARMENT',
  BLOUSE: 'BLOUSE',
  INNER: 'INNER GARMENT',
}

// How the two garments sit together (UduthiPaar's combo rules, extended to
// saree/lehenga blouses and layers).
function pairRule(main: string, companion: string, role: PairRole) {
  const mainLabel = categoryLabel(main).toLowerCase()
  const companionLabel = categoryLabel(companion).toLowerCase()
  if (role === 'BLOUSE') {
    return `The blouse (choli) worn with the ${mainLabel} is made only from IMAGE 3: keep its colour and design and never use it on the ${main === 'SAREE' ? 'saree body or pallu' : 'lehenga skirt or dupatta'}. Any instruction to use a plain or coordinating blouse does not apply.`
  }
  if (role === 'INNER') {
    return `Wear the ${mainLabel} as the outer layer over the ${companionLabel} made from IMAGE 3, which shows naturally at the neck, front opening, sleeves and below the outer layer's hem. Any instruction to keep the garment underneath plain or neutral does not apply: it is the supplied ${companionLabel}.`
  }
  if (companion === 'DHOTI') {
    return `Wear the ${mainLabel} untucked over the dhoti, as is traditional. The dhoti wraps the waist and falls to the ankles with its border visible at the hem.`
  }
  if (['FORMAL_SHIRT', 'CASUAL_SHIRT'].includes(main)) {
    return companion === 'TROUSER'
      ? 'Tuck the shirt neatly into the trousers at the waist.'
      : `Wear the shirt over the ${companionLabel}.`
  }
  if (['COAT', 'JACKET'].includes(main)) {
    return `Wear the ${mainLabel} over a plain shirt, with the ${companionLabel} from IMAGE 3 below it.`
  }
  if (['SALWAR_SUIT', 'CHUDIDHAR', 'ANARKALI'].includes(main)) {
    return `IMAGE 3 is only for the bottom of the set (salwar, churidar or pants); the top and dupatta come from IMAGE 2. The top falls over the bottom, which shows below its hem down to the ankles.`
  }
  return `The ${mainLabel} falls over the waistband of the ${companionLabel}; the ${companionLabel} shows below its hem down to the ankles.`
}

const BLOUSE_COMPANION_RULES = `
Make a fitted Indian blouse (choli) with a natural neckline, sleeve length and
hem. Do not turn it into a kurta, shirt or crop top.
`.trim()

export function buildPairPrompt(main: PromptGarment, companion: PromptGarment, role: PairRole): string {
  const roleName = ROLE_NAMES[role]
  const companionRules = role === 'BOTTOM' ? bottomRules(main, companion) : role === 'BLOUSE' && companion.source === 'FABRIC' ? BLOUSE_COMPANION_RULES : garmentRules(companion)
  return [
    'Create a photorealistic virtual try-on photo of a two-piece outfit.',
    CUSTOMER,
    PRIORITY,
    sourceText(2, main),
    sourceText(3, companion),
    `Dress the customer in BOTH garments at the same time, in one picture:
- MAIN GARMENT: ${withArticle(garmentName(main))}, made only from IMAGE 2.
- ${roleName}: ${withArticle(garmentName(companion))}, made only from IMAGE 3.
Keep the two garments separate: never move colours, motifs or borders from one
to the other. ${pairRule(main.category, companion.category, role)}`,
    `MAIN GARMENT RULES:\n${garmentRules(main)}`,
    `${roleName} RULES:\n${companionRules}`,
    allocation(main, 2, role),
    role === 'BOTTOM' ? 'The companion rules apply only to the supplied bottom. The selected MAIN GARMENT supplies the top; do not introduce another shirt or kurta from a bottom-garment default.' : '',
    OUTPUT,
    `GARMENT TYPE CHECK: ${typeCheck(main, 'For the main garment, the customer')} ${typeCheck(companion, `For the ${roleName.toLowerCase()}, the customer`)}`,
  ].join('\n\n')
}

// =======================================================
// COUPLE PICTURES: two people, each in their own garment
//
// IMAGE 1 is the man and IMAGE 2 his garment; IMAGE 3 is
// the woman and IMAGE 4 her garment.
// =======================================================

const COUPLE_PEOPLE = `
IMAGE 1 is the man and IMAGE 3 is the woman: a couple. Keep each of them exactly
the same person: face, facial features, skin tone, hair, age, body shape and
proportions. Do not beautify, slim or lighten the skin, never mix or swap their
features, and never replace either of them with a model. If a photo shows only
the face or upper body, extend that person naturally so the whole outfit shows,
keeping the face and features unchanged. Replace everything each of them is
wearing now with their new garment; keep none of their current clothes.
`.trim()

const COUPLE_OUTPUT = `
Make one photorealistic, full-length photo (head to feet) of the two of them
together: standing side by side, close to each other as a couple, both facing
the camera, the man on the left and the woman on the right. Natural light,
natural anatomy, a realistic fit and physically plausible drape and folds, and a
simple, pleasant background. Do not add text, logos, watermarks or other people.
Preserve each supplied garment's colours and designs without adding embroidery
or prints. Plain supporting pieces and neutral functional trims are allowed
only as specified in REFERENCE ALLOCATION.
`.trim()

export function buildCouplePrompt(his: PromptGarment, her: PromptGarment): string {
  return [
    'Create a photorealistic photo of a couple, each wearing new clothes.',
    COUPLE_PEOPLE,
    PRIORITY,
    sourceText(2, his, 'the man'),
    sourceText(4, her, 'the woman'),
    `Dress each of them in their own garment, in one picture:
- THE MAN (IMAGE 1) wears ${withArticle(garmentName(his))}, made only from IMAGE 2.
- THE WOMAN (IMAGE 3) wears ${withArticle(garmentName(her))}, made only from IMAGE 4.
Keep the two outfits separate: never move colours, motifs or borders from one
garment to the other, and never dress one person in the other person's garment.`,
    `THE MAN'S GARMENT RULES:\n${garmentRules(his)}`,
    `THE WOMAN'S GARMENT RULES:\n${garmentRules(her)}`,
    allocation(his, 2),
    allocation(her, 4),
    COUPLE_OUTPUT,
    `GARMENT TYPE CHECK: ${typeCheck(his, 'For the man, the customer')} ${typeCheck(her, 'For the woman, the customer')}`,
  ].join('\n\n')
}
