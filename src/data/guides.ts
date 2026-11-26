export const SHORT_LIMIT = 40;

/** Hospital wording → Noun;Type, with the MPH category and UNSPSC it usually belongs to. */
export const CATEGORY_MAP: { nt: string; cat: string; unspsc: string; title: string; terms: string[] }[] = [
  { nt: 'NEEDLE;WINGED INFUSION', cat: 'NEEDLE', unspsc: '42142547', title: 'Winged infusion needle set', terms: ['SCALP VEIN', 'BUTTERFLY', 'WINGED', 'VENOFIX', 'SURFLO'] },
  { nt: 'CATHETER;IV', cat: 'CATHETERS', unspsc: '42221512', title: 'Intravenous catheters', terms: ['IV CATHETER', 'IV CANNULA', 'IV CATH', 'VENFLON', 'INTROCAN', 'JELCO'] },
];
