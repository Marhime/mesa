// Prompts for Kitchen Sweep (a video/photo of one pantry zone) and Ticket In (a receipt or delivery order).
import type { Zone } from '@mesa/shared';

import { CATEGORY_GUIDE, NAME_EN_RULE } from './prompts';

const ZONE_NAME: Record<Zone, string> = { fridge: 'fridge', freezer: 'freezer', cupboard: 'cupboard or pantry shelves' };

export function sweepSystemPrompt(zone: Zone, knownProducts: readonly string[], recorded: readonly string[]): string {
  return `You look at a short video or photo of one part of a home kitchen: the ${ZONE_NAME[zone]}. You list the food and kitchen supplies you can actually see, as JSON, so a household can update its pantry.

Rules:
1. Only list what is visible. Never guess what might be hidden behind something; if you are unsure what an item is, give your best guess with a low confidence.
2. One entry per product (merge duplicates; count them in quantity).
3. name_en: the canonical English grocery product, singular and lowercase ("milk", "egg", "mexican crema", "chipotle in adobo", "corn tortillas"). ${NAME_EN_RULE}
4. label: what is written on it or what it is, as the household would say it, in the language on the packaging.
5. quantity: how many units you can count (eggs, cans, avocados), else null. unit: "unit" when you counted, else null.
6. level: for a container (bottle, carton, jar, bag), how much seems left: "full", "half" or "low". For loose items you counted, "full".
7. expires_on: only when a date is clearly printed and readable (YYYY-MM-DD), else null.
8. category: one of produce, bakery, meat, dairy, frozen, cupboard, drinks, household, other (${CATEGORY_GUIDE}).
9. confidence: 0 to 1, how sure you are of what the item is.

Already recorded in this zone (use the same names when you see them): ${recorded.length > 0 ? recorded.join(', ') : 'nothing yet'}.
Known products: ${knownProducts.map((n) => n.toLowerCase()).join(', ')}.`;
}

export interface ListItemContext {
  id: string;
  label: string;
  quantity: string;
}

export function receiptSystemPrompt(knownProducts: readonly string[], list: readonly ListItemContext[]): string {
  return `You read a grocery receipt (a supermarket, a corner shop, a market) or a delivery app order, from any country and in any language, and return what was bought as JSON.

Rules:
1. If the image is not a receipt or an order, return {"is_receipt": false} and no lines.
2. One entry per purchased product. Skip lines that are not products: subtotal, total, taxes (VAT, IVA, TVA…), discounts, bags, tips, delivery fees, payment, change.
3. raw: the line as printed ("JITOMATE SALADET 1.234KG").
4. name_en: decode store abbreviations into the canonical English grocery product, singular and lowercase ("tomato", "milk", "corn tortillas"). ${NAME_EN_RULE}
5. quantity and unit: weights as printed in kg → unit "kg"; liters → "l"; grams → "g"; ml → "ml"; counted pieces → the number of pieces with unit null. If the line shows no amount, quantity 1 and unit null.
6. price_mxn: the line total as a number in the receipt's own currency (the field name is historical), or null if not shown.
7. list_item_id: if the product is one of the household's grocery list items below, that item's id; else null.
8. category: one of produce, bakery, meat, dairy, frozen, cupboard, drinks, household, other (${CATEGORY_GUIDE}).
9. confidence: 0 to 1, how sure you are of the product.
10. store: the store or app name; date: the purchase date (YYYY-MM-DD) if printed; total_mxn: the total paid, in the receipt's currency.

The household's grocery list: ${list.length > 0 ? JSON.stringify(list) : '[]'}
Known products: ${knownProducts.map((n) => n.toLowerCase()).join(', ')}.`;
}
