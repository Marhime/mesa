// Public API of @mesa/shared. Signatures are the contract (docs/CONTRACT.md).
export * from './types';
// import jobs: every kind and what it does (lane, quota, failure), and why a job failed
export type { JobKindSpec, JobLane, ImportKind } from './job-kinds';
export { JOB_KINDS, JOB_LANES, IMPORT_KINDS, isImportKind, jobKind } from './job-kinds';
export type { ErrorCode } from './errors';
export { MESSAGES, isErrorCode } from './errors';
// text
export { normalizeText, singularize, capitalize } from './normalize';
// vague names ("Other", "Sauce"): never a household product, a known name or a match
export { isGenericName, isVaguePhrase } from './generic';
// units
export { parseUnit, unitFamily, scaleQuantity, roundForShopping } from './units';
export { formatQuantity } from './format';
// ingredient sections ("Marinade", "Sauce"): heading lines in the editor, groups on the recipe page
export type { SectionGroup } from './sections';
export { MAX_SECTION_CHARS, cleanSection, sectionHeading, headingLine, groupBySection, linesWithHeadings, readSections, meaningfulSections, inSectionOrder } from './sections';
// parsing
export type { ParsedItem } from './parse';
export { parseGroceryInput, parseIngredientLine, measureWord } from './parse';
// catalog
export type { CatalogIndex } from './catalog';
export { buildCatalogIndex, matchProduct } from './catalog';
// aisles
export { AISLE_ORDER, CATEGORY_LABEL } from './aisles';
// families (Pantry sections) and pictos
export type { Family, Picto } from './looks';
export { FAMILIES, FAMILY_LABEL, PICTOS, familyOf, pictoOf } from './looks';
