-- Vague household products (Nov 2026, the Bò Kho import).
-- An import could turn a placeholder ("Other") or a bare head noun ("Sauce", said of fish sauce) into a
-- household product. Every later line with that word, or with one of the labels it collected as aliases
-- ("star anise" and "minced lemongrass" on "Other"), then landed on it and showed its name. The worker and
-- the app no longer create, offer or match such names (packages/shared/src/generic.ts). This repairs what
-- is stored:
--   1. a recipe line pointing to a vague household product gets back its own name: what the import read
--      (recipes.original) when that was specific, else its text without the amount and unit
--      ("2 tbsp fish sauce" → "Fish sauce");
--   2. it is relinked only to a product of exactly that name or alias (the household's first, then the
--      catalog's), else left unlinked: it works by name like a typed line (the list, Have / To buy);
--   3. vague household products lose their aliases (the labels they swallowed), and so does any vague
--      alias of a household product ("paste" on Achiote paste).
-- The products themselves stay: they may be in a pantry or on a list, where the household can rename or
-- remove them. Nothing matches them any more. repair_vague_products() may run again (service role only).

-- Same lists as packages/shared/src/generic.ts (a shared test keeps them equal). Plurals are written out:
-- SQL does not singularize.
create or replace function public.is_vague_name(p_name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  with w as (
    select array_remove(regexp_split_to_array(lower(coalesce(p_name, '')), '[^a-z0-9]+'), '') as words
  ), lists as (
    select
      array['other', 'others', 'misc', 'miscellaneous', 'various', 'assorted', 'item', 'items', 'ingredient', 'ingredients',
            'food', 'foods', 'product', 'products', 'thing', 'things', 'stuff', 'grocery', 'groceries', 'unknown', 'none', 'null',
            'otro', 'otros', 'otra', 'otras', 'varios', 'producto', 'productos', 'autre', 'autres', 'divers', 'produit', 'produits'
      ]::text[] as placeholders,
      array['sauce', 'sauces', 'seasoning', 'seasonings', 'spice', 'spices', 'condiment', 'condiments', 'paste', 'pastes',
            'powder', 'powders', 'oil', 'oils', 'herb', 'herbs', 'vegetable', 'vegetables', 'veggie', 'veggies', 'mix', 'mixes',
            'garnish', 'garnishes', 'topping', 'toppings'
      ]::text[] as heads,
      array['spice mix', 'spice blend', 'seasoning mix', 'seasoning blend', 'n/a']::text[] as phrases
  )
  select cardinality(w.words) > 0 and (
           array_to_string(w.words, ' ') in (
             select array_to_string(array_remove(regexp_split_to_array(x, '[^a-z0-9]+'), ''), ' ') from unnest(l.phrases) x)
        or (cardinality(w.words) = 1 and w.words[1] = any (l.heads))
        or (w.words && l.placeholders and w.words <@ (l.placeholders || l.heads)))
  from w, lists l
$$;

-- A recipe line's own name, from its text: "2 tbsp fish sauce" → "Fish sauce", "2–3 star anise" → "Star anise",
-- "1.4 kg / 3 lbs beef, cut into cubes" → "Beef". Null when nothing but an amount is left.
create or replace function public.ingredient_label(p_raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := coalesce(p_raw, '');
  c_amount constant text := '^[0-9½⅓⅔¼¾⅛⅜⅝⅞]+([.,/][0-9]+)?([[:space:]]*([~–—-]|to|a|o)[[:space:]]*[0-9½⅓⅔¼¾⅛⅜⅝⅞]+([.,/][0-9]+)?)?[[:space:]]*';
  c_unit constant text := '^(tbsps?|tbs|tablespoons?|tsps?|teaspoons?|cups?|g|grs?|grams?|kgs?|kilos?|ml|l|liters?|litres?|lbs?|pounds?|oz|ounces?|cans?|tins?|cloves?|pinch(es)?|slices?|bunch(es)?|packs?|packets?|pieces?|pcs?|cdas?|cditas?|cdtas?|cucharadas?|cucharaditas?|tazas?|latas?|dientes?|pizcas?|piezas?)\.?([[:space:]]+|$)';
begin
  v := regexp_replace(v, '\([^()]*\)', ' ', 'g');          -- notes in parentheses
  v := regexp_replace(v, '([0-9]),([0-9])', '\1.\2', 'g');  -- a decimal comma is not a prep note
  v := split_part(v, ',', 1);                                -- "1 thumb ginger, sliced"
  v := regexp_replace(v, '^[[:space:]*•·–—-]+', '');         -- list bullets
  for i in 1..3 loop                                         -- "1.4 kg / 3 lbs beef": amount, unit, slash, again
    v := regexp_replace(v, c_amount, '', 'i');
    v := regexp_replace(v, c_unit, '', 'i');
    v := regexp_replace(v, '^(/|of[[:space:]]|de[[:space:]]|d'')[[:space:]]*', '', 'i');
  end loop;
  v := regexp_replace(v, '[[:space:]]+(to taste|al gusto|optional|opcional|for serving|to serve|para servir)\.?$', '', 'i');
  v := btrim(regexp_replace(v, '[[:space:]]+', ' ', 'g'), ' .;:-');
  if v ~ '^[0-9[:space:].,/~½⅓⅔¼¾⅛⅜⅝⅞–—-]*$' then  -- only an amount was left (any script counts as a name)
    return null;
  end if;
  return upper(left(v, 1)) || substr(v, 2);
end;
$$;

create or replace function public.repair_vague_products()
returns int
language plpgsql
set search_path = public
as $$
declare
  v_line record;
  v_name text;
  v_product uuid;
  v_fixed int := 0;
begin
  for v_line in
    select i.id, i.raw_text, i.name, r.household_id, r.original
    from public.recipe_ingredients i
    join public.recipes r on r.id = i.recipe_id
    join public.products p on p.id = i.product_id
    where p.household_id is not null and public.is_vague_name(p.name_en)
  loop
    -- What the import read for this line, when it was specific.
    select btrim(o ->> 'name_en') into v_name
    from jsonb_array_elements(case when jsonb_typeof(v_line.original -> 'ingredients') = 'array'
                                   then v_line.original -> 'ingredients' else '[]'::jsonb end) o
    where o ->> 'raw_text' = v_line.raw_text and btrim(coalesce(o ->> 'name_en', '')) <> '' and not public.is_vague_name(o ->> 'name_en')
    limit 1;
    -- Else the line itself; a line that says nothing more ("1 tbsp sauce") keeps its word.
    v_name := coalesce(v_name, public.ingredient_label(v_line.raw_text), v_line.name);
    v_name := upper(left(v_name, 1)) || substr(v_name, 2);

    select p.id into v_product
    from public.products p
    where (p.household_id = v_line.household_id or p.household_id is null)
      and not public.is_vague_name(p.name_en)
      and (lower(p.name_en) = lower(v_name)
           or exists (select 1 from public.product_aliases a where a.product_id = p.id and a.alias = lower(v_name)))
    order by p.household_id nulls last, lower(p.name_en) = lower(v_name) desc
    limit 1;

    update public.recipe_ingredients set name = v_name, product_id = v_product where id = v_line.id;
    v_fixed := v_fixed + 1;
  end loop;

  delete from public.product_aliases a
  using public.products p
  where p.id = a.product_id and p.household_id is not null
    and (public.is_vague_name(p.name_en) or public.is_vague_name(a.alias));

  return v_fixed;
end;
$$;
revoke execute on function public.repair_vague_products() from public, anon, authenticated;
grant execute on function public.repair_vague_products() to service_role;

select public.repair_vague_products();
