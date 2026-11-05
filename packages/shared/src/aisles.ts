// Aisle order for the grocery list and the section titles shown in the app.
import type { Category } from './types';

export const AISLE_ORDER: Category[] = ['produce', 'bakery', 'meat', 'dairy', 'frozen', 'cupboard', 'drinks', 'household', 'other'];
export const CATEGORY_LABEL: Record<Category, string> = {
  produce: 'Produce',
  bakery: 'Bakery',
  meat: 'Meat & fish',
  dairy: 'Dairy & eggs',
  frozen: 'Frozen',
  cupboard: 'Cupboard',
  drinks: 'Drinks',
  household: 'Household',
  other: 'Other',
};
