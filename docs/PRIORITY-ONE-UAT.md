# Priority-one prompt UAT

Scope: G1–G4, C12, P3–P5 only. Based on UAT `3fccd1d`; existing UAT features
and migrations are retained. Production is unchanged. Later audit priorities
remain deferred until the owner accepts this phase.

## Changes

- Fabric construction and ready-made preservation are separate in single,
  pair and couple prompts, including the final garment-type check.
- Explicit companion references override missing-piece defaults. Neutral
  supporting pieces cannot replace a supplied garment's colour or pattern.
- Separate pieces must be identifiable within the supplied photo; the prompt
  no longer assumes extra role-labelled uploads exist. Missing set pieces use
  plain coordinating defaults. Safari uses the supplied fabric for both pieces.
- Bottom profiles do not introduce a replacement shirt/kurta.
- Pair planning uses explicit combinations in both directions. Chudidhar,
  anarkali and salwar sets accept the legacy pyjama/bottom category only;
  sherwani accepts trousers or pyjama. Shirt/kurta + dhoti remain supported.
  Coat/jacket + dhoti and kurti + dhoti are no longer offered as pairs.

## Validation completed locally

135 tests pass, including 19-category source separation, all supported pair
orders and source combinations, mixed-source couples, safari construction,
reference allocation and incompatible pair rejection. Typecheck and lint pass.
These checks do not prove visual quality. No paid image-generation calls were
made during implementation.

## UAT visual checks (owner approval of GCP UAT build required)

Use your own/consented adult photos and save the input and resulting image for
comparison. The item card must show the intended category/source. Changing the
top selector after upload does not relabel existing normal try-on photos (U1
is deferred).

| Test | Inputs | Pass condition |
| --- | --- | --- |
| Safari fabric | One fabric + full-body person | Safari shirt/jacket with collar, button front, patch pockets AND matching trousers, same fabric throughout |
| Fabric category control | Same fabric separately as lehenga, gown, coat | Selected silhouette; fabric colours and motifs retained |
| Ready-made coat | Coat with contrast lapels/panels | Contrast preserved; no conversion to one continuous fabric |
| Ready-made length | Short-sleeve formal shirt; non-floor-length gown | Actual photographed sleeves/length preserved |
| Single-fabric set | Chudidhar and lehenga separately | Main piece uses the fabric; missing companions are plain/coordinating; no invented embroidery |
| Multi-piece reference | Suit material laid out clearly in one photo | Identifiable pieces keep their own roles, no pattern transfer |
| Shirt + dhoti | Differently coloured references; repeat with order reversed | Selected shirt remains the top; dhoti retains its border; no extra kurta |
| Invalid pair | Chudidhar + dhoti; coat + dhoti | Not offered as a pair; normal individual try-ons still work |
| Mixed couple | Fabric safari for him + ready-made gown for her | Correct person/reference ownership; safari built, gown preserved |

Legacy categories (pant, pyjama, blouse etc.) stay hidden. Their sherwani/bottom
and set/bottom contracts are covered by automated tests; do not re-enable them
merely to test this change. If an existing legacy record can be retried on UAT,
check that its supplied bottom keeps its colour and does not add another top.

Record: input category/source, result image, pass/fail, and the specific visual
issue. Repeat important cases with different fabric patterns before acceptance.
Do not promote to main until the owner explicitly accepts UAT. Port the shared
garment-rule improvements to UduthiPaar only in a separately reviewed follow-up;
this phase is limited to PottuPaarkalaam.
