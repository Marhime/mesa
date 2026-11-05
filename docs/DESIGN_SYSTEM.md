# Mesa design system (built on Zician foundations)

Goal: clean, homogeneous, atomic. **Screens never style raw views**: they compose DS components
and read tokens. No literal colors, font sizes, spacings or radii outside `src/ds/tokens.ts`.

## Tokens (`src/ds/tokens.ts`)

### Color (light theme; dark theme mirrors Zician dark values)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| surface | #f3f1ea | #111016 | screen background |
| surfaceRaised | #ffffff | #1c1b23 | cards, lists, fields, tab bar, sheets |
| surfaceSunken | #ecebe4 | #0a090e | hollows, skeletons, tags |
| line | #dcdad0 | #34313f | hairline separators inside lists |
| lineStrong | #8a8796 | #6e6a7c | control borders (1.5) |
| ink | #16141f | #f4f2ec | text, primary button fill |
| inkMuted | #5c5968 | #aba7b8 | secondary text |
| onInk | = surface | = surface | text on primary button |
| select | #d4e86a | #d4e86a | selected / checked / active tab / "featured" card |
| selectSoft | #eef5c8 | #2b3016 | just-added flash, selected option background |
| onTint | #16141f | #16141f | text on lime and pastels (both themes) |
| onTintMuted | #4a4756 | #4a4756 | secondary text on pastels |
| success | #1a7340 | #6fd29a | "have", done (always with icon or word) |
| danger | #c02e45 | #ff8a97 | errors, destructive |
| dangerSoft | #fbe3e6 | #3d1820 | error banners |
| scrim | #16141f66 | #000000a6 | behind sheets |
| focus | #5334c7 | #a08bff | keyboard focus ring only |

Illustration colors (`art` in tokens.ts, same in both themes): the Zician pastels outlined in ink, for
FoodPicto, DishArt, the success seal and stickers only — never UI chrome.

Category pastels (same in both themes; **only** for food categories, never decoration):
produce `#ffc4a0` (coral), bakery `#fbe7a8` (butter), meat `#f7b3da` (pink), dairy `#cfe0fc` (sky),
frozen `#c9bcff` (lavender), cupboard `#fbe7a8`, drinks `#cfe0fc`, household `#c9bcff`, other = surfaceSunken.

### Space — only these: 4, 8, 12, 16, 20, 24, 32, 48
`space.xs=4, sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=32, huge=48`. Screen side margin = 20. Between sections = 32.

### Radius
`sm=10` (thumbnails), `md=16` (compact cards), `lg=24` (cards, list groups), `xl=32` (sheets, hero), `full=9999` (every control: buttons, chips, fields, tabs, checkboxes, avatars).

### Border
hairline 1 (separators in a list), control 1.5 (`lineStrong`, every control), strong 2 (selection, error).

### Elevation
Cards are flat (surfaceRaised on surface). Shadow only for floating things: tab bar, sheets, toasts.
`shadow.sm`: y1 r3 opacity .06 · `shadow.lg`: y8 r24 opacity .14.

### Type — closed scale, two weights (400 read, 600 act/name)
Fonts: **Urbanist** 600 for names and numbers, **Figtree** 400/600 for everything else
(`@expo-google-fonts/urbanist`, `@expo-google-fonts/figtree`).

| Variant | Font | Size/line | Use |
| --- | --- | --- | --- |
| display | Urbanist 600, -0.5 tracking | 34/40 | screen title (once) |
| title | Urbanist 600 | 24/30 | recipe name, sheet title |
| heading | Urbanist 600 | 18/24 | section titles, card names |
| bodyLg | Figtree 400 | 17/26 | grocery rows, long text |
| body | Figtree 400 | 15/22 | default text |
| label | Figtree 600 | 15/20 | buttons, chips, list titles |
| labelLg | Figtree 600 | 17/20 | large (56) buttons |
| caption | Figtree 400 | 13/18 | metadata, hints |
| captionStrong | Figtree 600 | 13/18 | statuses ("Have", "Today", "Just added") |
| micro | Figtree 400 | 12/16 | stat labels |
| microStrong | Figtree 600 | 12/16 | tab labels, recipe tags on grocery lines |
| sticker | Urbanist 600 | 12/16 | Sticker only |
| overline | Figtree 600, uppercase, 0.7 tracking | 12/16 | aisle labels |
| input | Figtree 400 | 16/22 | text inputs only |

### Motion
125 ms press, 250 ms small transitions, 375 ms sheets. Ease-out by default. Respect reduce motion.
`pop()` (500 ms, swing easing that overshoots a little) is for success moments only: the Cooked seal and stickers.

