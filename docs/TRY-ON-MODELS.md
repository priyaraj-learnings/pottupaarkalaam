# Cheaper try-on models than FASHN (research, 26 October 2026)

PottuPaarkalaam uses OpenAI's image model, as asked. This note compares it with other try-on options, for later.
Prices are per picture, at about ₹88 per US dollar.

**How reliable these numbers are:** the provider websites could not be opened directly from the research
environment. Prices come from search-result snippets of official pages where available, otherwise from third-party
price trackers. Confirm a price in the provider's own console before switching. Nobody has published quality
benchmarks for sarees or dupattas, so test any option on your own photos first.

## What we use now

| Model | Price per picture | Notes |
| --- | --- | --- |
| **OpenAI `gpt-image-2.5-flare`, quality low** (PottuPaarkalaam, UduthiPaar) | about ₹2.6–3.7 with a customer photo and 1–2 garment photos | Input photos are billed by size (about ₹1 each at 1024×1536), which is why the app shrinks them first. Medium quality is about ₹5.8–6.9, more than the ₹5 bulk price. |
| FASHN `tryon-v1.6` (UduthiPaar) | $0.075 (₹6.60) pay-as-you-go; $0.06 / $0.049 on monthly plans | One garment per call; cannot turn fabric into a garment. |

`gpt-image-1-mini` (about ₹1.3 + inputs) and `gpt-image-1.5` shut down on **1 December 2026**. Do not build on them.

## Cheaper options

### For photos of stitched garments

| Option | Price per picture | Notes |
| --- | --- | --- |
| **Pruna P-Image Try-On** (Replicate `prunaai/p-image-try-on`, Pruna API, Runware, Segmind) | $0.015 for the first garment, then $0.008 for each extra one (₹1.3 single, ₹2.0 top + bottom) | Cheapest commercial try-on API; takes a whole outfit (up to 11 garment photos) in one call and accepts instructions. Not tested on Indian wear. |
| Alibaba OutfitAnyone `aitryon` | ¥0.20 (about ₹2.5) | Top, bottom or both. **Runs only in China (Beijing)**, a data-protection problem for Indian customers' photos. |
| fal `image-apps-v2` try-on | $0.04 (₹3.5) | One garment per call. |
| Google Vertex AI `virtual-try-on-001` | about $0.06 (₹5.3) | One garment per call. |
| Kling Kolors v1.5 try-on | $0.066–0.083 (₹5.8–7.3) | One garment per call; output only 768×1024. |
| Pixelcut, Photoroom, Perfect Corp (YouCam), Aidge | $0.10–0.20 (₹8.8–17.6) | Dearer than FASHN. Perfect Corp says it supports saree and lehenga. |
| FASHN VTON 1.5 (open source, Apache 2.0) | GPU time only if self-hosted (under $0.01 at high use; idle GPUs cost more at low volume) | Western categories only. |
| IDM-VTON, CatVTON, OOTDiffusion | | **Non-commercial licences: cannot be used.** |

Classic try-on models (FASHN, Kolors, OutfitAnyone, Vertex, IDM-VTON and similar) are trained mostly on western
catalogue clothes. Kurtas, sherwanis and salwar sets work as top + bottom, but saree pleats, pallu and dupatta drapes
usually come out as a generic dress. **None of them can make a garment from an unstitched fabric photo.**

### For unstitched fabric photos (general image models)

| Option | Price per picture | Notes |
| --- | --- | --- |
| **Gemini Nano Banana 2 Lite** (`gemini-3.1-flash-lite-image`, already in UduthiPaar) | $0.034 (about ₹3.0) | Fast (about 4 s); good general knowledge of Indian drapes. |
| Seedream 4.0 / 5.0 Lite (BytePlus) | $0.03 / $0.035 (₹2.6 / ₹3.1) | Good at combining several reference photos. |
| Qwen Image Edit Plus (Alibaba Cloud, Singapore) | $0.03 (₹2.6) | Up to 3 input photos; open weights also exist. |
| OpenAI GPT Image 2.5 Flare, low | about ₹2.6–3.7 | Current choice. |
| Pruna P-Image-Edit | $0.01 (₹0.9) | Very cheap and fast; quality for fabric → garment unknown. |
| Nano Banana 2.1 (`gemini-nano-banana-2.1`) | $0.034 at 1K plus input tokens (about ₹3.5–4.4) | |

## Recommendation

1. **Keep OpenAI at low quality** for launch. It handles both fabric and stitched photos, and Indian drapes, at roughly
   ₹2.6–3.7, inside the ₹5 / ₹10 prices.
2. **Test Pruna P-Image Try-On** on 20–30 of your own photos of stitched kurtas, sherwanis, salwar sets and shirt + pant.
   If quality holds, it could serve stitched-dress try-ons at ₹1.3–2.0.
3. **Test Nano Banana 2 Lite and Seedream** against OpenAI for fabric photos and sarees. They cost about the same, so
   choose on quality.

## Also found: affects UduthiPaar

- **`gemini-3.1-flash-image` may be shut down on 29 October 2026.** Third-party write-ups citing Google's 6 October
  changelog name `gemini-nano-banana-2.1` (about half the price) as the replacement. An older snapshot of Google's
  page said no date was set, so check https://ai.google.dev/gemini-api/docs/deprecations. UduthiPaar uses this model
  for "Gemini 3.1 Flash Image" (`lib/ai/providers/gemini.ts`, `lib/occasion/couplePhoto.ts`).
- UduthiPaar's cost estimate for `gpt-image-2.5-flare` ($0.02, `lib/ai/cost.ts`) is probably low: input photos add
  about $0.012 each. Its AI Cost Report uses the real token counts, so that report is the one to trust.

## Sources

- FASHN pricing: https://help.fashn.ai/plans-and-pricing/api-pricing
- Pruna P-Image Try-On: https://docs.pruna.ai/en/stable/docs_pruna_endpoints/performance_models/p-image-try-on.html, https://replicate.com/prunaai/p-image-try-on
- Alibaba OutfitAnyone: https://help.aliyun.com/zh/model-studio/billing-for-outfitanyone
- fal try-on overview: https://fal.ai/learn/tools/best-virtual-try-on-apis-2026, https://fal.ai/explore/virtual-try-on-apis
- Kling try-on: https://www.cometapi.com/models/kling/kling-virtual-try-on/
- Vertex AI try-on: https://cloudprice.net/models/google-virtual-try-on-1
- Pixelcut: https://www.pixelcut.ai/hi-in/api/try-on · Perfect Corp: https://www.perfectcorp.com/business/blog/ai-clothes/virtual-try-on-api-pricing
- FASHN VTON 1.5: https://fashn.ai/blog/fashn-vton-1-5-open-source-release
- IDM-VTON licence: https://replicate.com/cuuupid/idm-vton · CatVTON: https://huggingface.co/camenduru/CatVTON/blob/main/README.md
- OpenAI image models and shutdowns: https://developers.openai.com/api/docs/models/gpt-image-2.5-flare, https://developers.openai.com/api/docs/deprecations, https://community.openai.com/t/openai-must-document-the-input-image-pricing-of-gpt-image-2-so-i-did/1382940
- Gemini image models: https://www.eesel.ai/blog/nano-banana-2-lite-pricing, https://techaiwire.com/articles/nano-banana-2-1-gemini-image-model-half-price/, https://smartscope.blog/en/blog/gemini-nano-banana-21-api-pricing-migration-2026/
- Seedream: https://evolink.ai/blog/seedream-pricing-guide-2026 · Qwen Image Edit: https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-plus
- Pruna P-Image-Edit: https://replicate.com/prunaai/p-image-edit
