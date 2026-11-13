// How a food is grouped and drawn: its family (Pantry sections) and its picto (the little drawing).
// Catalog products carry both (catalog.json → products.family / products.picto); products a household
// creates get them from their category.
import type { Category } from './types';

/** Pantry sections, in screen order: fresh first. */
export const FAMILIES = [
  'vegetables',
  'fruit',
  'herbs_chiles',
  'dairy_eggs',
  'meat_fish',
  'bread_tortillas',
  'grains_beans',
  'baking',
  'cans_sauces',
  'spices_oils',
  'snacks_sweets',
  'drinks',
  'home',
  'other',
] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_LABEL: Record<Family, string> = {
  vegetables: 'Vegetables',
  fruit: 'Fruit',
  herbs_chiles: 'Herbs & chiles',
  dairy_eggs: 'Dairy & eggs',
  meat_fish: 'Meat & fish',
  bread_tortillas: 'Tortillas & bread',
  grains_beans: 'Grains & beans',
  baking: 'Baking',
  cans_sauces: 'Cans & sauces',
  spices_oils: 'Spices & oils',
  snacks_sweets: 'Snacks & sweets',
  drinks: 'Drinks',
  home: 'Home',
  other: 'Other',
};

/** Every drawing the app has. A product points to the one that looks most like it. */
export const PICTOS = [
  // vegetables, herbs and chiles
  'tomato', 'onion', 'garlic', 'carrot', 'radish', 'leafy', 'corn', 'pepper', 'squash', 'potato',
  'broccoli', 'avocado', 'nopal', 'mushroom', 'pod', 'herb', 'chile',
  // fruit
  'citrus', 'banana', 'apple', 'berry', 'melon', 'tropical', 'pineapple',
  // fridge
  'milk', 'cheese', 'egg', 'cup', 'butter', 'poultry', 'meat', 'fish', 'shrimp', 'sausage',
  // shelf and home
  'tortilla', 'bread', 'sack', 'beans', 'pasta', 'can', 'jar', 'oil', 'sauce', 'shaker', 'snack',
  'sweet', 'mug', 'drink', 'ice', 'roll', 'cleaner',
] as const;
export type Picto = (typeof PICTOS)[number];

const FAMILY_OF_CATEGORY: Record<Category, Family> = {
  produce: 'vegetables',
  bakery: 'bread_tortillas',
  meat: 'meat_fish',
  dairy: 'dairy_eggs',
  frozen: 'other',
  cupboard: 'other',
  drinks: 'drinks',
  household: 'home',
  other: 'other',
};

const PICTO_OF_CATEGORY: Record<Category, Picto> = {
  produce: 'leafy',
  bakery: 'bread',
  meat: 'meat',
  dairy: 'milk',
  frozen: 'ice',
  cupboard: 'jar',
  drinks: 'drink',
  household: 'cleaner',
  other: 'jar',
};

const isFamily = (v: unknown): v is Family => typeof v === 'string' && (FAMILIES as readonly string[]).includes(v);
const isPicto = (v: unknown): v is Picto => typeof v === 'string' && (PICTOS as readonly string[]).includes(v);

/** The product's own family, else one guessed from its category. */
export function familyOf(p: { family?: string | null; category: Category }): Family {
  return isFamily(p.family) ? p.family : FAMILY_OF_CATEGORY[p.category];
}

/** The product's own drawing, else its category's. */
export function pictoOf(p: { picto?: string | null; category: Category }): Picto {
  return isPicto(p.picto) ? p.picto : PICTO_OF_CATEGORY[p.category];
}

export { isFamily, isPicto };
