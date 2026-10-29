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

export const PROMPT_VERSION = 'pp-try-on-v2'

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

const OUTPUT = `
Make one photorealistic, full-length photo (head to feet) of the customer
wearing the outfit, with natural light, natural anatomy, a realistic fit and
physically plausible drape and folds. Do not add text, logos, watermarks or
other people. Do not add embroidery, prints or colours that are not in the
supplied garment photos.
`.trim()

// "a" or "an" before a garment name.
const withArticle = (text: string) => `${/^[aeiou]/i.test(text) ? 'an' : 'a'} ${text}`

// The last instruction of every prompt: the garment type the customer chose.
function typeCheck(garment: PromptGarment, who = 'The customer') {
  const label = categoryLabel(garment.category).toLowerCase()
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

export function buildSinglePrompt(garment: PromptGarment): string {
  const profile = garmentProfile(garment.category)
  return [
    'Create a photorealistic virtual try-on photo.',
    CUSTOMER,
    sourceText(2, garment),
    `Dress the customer in ${withArticle(profile.description)}. Do not turn it into a different kind of garment.`,
    profile.rules,
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
  const mainProfile = garmentProfile(main.category)
  const companionProfile = garmentProfile(companion.category)
  const roleName = ROLE_NAMES[role]
  const companionRules = role === 'BLOUSE' ? BLOUSE_COMPANION_RULES : companionProfile.rules
  return [
    'Create a photorealistic virtual try-on photo of a two-piece outfit.',
    CUSTOMER,
    sourceText(2, main),
    sourceText(3, companion),
    `Dress the customer in BOTH garments at the same time, in one picture:
- MAIN GARMENT: ${withArticle(mainProfile.description)}, made only from IMAGE 2.
- ${roleName}: ${withArticle(companionProfile.description)}, made only from IMAGE 3.
Keep the two garments separate: never move colours, motifs or borders from one
to the other. ${pairRule(main.category, companion.category, role)}`,
    `MAIN GARMENT RULES:\n${mainProfile.rules || 'Tailor it naturally to the customer.'}`,
    `${roleName} RULES:\n${companionRules || 'Tailor it naturally to the customer.'}`,
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
Do not add embroidery, prints or colours that are not in the garment photos.
`.trim()

export function buildCouplePrompt(his: PromptGarment, her: PromptGarment): string {
  const hisProfile = garmentProfile(his.category)
  const herProfile = garmentProfile(her.category)
  return [
    'Create a photorealistic photo of a couple, each wearing new clothes.',
    COUPLE_PEOPLE,
    sourceText(2, his, 'the man'),
    sourceText(4, her, 'the woman'),
    `Dress each of them in their own garment, in one picture:
- THE MAN (IMAGE 1) wears ${withArticle(hisProfile.description)}, made only from IMAGE 2.
- THE WOMAN (IMAGE 3) wears ${withArticle(herProfile.description)}, made only from IMAGE 4.
Keep the two outfits separate: never move colours, motifs or borders from one
garment to the other, and never dress one person in the other person's garment.`,
    `THE MAN'S GARMENT RULES:\n${hisProfile.rules || 'Tailor it naturally to him.'}`,
    `THE WOMAN'S GARMENT RULES:\n${herProfile.rules || 'Tailor it naturally to her.'}`,
    COUPLE_OUTPUT,
    `GARMENT TYPE CHECK: ${typeCheck(his, 'For the man, the customer')} ${typeCheck(her, 'For the woman, the customer')}`,
  ].join('\n\n')
}
