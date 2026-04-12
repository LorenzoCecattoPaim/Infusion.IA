const QUALITY_HINTS = {
  standard: "high quality, detailed, sharp focus",
  premium: "ultra-detailed, high-end, 4k, studio lighting, premium finish",
};

const TEMPLATE_HINTS = {
  "post-instagram": "social media post, modern branding, eye-catching composition",
  produto: "product photography, clean background, commercial style",
  gastronomia: "food photography, appetizing styling, warm highlights",
  corporativo: "corporate branding, professional and clean look",
  criativo: "creative concept, bold visuals, artistic flair",
};

const FORMAT_HINTS = {
  youtube_thumbnail: "16:9 wide composition, subject prominent, dynamic framing",
  youtube_banner: "16:9 wide banner composition, balanced spacing",
  instagram_1x1: "1:1 square composition, centered subject",
  stories_16x9: "16:9 vertical story composition, strong focal point",
};

const STYLE_HINTS = {
  Clean: "clean, minimal, airy layout, subtle shadows",
  Moderno: "modern, sleek design, refined gradients",
  Luxuoso: "luxury aesthetic, premium materials, soft highlights",
  Minimalista: "minimalist, restrained palette, lots of negative space",
  Colorido: "vibrant, colorful palette, energetic mood",
};

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildBusinessHint(profile) {
  if (!profile) return "";
  const parts = [];
  if (profile.nome_empresa) parts.push(`Brand: ${profile.nome_empresa}`);
  if (profile.segmento_atuacao) parts.push(`Segment: ${profile.segmento_atuacao}`);
  if (profile.publico_alvo) parts.push(`Target audience: ${profile.publico_alvo}`);
  if (profile.tom_comunicacao) parts.push(`Tone: ${profile.tom_comunicacao}`);
  if (profile.marca_descricao) parts.push(`Brand personality: ${profile.marca_descricao}`);
  return parts.length ? parts.join(", ") : "";
}

export function buildImagePrompt({
  prompt,
  template,
  format,
  style,
  quality = "standard",
  businessProfile,
  includeLogoSpace = false,
  purpose = "image",
}) {
  const basePrompt = normalizeText(prompt) || "professional marketing visual for a brand";
  const qualityHint = QUALITY_HINTS[quality] || QUALITY_HINTS.standard;
  const templateHint = template ? TEMPLATE_HINTS[template] : "";
  const formatHint = format ? FORMAT_HINTS[format] : "";
  const styleHint = style ? STYLE_HINTS[style] || style : "";
  const businessHint = buildBusinessHint(businessProfile);

  const common = [
    basePrompt,
    templateHint,
    formatHint,
    styleHint,
    businessHint,
    "modern, professional, premium branding",
    "clean composition, balanced layout, depth of field",
    "soft studio lighting, subtle shadows, rich textures",
    qualityHint,
    "no readable text, no watermarks, no logos unless specified",
  ]
    .filter(Boolean)
    .join(". ");

  if (purpose === "logo") {
    const logoPrompt = [
      basePrompt,
      businessHint,
      "vector art, clean design, minimalist, scalable, professional logo",
      "simple geometry, strong silhouette, balanced negative space",
      "flat or subtle 3D depth, high contrast, brand-ready",
      qualityHint,
      "no readable text, no mockups, no watermarks",
    ]
      .filter(Boolean)
      .join(". ");

    return {
      optimizedPrompt: logoPrompt,
      negativePrompt:
        "blurry, low quality, distorted, watermark, text, misspelled, noisy, photo, realistic scene",
    };
  }

  const logoSpaceHint = includeLogoSpace
    ? "leave clean empty space in the bottom-right corner for a logo"
    : "";

  const optimizedPrompt = [common, logoSpaceHint].filter(Boolean).join(". ");

  return {
    optimizedPrompt,
    negativePrompt:
      "blurry, low quality, distorted, watermark, text, misspelled, noisy, artifacts, deformed",
  };
}

