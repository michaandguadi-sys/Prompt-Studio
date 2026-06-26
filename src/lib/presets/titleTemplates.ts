import type { TitleSceneSpec, TitleTemplate } from "../types";

/**
 * Title template presets (#8). Each entry bundles the field values that give a
 * template its signature look. Applying a template patches these onto the
 * scene; every value remains individually editable afterward.
 */
export type TitleTemplateDef = {
  id: TitleTemplate;
  name: string;
  description: string;
  /** Fields applied when the user picks this template. */
  patch: Partial<TitleSceneSpec>;
};

export const TITLE_TEMPLATES: TitleTemplateDef[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Thin centered title with a soft glow. Calm and cinematic.",
    patch: {
      template: "classic",
      variant: "centered",
      align: "center",
      position: "center",
      titleScale: 1,
      uppercaseTitle: false,
      titleWeight: 200,
      animation: "fade-up",
      background: "gradient",
      maxWidthPct: 0.82,
    },
  },
  {
    id: "impact",
    name: "Impact",
    description: "Huge bold uppercase with an accent underline. Maximum punch.",
    patch: {
      template: "impact",
      variant: "centered",
      align: "center",
      position: "center",
      titleScale: 1.15,
      uppercaseTitle: true,
      titleWeight: 800,
      animation: "scale",
      background: "solid",
      maxWidthPct: 0.9,
    },
  },
  {
    id: "kicker-box",
    name: "Kicker Box",
    description: "Kicker inside a filled accent pill above the title. Editorial chapter cards.",
    patch: {
      template: "kicker-box",
      variant: "left",
      align: "left",
      position: "center",
      titleScale: 1,
      uppercaseTitle: false,
      titleWeight: 600,
      animation: "fade-up",
      background: "solid",
      maxWidthPct: 0.7,
    },
  },
  {
    id: "stacked",
    name: "Stacked Bar",
    description: "Accent bar on the left, title + subtitle stacked tight. News / lower-third feel.",
    patch: {
      template: "stacked",
      variant: "left",
      align: "left",
      position: "bottom",
      titleScale: 0.85,
      uppercaseTitle: false,
      titleWeight: 600,
      animation: "wipe",
      background: "transparent",
      maxWidthPct: 0.66,
    },
  },
  {
    id: "serif",
    name: "Serif Editorial",
    description: "Serif title, hairline rule, italic subtitle. Prestige documentary.",
    patch: {
      template: "serif",
      variant: "centered",
      align: "center",
      position: "center",
      titleScale: 1.05,
      uppercaseTitle: false,
      titleWeight: 400,
      animation: "fade",
      background: "gradient",
      maxWidthPct: 0.78,
    },
  },
  {
    id: "word-reveal",
    name: "Word Reveal",
    description: "Title words rise in sequence. Great over a held shot.",
    patch: {
      template: "word-reveal",
      variant: "centered",
      align: "center",
      position: "center",
      titleScale: 1.1,
      uppercaseTitle: true,
      titleWeight: 700,
      animation: "word-reveal",
      background: "solid",
      maxWidthPct: 0.85,
    },
  },
];

export const titleTemplateById = (id: TitleTemplate | undefined): TitleTemplateDef =>
  TITLE_TEMPLATES.find((t) => t.id === (id ?? "classic")) ?? TITLE_TEMPLATES[0];