### Icons
`phosphor-react-native`, weight **bold**; sizes 16, 20 (default), 24 (tab bar, big buttons), 32 (empty states).
Active tab: `duotone`. Color inherits from text. Never emoji.

## Components (`src/ds/`)

Atoms: `Text` (variant, color, numberOfLines), `Icon`, `Button` (primary · secondary · ghost; md 48 / lg 56; fullWidth; loading; iconStart),
`IconButton` (44×44; surface · tint · ink · float), `Chip` (pill, selected → lime, optional icon),
`TextField` (pill 52 high, icon, clear button, multiline variant radius lg), `Checkbox` (round 24, Notes-like;
checked = ink fill + cream check), `Divider`, `Avatar`, `AvatarGroup`, `Badge` (ink dot or count), `CategoryDot`,
`Tag` (small pill on surfaceSunken), `Skeleton`, `Equalizer` (loading indicator: 3 bars, never a spinner).

Molecules: `Screen` (safe area, surface background, scroll, 20 side margin, bottom inset for tab bar),
`LargeTitle` (overline + display title + optional right action), `TopBar` (back chevron + title + actions),
`ListGroup` (surfaceRaised, radius lg, hairline separators) + `ListRow` (leading, title, subtitle, trailing, chevron, min 56 high),
`SectionHeader` (heading + action link or meta), `Stepper` (− value +), `SegmentedControl`, `Sheet` (bottom sheet modal with scrim),
`Toast` (ink pill at the bottom, optional action "Undo"), `EmptyState` (icon on a lime disc, title, text, action), `Banner` (warning/danger note).

Atoms added with the MVP design: `FoodPicto` (category as an outlined pictogram, 32 / 40), `Sticker` (tilted lime
label with an offset ink shadow, pops in), `SegmentBar` (count as pill segments: ingredients at home, pantry level),
`Meter` (thin freshness bar on a pastel card). `Tag` has a `sunken` and an `outline` (status) variant; `Meta` has tones.

Molecules added: `FieldButton` (looks like a field, opens another screen), `StatRow` (key numbers between hairlines),
`InlineNote` (quiet explanation, no box), `Rail` (horizontal cards, edge to edge, snapping), `ButtonRow`
(equal-width buttons), `ProgressNote` (equalizer + what is happening), `PlacementFields` (zone + keeps, shared by
put-away and pantry corrections). `Screen footerBar` puts two actions on a
raised bottom bar. `LargeTitle` = avatars + muted context line, display title, optional `aside` ("9 to buy").

Organisms: `TabBar` (floating pill, surfaceRaised, shadow lg, 16 from edges; every tab shows icon over label, the active one on lime),
`GroceryRow` (checkbox left, label bodyLg, quantity muted, recipe Tag, swipe left → "Already have"),
`AisleSection` (overline label with CategoryDot + ListGroup), `RecipeCard` (image 16:10, title heading, meta caption),
`QuickAddField` (TextField that parses multi-item input and shows what it understood),
`FoodRow` (picto, name, muted detail, trailing status or amount), `IngredientRow` (FoodRow + Have / To buy),
`IdeaCard` (Tonight's idea: lime card, dish, sticker, why, Cook tonight), `UseSoonCard` (pastel card with freshness),
`UpNextTile` (planned recipe, "All at home" / "1 to buy"), `PantryTile` (what is left, in quarters),
`PutAwaySheet` (Done shopping: by zone, date chips, inline zone / keeps editor; "Use the receipt instead"),
`AddPantrySheet` (type anything or tick basics by zone; day one pre-ticks staples; scan entries),
`PantryItemSheet` (level, zone, keeps; "Still there?" when past its date), `StaplesSheet` (always at home, ran out),
`ScanInbox` (scans being read / failed / ready), `ProposalSheet` (review a scan or receipt, tick, apply),
`RecipeHero` (photo + overlapping
rounded panel), `DishArt` (illustrated stand-in when a recipe has no photo), `SuccessBurst` (lime seal + check).

## Rules (from Zician, non-negotiable)

1. One primary (ink) button per screen. Secondary = outline pill. Tertiary = underlined text.
2. Lime means "selected / checked / active". Nothing decorative is lime.
3. Pastels only for categories.
4. Everything aligns to the 20 px margin. No inner padding on invisible backgrounds.
5. Controls are pills; containers use radius lg/xl; no sharp corners, no in-between radii.
6. Touch targets ≥ 44. Every icon-only button has an accessibility label.
7. Every screen has an empty state, a loading state (Skeleton / Equalizer) and an error state with a way out.
8. No toast that repeats what the screen already shows. Toasts confirm in-place actions or offer Undo.
9. Text: sentence case, short, verbs on buttons, no exclamation marks except success moments.
