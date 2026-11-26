/**
 * The attribute columns of the PASIA TEAM section of the working Excel (the pink columns), in sheet order.
 * `col` is the exact header text, so what the portal saves lines up with what the import reads.
 */
export interface AttrDef {
  col: string;
  group: string;
  required?: boolean;
  /** Fixed choices; anything else is free text. */
  options?: string[];
  hint?: string;
}

export const GROUPS = ['Identity', 'Maker and brand', 'Material, size and shape', 'Configuration and use', 'Other attributes'] as const;

export const ATTRS: AttrDef[] = [
  { col: 'NOUN', group: 'Identity', required: true, hint: 'What the item is, e.g. CATHETER' },
  { col: 'TYPE', group: 'Identity', required: true, hint: 'Subtype, e.g. IV' },

  { col: 'MANUFACTURER', group: 'Maker and brand' },
  { col: 'MANUFACTURE ITEM CODE', group: 'Maker and brand' },
  { col: 'ITEM BRAND/MODEL', group: 'Maker and brand' },
  { col: 'EQUIPMENT BRAND/ MODEL', group: 'Maker and brand' },

  { col: 'MATERIAL/COMPOSITION (1)', group: 'Material, size and shape' },
  { col: 'MATERIAL/COMPOSITION (2)', group: 'Material, size and shape' },
  { col: 'DIMENSION/SIZE (1)', group: 'Material, size and shape', hint: 'e.g. 22G' },
  { col: 'DIMENSION/SIZE (2)', group: 'Material, size and shape' },
  { col: 'DIMENSION/SIZE (3)', group: 'Material, size and shape' },
  { col: 'LENGTH (1)', group: 'Material, size and shape', hint: 'e.g. 25MM' },
  { col: 'LENGTH (2)', group: 'Material, size and shape' },
  { col: 'LENGTH (3)', group: 'Material, size and shape' },
  { col: 'LENGTH (4)', group: 'Material, size and shape' },
  { col: 'SHAPE', group: 'Material, size and shape' },
  { col: 'COLOR', group: 'Material, size and shape' },
  { col: 'DIAMETER', group: 'Material, size and shape' },
  { col: 'ANGLE', group: 'Material, size and shape' },

  { col: 'CONFIGURATION', group: 'Configuration and use' },
  { col: 'NO. OF ITEMS', group: 'Configuration and use' },
  { col: 'UOM', group: 'Configuration and use', hint: 'e.g. EACH' },
  { col: 'ITEM_TYPE', group: 'Configuration and use' },
  { col: 'LATEX FREE/LATEX', group: 'Configuration and use', options: ['LATEX FREE', 'LATEX'] },
  { col: 'DISPOSABLE/REUSABLE', group: 'Configuration and use', options: ['DISPOSABLE', 'REUSABLE'] },
  { col: 'STERILE/NON STERILE', group: 'Configuration and use', options: ['STERILE', 'NON STERILE'] },

  { col: 'OTHER ATTRIBUTES (1)', group: 'Other attributes' },
  { col: 'OTHER ATTRIBUTES (2)', group: 'Other attributes' },
  { col: 'OTHER ATTRIBUTES (3)', group: 'Other attributes' },
];

export const REQUIRED = ATTRS.filter((a) => a.required).map((a) => a.col);
