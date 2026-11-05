// Public API of @mesa/shared. Signatures are the contract (docs/CONTRACT.md).
export * from './types';
// text
export { normalizeText, singularize, capitalize } from './normalize';
// units
export { parseUnit, unitFamily, scaleQuantity, roundForShopping, formatQuantity } from './units';
// parsing
export type { ParsedItem } from './parse';
export { parseGroceryInput, parseIngredientLine } from './parse';
// catalog
export type { CatalogIndex } from './catalog';
export { buildCatalogIndex, matchProduct } from './catalog';
// aisles
export { AISLE_ORDER, CATEGORY_LABEL } from './aisles';
