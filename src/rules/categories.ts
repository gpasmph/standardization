import { ASK_KEYS } from './columns';
import type { CategoryConfig } from './types';

const NOUN = 'NOUN', TYPE = 'TYPE', MFR = 'MANUFACTURER', CODE = 'MANUFACTURE ITEM CODE', BRAND = 'ITEM BRAND/MODEL';
const MAT1 = 'MATERIAL/COMPOSITION (1)', DIM1 = 'DIMENSION/SIZE (1)', DIM2 = 'DIMENSION/SIZE (2)', LEN1 = 'LENGTH (1)';
const COLOR = 'COLOR', CONF = 'CONFIGURATION', ITYPE = 'ITEM_TYPE';
const SHAPE = 'SHAPE';

/**
 * CANNULA: drafted from the 500 rows the team already filled (Nasal, Venous, Arterial, IV, CPAP...).
 * In those rows the short description reads NOUN;TYPE;ITEM_TYPE;SIZE;BRAND, e.g. CANNULA;NASAL;OXYGEN;ADULT;RESWELL.
 * Material, latex, disposable and sterile are columns only: they almost never appear in a description.
 * Needs MPH confirmation before it is final.
 */
const CANNULA: CategoryConfig = {
  id: 'CANNULA',
  noun: 'CANNULA',
  label: 'Cannula',
  ask: ASK_KEYS,
  long: [NOUN, TYPE, ITYPE, DIM1, DIM2, LEN1, COLOR, CONF, BRAND, MFR, CODE],
  short: [NOUN, TYPE, ITYPE, DIM1, LEN1, BRAND, MFR, CODE],
  shortPriority: [NOUN, TYPE, CODE, DIM1, BRAND, ITYPE, LEN1, MFR],
  required: [NOUN, TYPE],
  notes: [
    'Size goes in DIMENSION/SIZE (1): gauge as 23G, age group as ADULT / PEDIATRIC / NEONATE.',
    'If the brand and the manufacturer are the same word, it is written once.',
    'Latex, disposable, sterile and material are filled as columns but are not part of the description.',
  ],
};

/**
 * CATHETER, NEEDLE and SUTURE: drafted from the MPH long descriptions and the few PASIA rows already written
 * (the team has not filled the PASIA descriptions for most of these yet), so they are weaker than CANNULA. Needs MPH confirmation.
 */
const CATHETERS: CategoryConfig = {
  id: 'CATHETERS',
  noun: 'CATHETER',
  label: 'Catheter',
  ask: ASK_KEYS,
  long: [NOUN, TYPE, ITYPE, CONF, MAT1, DIM1, DIM2, LEN1, BRAND, MFR, CODE],
  short: [NOUN, TYPE, DIM1, CONF, BRAND, MFR, CODE],
  shortPriority: [NOUN, TYPE, CODE, DIM1, BRAND, CONF, MFR],
  required: [NOUN, TYPE],
  notes: [
    'Size goes in DIMENSION/SIZE (1): French size as FR18, balloon as 3.75X30MM.',
    'Shape and configuration (STRAIGHT, DILATATION, RAPID EXCHANGE) go in CONFIGURATION.',
    'Most rows have no PASIA description yet, so this guide follows the MPH long descriptions.',
  ],
};

const NEEDLE: CategoryConfig = {
  id: 'NEEDLE',
  noun: 'NEEDLE',
  label: 'Needle',
  ask: ASK_KEYS,
  long: [NOUN, TYPE, ITYPE, DIM1, DIM2, LEN1, SHAPE, BRAND, MFR, CODE],
  short: [NOUN, TYPE, DIM1, LEN1, SHAPE, BRAND, MFR, CODE],
  shortPriority: [NOUN, TYPE, CODE, DIM1, LEN1, BRAND, SHAPE, MFR],
  required: [NOUN, TYPE],
  notes: ['Gauge goes in DIMENSION/SIZE (1) as 23G; the needle length goes in LENGTH (1).'],
};

const SUTURE: CategoryConfig = {
  id: 'SUTURE',
  noun: 'SUTURE',
  label: 'Suture',
  ask: ASK_KEYS,
  long: [NOUN, TYPE, BRAND, COLOR, DIM1, LEN1, CONF, ITYPE, MFR, CODE],
  short: [NOUN, BRAND, DIM1, LEN1, CONF, CODE],
  shortPriority: [NOUN, CODE, BRAND, DIM1, LEN1, CONF],
  required: [NOUN],
  notes: [
    'Suture size goes in DIMENSION/SIZE (1) as SZ0, SZ2-0 and so on. The needle (e.g. 1/2 CIRCLE TAPER POINT) goes in CONFIGURATION.',
    'In the approved rows the short description has no TYPE: SUTURE;VLOC 180;SZ0;30CM;GS21;VLOCL0316.',
  ],
};

/** Used when a category has no config yet: every attribute is allowed and the Excel column order is followed. */
const GENERIC: CategoryConfig = {
  id: 'GENERIC',
  label: 'Other items',
  ask: ASK_KEYS,
  long: [NOUN, TYPE, ITYPE, MAT1, DIM1, DIM2, LEN1, COLOR, CONF, BRAND, MFR, CODE],
  short: [NOUN, TYPE, ITYPE, DIM1, LEN1, CONF, BRAND, MFR, CODE],
  shortPriority: [NOUN, TYPE, CODE, DIM1, BRAND, ITYPE, LEN1, CONF, MFR],
  required: [NOUN, TYPE],
  notes: ['No category guide yet: this follows the general order of the Excel columns.'],
};

export const CATEGORIES: CategoryConfig[] = [CANNULA, CATHETERS, NEEDLE, SUTURE, GENERIC];
export const categoryById = (id: string): CategoryConfig => CATEGORIES.find((c) => c.id === id) ?? GENERIC;
