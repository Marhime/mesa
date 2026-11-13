# Mesa design system

Goal: minimal, modern, calm. Neutral grays and a near-black ink carry the interface; color is kept for
food (category tints, illustrations) and for meaning (success, danger). Nothing borrowed from music apps:
the loader simmers, it doesn't play.

Clean, homogeneous, atomic. **Screens never style raw views**: they compose DS components and read
tokens. No literal colors, font sizes, spacings or radii outside `src/ds/tokens.ts`.

## Tokens (`src/ds/tokens.ts`)

### Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| surface | #f6f6f4 | #0e0e0e | screen background (also splash, `app.config.ts`) |
| surfaceRaised | #ffffff | #1a1a1a | cards, lists, fields, tab bar, sheets, Tonight's idea |
| surfaceSunken | #eeeeeb | #080808 | hollows, tags, empty-state discs, progress cards |
| line | #e2e2de | #2b2b2b | hairline separators, progress track |
| lineStrong | #9a9a95 | #5f5f5b | control borders (1.5) |
| ink | #161616 | #f2f2ef | text, primary button fill, progress fill |
| inkMuted | #6b6b67 | #a3a39d | secondary text |
| onInk | #ffffff | = surface | text on primary button |
| select | #161616 | #f2f2ef | selected chip / segment / active tab: selection is ink, not a color |
| selectSoft | #ebebe6 | #262624 | just-added flash, selected option background |
| onSelect | #ffffff | #121212 | text and icons on `select` |
| onTint | #161616 | #161616 | text on pastels and illustrations (both themes) |
| onTintMuted | #55554f | #55554f | secondary text on pastels |
| success | #2e7d4f | #6fcf97 | "have", done (always with icon or word) |
| danger | #c2392f | #ff8a80 | errors, destructive |
| dangerSoft | #fbe5e2 | #3a1714 | error banners, failed rows |
| scrim | #16161666 | #000000a6 | behind sheets |
| focus | #2f6fdb | #7aa7f5 | keyboard focus ring only |
| skeleton | #e6e6e2 | #262626 | loading placeholders (visible on surface and surfaceRaised) |
| floatEdge | transparent | #2b2b2b | hairline edge of floating chrome (tab bar, float buttons) where dark shadows vanish |

Illustration colors (`art` in tokens.ts, same in both themes): muted food tints outlined in ink —
sage, leaf, oat, butter, clay, brick, blush, mist, stone — for FoodPicto, DishArt, the success seal and stickers only, never UI
chrome. App icon: white "m·" on ink (`assets/images`).

Category tints (same in both themes; **only** for food categories, never decoration):
produce `#d5e2cc` (sage), bakery `#efe5cf` (oat), meat `#efd6d8` (blush), dairy `#d6e1ea` (mist),
frozen `#dde3ef` (frost), cupboard `#efe5cf`, drinks `#d6e1ea`, household `#dedbd5` (stone), other = surfaceSunken.

### Space — only these: 2, 4, 8, 12, 16, 20, 24, 32, 48
`space.xxs=2, xs=4, sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=32, huge=48`. Screen side margin = 20. Between sections = 32.
`xxs` is the tight step between a title and the line under it (a label and its caption, a tab icon and its label, a
tag's vertical padding): never written as `space.xs / 2` or a border width.

### Row insets (`rowInset`)
Where a list row's text starts, so the hairline between rows lines up with it (`ListGroup inset`): `row` 16 (text only),
`icon` 48 (after a 20 pt icon, or a GroceryRow's checkbox), `picto` 60 (after a FoodRow's picto: pantry, ingredients,
scan review, staples, put away), `avatar` 64 (members), `none` (rows led by a thumbnail: a creator's videos).

### Radius
`sm=10` (thumbnails), `md=16` (compact cards), `lg=24` (cards, list groups), `xl=32` (sheets, hero), `full=9999` (every control: buttons, chips, fields, tabs, checkboxes, avatars).

### Border
hairline 1 (separators in a list), control 1.5 (`lineStrong`, every control), strong 2 (selection, error).

### Elevation
Cards are flat (surfaceRaised on surface). Shadow only for floating things: tab bar (and the Mesa button above it), sheets, toasts.
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
| microStrong | Figtree 600 | 12/16 | tab labels, small tags |
| sticker | Urbanist 600 | 12/16 | Sticker only |
| overline | Figtree 600, uppercase, 0.7 tracking | 12/16 | aisle labels |
| input | Figtree 400 | 16/22 | text inputs only |

### Motion & feedback (`src/ds/motion.ts`, `haptics.ts`)
Fast and the same everywhere: the finger shows at once (`touch` 50 ms; letting go eases back in `press` 100 ms),
things arrive or move in `small` 200 ms and leave in `leave` 150 ms (leaving never keeps the next thing waiting, a
toast swiped away included), sheets spring open in 380 ms and close in `sheet` 200 ms (the next sheet comes up right
after). Ease-out by default. Respect reduce motion. `pop()` (400 ms, swing easing that overshoots a little) is for
success moments only: the Cooked seal and stickers. `markIn()` (`mark` 150 ms, from a touch smaller) is a mark
switching on (an ingredient's ✓), only on a change (`LayoutAnimationConfig skipEntering`). Loaders keep their own calm
pace (`pulse` 750 ms, `simmer` 1 s).

- **Nothing pops.** Things that come and go move: lists use the shared layout presets `enter()` / `exit()`
  (200 ms in, 150 ms out) and `reflow()` (neighbours slide into place, 200 ms). One way per kind of thing:
  rows of a `ListGroup` (always; the divider travels with its row), cards of a `Rail` (On the menu, Use soon, For you,
  creators, Cook again), sections and cards of an `AnimatedList` (the grocery aisles, the pantry's families, your
  imports, your scans). A `TipCard` fades away when dismissed; a section that comes and goes is wrapped in `Reveal`
  ("Still there?"). Footers and staggered success content use `Reveal` (`rise()` / `sink()`).
- **Nothing pops as it opens either.** What is there when a screen opens is just there: `Screen` skips the entering
  animations of its first render (`LayoutAnimationConfig skipEntering`), and so do a `ListGroup`, a `Rail` and an
  `AnimatedList` for the rows they open with (a sheet springs up with its rows in place). What arrives later (the list
  after its skeleton, a new row, a card) moves in. Only a `Reveal` with a `delay` (staggered success content: Cooked!)
  plays as the screen opens.
- **Nothing jumps.** A line that comes and goes under a field keeps its place: `QuickAddField` has one line under it,
  always there, that swaps in place between what it understood (chips), what was added (✓ · Undo) and its `idle`
  content (the Usual picks, or a hint). Skeletons are shaped like what loads (`ListSkeleton leading="check"` for
  groceries, `"picto"` for the pantry, ingredients and a scan's review; `RailSkeleton` for On the menu).
- **Springs** (`spring` tokens via `springTo()`): `sheet` (380 ms, no bounce: sheets opening and settling back after a
  drag), `indicator` (300 ms, damping 0.9: the ink pill sliding between tabs and segments, `useSlidingIndicator`).
- **Reduce motion** turns off movement, not information: `fade()` (opacity/colour only) keeps playing, so the
  "just added" glow, skeleton pulse and Simmer (bubbles glow in place) still show.
- **Settle** (`duration.settle`, 1.2 s, `useSettle`): a checked grocery row stays in place, struck through, then moves
  to the cart. Tapping again within that time cancels (Reminders). Long enough to catch a wrong tap, short enough to
  keep up in the store.
- **Sheets** drag down to close: by the handle and header, or by the content once it is scrolled to the top
  (`gesture.dismissFraction` 25 % of the height, or a flick faster than `gesture.dismissVelocity`); otherwise they
  spring back. Their height follows their content (`reflow()`). The scrim is hidden from VoiceOver; the scrub
  gesture closes.
- **Edit sheets never close by mistake** (iOS Calendar, Reminders): with `Sheet unsaved` (something typed or changed
  compared with what it opened with, not merely touched), the scrim, the ×, a drag and the scrub gesture keep it open
  and ask `confirmDiscard()`: the iOS action sheet "Discard changes?", **Keep editing** (cancel) · **Discard**
  (destructive, then it closes as before). A drag released past the threshold springs back into place first, then
  asks. Save / Done close it from outside and never ask; without changes nothing asks. A footer action that throws the
  work away asks the same way (ProposalSheet's "Discard"). Guarded: GroceryEditSheet
  (name, amount, aisle), IngredientSheet, ProposalSheet (other ticks or a fixed amount), AddPantrySheet (ticks
  changed, or words typed and not added), JoinKitchenSheet (a typed code), AddRecipeSheet (a link or text typed, not
  the one taken from the clipboard), CreatorSheet (picked videos), PantryItemSheet (only an amount that can't be read:
  a readable one is saved when it closes, and Done waits for a number).
- **Edit screens never close by mistake either**: a modal screen holding something typed (the recipe editor) calls
  `useUnsavedGuard(unsaved)`: its ×, the swipe down and any way back ask `confirmDiscard()` first; Save calls the
  `leave()` it returns before navigating, so that one never asks.
- **The keyboard never hides the way out.** Off the tabs, a `Screen footer` is the screen's submit: while one of its
  fields is typed in, the footer rides on the keyboard (an iOS input accessory, so the field typed in is scrolled
  clear of it too). On the tabs the footer stays put (Done shopping isn't the field's submit). A `Sheet` takes at most
  the room left between the status bar and the keyboard: its header and footer stay in view and the content scrolls;
  over the keyboard its footer sits just above it. Return moves on to the next field (sign-in: email → password).
- **Toasts** rise in and sink away; swipe them toward their edge to dismiss. `tone: 'error'` adds a warning glyph and
  the warning haptic. While a sheet is open, toasts show at the top of its modal (`ToastOutlet`). With VoiceOver on
  they stay `duration.toastA11y` (10 s), are announced in the queue, and magic tap (two-finger double tap) runs the
  action ("Undo").
- **The Mesa button** (`MesaButton`, just above the tab bar at its right end, on every tab) never moves: not as you
  scroll, not as you change tabs. ✦ and the Simmer of work in progress swap with a cross-fade in place. Screens,
  floating footers and toasts keep clear of it (`useTabBarSpace().occupied` includes it).
- **Leaving a modal screen for another screen** (the import's "Open recipe", a new recipe saved in the editor): close
  the modal, then `openAfterModal(open)` pushes the next screen once the sheet is down (`duration.modalExit`). Pushed
  while the sheet still leaves, it would be laid out in the shrunk app behind it, its header too low.
- **Scroll-linked chrome** (`useScreenScroll`): the recipe hero stretches when pulled down and drifts at
  `gesture.parallax` (half speed, off with reduce motion); a floating `TopBar` fills in with the surface, a hairline
  and the title as the hero leaves.
- **Haptics** come with the touch, never after the server answers, and are built into the controls: `Checkbox` and
  `CheckRow` give `check` as they turn on (unchecking is quiet), a selectable `Chip`, `Stepper` and `SegmentedControl`
  give `select`, a long press gives `select` (`Touchable`), and `Button`, `Chip` and `IconButton` take a `haptic` for
  what they do. `check`: checking, marking at home ("I have it", Already have), swipe actions snapping open. `add`:
  adding (to the list, the menu, Recipes, the pantry: Plan it, Save, Import, the usual picks, Ran out). `select`:
  selecting, favorite, Another idea, toast actions, long press. `success` (with the seal: Cooked!, Done shopping
  confirmed), `warning` (error toasts: every toast that says something failed has `tone: 'error'`). Tab switches are
  silent, like iOS. Screens don't call `haptics` for a tap; only for what has no tap (screenshots picked, a share
  received).

### Icons
`phosphor-react-native`, weight **bold**; sizes 16, 20 (default), 24 (tab bar, big buttons), 32 (empty states).
Active tab: `duotone`. Color inherits from text. Never emoji.

One glyph per meaning, and one meaning per glyph (`atoms/icons.ts` says which):
`recipes` (book) recipes, their tab, opening one · `store` (storefront) groceries, to buy, on your list · `list` the
pantry · `home` the Home tab · `plan` (calendar +) on the menu: Plan it, Plan my week · `calendar` a date (keeps until)
· `clock` minutes · `checkCircle` at home (an ingredient's ✓, "All at home", Already have, I have it) · `check` done,
added, saved, selected · `receipt` a receipt · `close` close, hide, clear · `sparkle` Mesa · `cook` Cooked!.

## Components (`src/ds/`)

Atoms: `Text` (variant, color, numberOfLines), `Icon`, `Button` (primary · secondary · ghost; md 48 / lg 56; fullWidth; loading; iconStart),
`IconButton` (44×44; surface · ink · float · plain; `haptic`), `Chip` (pill, selected → ink with white text, optional icon;
the label takes a second line where the row is too narrow; `haptic` when it acts rather than selects), `Button` labels
take a second line rather than being cut,
`TextField` (pill 52 high, icon, clear button, multiline variant radius lg; `TextFieldRef` to move the focus), `Checkbox`
(round 24, Notes-like; checked = ink fill + check; `check` haptic as it turns on), `Divider` (`rowInset`), `Avatar`, `AvatarGroup`, `Badge` (ink dot or count), `CategoryDot`,
`Tag` (small pill on surfaceSunken), `Skeleton`, `Simmer` (loading indicator: 3 bubbles rising like a simmering pot, never a spinner).

Molecules: `Screen` (safe area, surface background, scroll, 20 side margin, bottom inset for tab bar; `modal` for a
screen presented as a sheet (import, editor: `ModalBar`, × top right); its `footer` rides on the keyboard off the tabs),
`LargeTitle` (overline + display title + optional right action), `TopBar` (back chevron + title + actions, pushed screens;
a modal screen has a `ModalBar`, × on the right),
`ListGroup` (surfaceRaised, radius lg, hairline separators at `inset`; `tone` sunken inside sheets, which its rows take
their press highlight from: rows never repeat it) + `ListRow` (leading, title, subtitle, trailing, chevron, min 56 high),
`CheckRow` (a row that is one checkbox: tap anywhere, the box at the end, `check` haptic, or a `done` tag when it can't be
picked; a planned dinner, a creator's video), `AnimatedList` (keyed sections or cards with a gap that come and go like
rows), `DismissButton` (the × that hides a card, see Buttons),
`SectionHeader` (heading + action link or meta), `Stepper` (− value +), `QuantityField` + `useQuantityDraft` (a number and its unit chips; grocery edit, pantry item, scan review), `SegmentedControl`, `Sheet` (bottom sheet modal with scrim; `action` puts one small control beside the title, before the ×: the creator sheet's Follow chip; `unsaved` while closing would lose something typed or changed: every way out asks `confirmDiscard()` first, see Motion),
Toasts (`useToast()`: ink pill at the bottom, optional action "Undo", `tone: 'error'`), `EmptyState` (icon on a sunken disc,
or `art` such as the small SuccessBurst for "All put away"; `size: 'section'` for a quiet left-aligned note inside a
section, its action full width: On the menu, Settings, no ingredients), `ErrorState` (the same, with Try again; `size`
too), `ListSkeleton` (`leading` check / picto, `tone`), `RailSkeleton` (tiles), `Banner` (warning/danger note),
`Reveal` (content that rises in and sinks away; `delay` for staggered success screens).

Atoms added with the MVP design: `FoodPicto` (the food itself as an outlined sticker in its own color, 32 / 40; ~50 drawings as data in `atoms/pictos/*` (SVG with INK / PAPER / TINT / ACCENT names, never hex), one per product via `products.picto`, a category fallback for household products; review them with `npx tsx scripts/render-pictos.ts <file> <out.png>`), `Sticker` (tilted sage
label with an offset ink shadow, pops in), `Meter` (thin freshness bar on a pastel card), `PlayDisc` (the small raised play disc centered over a video thumbnail; the
thumbnail is what plays). `Tag` has a `sunken`, an `outline` (status) and an `ink` variant (something new, like a count
`Badge`: "2 new" on a creator); `Meta` has tones.

Molecules added: `FieldButton` (looks like a field, opens another screen), `StatRow` (key numbers between hairlines),
`InlineNote` (quiet explanation, no box), `Rail` (horizontal cards, edge to edge, as tall as the tallest; `itemWidth` snaps
card by card; cards come and go smoothly), `ButtonRow` (equal-width buttons, the main one last; with large Dynamic Type,
`stackFontScale`, they stack, the main one on top), `ProgressNote` (simmering bubbles + what is happening; `canLeave` adds the quiet line "You can leave: we'll tell you when it's ready." under it, for work that goes on without the screen), `StageProgress` (a long job in steps: label, "2 of 4", a bar driven by the real step that eases forward inside it), `TipCard` (one-time explanation until "Got it"; fades away), `PlacementFields` (zone + keeps, shared by
put-away and pantry corrections), `SuggestionCard` (a dish Mesa suggests, not a saved recipe: sunken card with title,
minutes, why, short facts such as "Uses tomato and crema" / "To buy onion", one secondary action), `WishPicker` (what you
ask Mesa for: chips to tick, as many as you like, and a field for anything else; Plan my week). `Screen footerBar` puts two actions on a
raised bottom bar. `LargeTitle` = avatars + muted context line, display title, optional `aside` ("9 to buy").
`CreatorLink` (who made a recipe, under its title: avatar + "More from Food is Love" + chevron, opening their latest recipes;
or only a credit, "By Food is Love", when there is nothing to list; a play glyph when the source names no one).
`MesaButton` (Mesa on every tab, just above the tab bar at its right end (`TabBar accessory`): a small round raised
button, `size.tabAccessory`, that stays put. Idle: sparkle, opens Ask Mesa. While something you asked is working: Simmer
in its place, a tap opens it ("Looking at Food is Love's recipes…", "Ideas for tomato…" is its VoiceOver label, with
"And 1 more."); a long press, or VoiceOver's actions, offers Ask Mesa and Stop (deletes the job and says "Cancelled")),
`Composer` (where a message is written, at the bottom of a conversation: a `TextField grow` + an ink send IconButton
beside its last line; Return sends; `above` puts a chip over the field's left edge).

Organisms: `TabBar` (floating pill, surfaceRaised, shadow lg + `floatEdge` hairline, 16 from edges; every tab shows icon over label,
the ink pill slides to the active one; `accessory` floats 8 above it, at its right end: the Mesa button),
`GroceryRow` (checkbox left, label bodyLg, how much to buy on the right in label + tabular ("2 + 500 g" when recipes asked in two units; kitchen spoons left out); the recipes it is for are in the edit sheet ("On the menu") and the VoiceOver hint, not on the row; tap anywhere to check (settles, then moves to the cart),
long press to edit, swipe left → Edit · Already have · Delete),
`AisleSection` (overline label with CategoryDot + ListGroup), `RecipeCard` (image 16:10, title heading, meta caption),
`QuickAddField` (TextField that parses multi-item input; one line under it, always there, shows what it understood as
chips, then "Added milk to Dairy · Undo", else `idle`: the Usual picks on Groceries, a hint elsewhere),
`FoodRow` (picto, name, muted detail, trailing status or amount; `amount` puts an ingredient's amount in a column before
the name (`size.amountColumn`), the name then in body), `IngredientRow` (one line like a cookbook: picto, "1½ tbsp",
"Fish sauce", and a mark in one column at the end: a filled green check when at home, an empty circle when not (an
IconButton "I have …" when it can be marked at home); optional, use soon or a guessed amount ("≈ 375 g") add a muted
line; tap the row to change its name or amount), `IngredientList` (a recipe's ingredients: one ListGroup of
IngredientRows, or, when the recipe has sections ("Marinade", "Sauce", "Noodles"), one `AisleSection` per section with
its overline heading, like the aisles; lines before the first heading sit in a ListGroup without one),
`IdeaCard` (Tonight's idea: white card, dish, sticker, why, Cook tonight, Another idea, Plan it (the `plan` glyph)), `UseSoonCard` (pastel card with freshness),
`UpNextTile` (a recipe On the menu, "All at home" / "1 to buy"), `PantryList` (the pantry by type of food: one overline section per family, "Vegetables · 4", FoodRow with how much is left on the right: "6", "500 g", "Plenty", "About half", "Running low" in red; no level bars, no places),
`PutAwaySheet` (Done shopping: what you bought with how long it keeps; tap a line for its keeps step, whose Done goes
back (the × closes the sheet as always); "Use the receipt instead"),
`AddPantrySheet` (type anything or tick basics; day one pre-ticks staples; film a shelf: Fridge / Freezer / Cupboard chips, scan a receipt),
`PantryItemSheet` (Amount field in pcs / g / ml by the product's unit family, then "Or roughly" Plenty / Half / Low, keeps;
footer Done · "Ran out" (out of the pantry, back on the list); "Still there?" when past its date: Still good · It's
gone), `StaplesSheet` (always at home: "Ran out" · "I have it"),
`ScanInbox` (scans uploading / being read / failed with "Film again" (none after Mesa's daily limit) / ready to Review:
the same ImportRow cards as your shares), `ProposalSheet` (review a scan or receipt, tick, "Update pantry (n)"; a ListSkeleton while it loads; Discard asks
when ticks or amounts changed),
`ImportRow` + `ImportList` (one inbox card for shares and scans: StageProgress (or a simmer) while working, a ready card
with Open recipe / Review, the ways out when failed; the × hides a ready card or removes a failed one),
`InviteSheet` (the kitchen's invite code, big, in two groups of five ("ABCDE-FGHJK"), with Share code; a new code
replaces the one shared before), `JoinKitchenSheet` (move to another kitchen with its invite code: the field shows it in
two groups of five, a pasted message works; a code that opens nothing says "That code didn't work…" and the sheet stays),
`UseItUpSheet` (a Use soon card, Pantry and Home: "Ideas for tomato"; ProgressNote "Thinking of dishes with tomato…" (`canLeave`) while
Mesa thinks, then up to 3 SuggestionCards with "Find a video" (a YouTube search); failed → the worker's words and
Try again; always the note "Ideas, not recipes yet…" and a row "Your recipes with tomato" to the filtered Recipes),
`RecipeSteps` (the Steps section: SectionHeader with "Read in Español" / "Show original" when the recipe is in another
language than the phone, ProgressNote "Translating…" (`canLeave`) while it works, then the StepRows), `StepRow` (number on a sunken
disc, text bodyLg; when the step's moment in the YouTube video is known, a play Chip "2:14" under it that opens the video there),
`CreatorSheet` (a creator's latest recipe videos: title = their name + Follow / Following chip (`Sheet action`); while
Mesa lists them, ProgressNote "Looking at Food is Love's latest recipes…" (`canLeave`); then "Pick up to 10 to save." and CreatorVideoRows
in a sunken ListGroup; footer "Import 3" (primary, disabled at 0, at most 10 at once: the other rows dim; why imports
couldn't start in a Banner under the list); failed or
empty → the worker's words and Try again. Opened from a recipe ("More from …"), Your creators, a pasted / shared YouTube
channel or playlist link instead of a recipe import, or the working pill, a toast or a notification),
`CreatorVideoRow` (16:9 thumbnail (`RecipeCover shape="video"`, `size.videoThumb`) with a play disc that opens the video in
the in-app browser (also a VoiceOver action); title, the dish with a bowl Meta when the title says something else, "68k
views · 9 min"; a `CheckRow`: tap the rest to tick it; already in Recipes → an outline Tag "Saved" instead),
`CreatorRail` ("Your creators" in Recipes when the household follows anyone: one raised pill per creator, avatar + name,
and an ink Tag "2 new" when they posted recipe videos nobody has looked at; `size.creatorPill` at most; a tap opens their
CreatorSheet, which makes them no longer new),
`VideoCard` (a recipe video, the same card everywhere: `size.videoCard` wide, for a Rail (cards as tall as the tallest, Save
lined up at the bottom); 16:9 thumbnail (`RecipeCover shape="videoCard"`) with a PlayDisc (Watch, in-app browser), title,
"Food is Love · 9 min", the why on a sparkle line when Mesa picked it, a full-width secondary "Save" (add haptic) that starts
one import (its "Saving" row shows in the imports list), "Saved" with a check once in Recipes; optional float × in the
thumbnail's corner, the `DismissButton` of every card ("Not for us", "Not now"); the thumbnail scales when pressed;
`tone` raised on a screen · sunken in a sheet),
`CreatorNewsRail` ("New from your creators" in Recipes, only while there are some: a Rail of VideoCards with × "Not now",
newest first, at most 10; cards fade out when saved or dismissed), `ForYouRail` ("For you this week" in Recipes:
SectionHeader "Picked from what you cook" + a Rail of VideoCards with their why and × "Not for us", at most 5; cards fade
out when saved or dismissed; nothing when empty, or the InlineNote "Your first suggestions arrive on Monday." while the
first weekly look hasn't come and there are 3 recipes or more),
`AskMesaView` ("Ask Mesa", the one assistant, on its own screen `app/ask.tsx`: it rises from the bottom and only its ×
closes it (no swipe, no scrim). `ModalBar` with the title and a "New" chip (a new conversation) before the ×. Before the
first question, one muted line and three starters from the kitchen (the food to use first, what's on the menu or "Plan
our dinners this week", a followed creator; about a recipe: "Anything about Tinga: swaps, servings, timing." and its own
three) sit at the bottom, just over the field. Then the conversation, oldest first, kept in view as it grows. The
`Composer` stays at the bottom over the keyboard: the "About Tinga" chip (selected, ×: ask about the whole kitchen) over
the field ("Ask Mesa…", or "No cream? For 2? Make it ahead?" about a recipe). Toasts show at its top while it is on
screen), `AskTurn` (one question and its answer: your words on a sunken bubble on the right, ProgressNote "Thinking…"
(`canLeave`) until the first words, then the answer as Mesa writes it (bodyLg, Simmer under it), then the answer, the
recipes it means as a Rail of RecipeCards (its why as the card's caption) and its actions as a row of chips (store: add
to the list, plan: plan it or plan my week, recipes: open; `add` haptic at the touch for adding; done or under way: a
passive chip, check when done),
"Added to your list" / "On the menu" with a check once done; failed → a Banner with the words and "Try again"; then
AskVideos when the answer looks for videos), `AskVideos` (the videos an answer looks for, started without a tap:
ProgressNote "Looking for videos…" (`canLeave`) → a Rail of sunken VideoCards, each with why; nothing found → a Banner with
the worker's words and "Try again"),
`RecipeRail` (a titled Rail of RecipeCards, `size.recipeRailCard` wide; nothing when empty: "Cook again" on Home),
`WeekPlanSheet` (Plan my week: WishPicker, "Suggest dinners" → ProgressNote "Planning your week…" (`canLeave`) → the week's
note and `PlanDinnerRow`s in a sunken ListGroup, all ticked; footer "Plan 4 dinners" + ghost "Change wishes", why adding
stopped in a Banner under the list; failed → the worker's words, Try again, ghost "Change wishes"), `PlanDinnerRow` (a `CheckRow`: day overline, the recipe, why, "Uses cream and avocado" with the
at-home glyph, checkbox on the right; already On the menu → an outline Tag "On the menu"),
`RecipeHero` (photo + overlapping
rounded panel), `RecipeCover` (photo or stand-in: card · hero · banner · tile · thumb · video · videoCard), `DishArt` (illustrated stand-in when a recipe has no photo), `SuccessBurst` (sage seal + check).

## Rules (non-negotiable)

1. One primary (ink) button per screen. Secondary = outline pill. Tertiary = underlined text.
2. Selection is ink (black on light, white on dark): "selected / checked / active". Color never decorates chrome.
3. Pastels only for categories.
4. Everything aligns to the 20 px margin. No inner padding on invisible backgrounds.
5. Controls are pills; containers use radius lg/xl; no sharp corners, no in-between radii.
6. Touch targets ≥ 44. Every icon-only button has an accessibility label.
7. Every screen has an empty state, a loading state (Skeleton / Simmer) and an error state with a way out.
8. No toast that repeats what the screen already shows. Toasts confirm in-place actions or offer Undo.
9. Text: sentence case, short, verbs on buttons, no exclamation marks except success moments.
10. One word per meaning, everywhere: **Plan it** / **Plan 4 dinners** (put on the menu; the place is "On the menu";
    asking Mesa for dinners is **Suggest dinners**), **Add to groceries** (on the list), **I have it** (at home now;
    a grocery line's swipe says Already have), **Ran out** (out of the pantry and back on the list), **Got it** (only a
    tip's: read, hide it), **Saving…** (an import on its way), **Change wishes** (back to a plan's wishes).

## Buttons: where they go

- A sheet's or modal screen's main action (Save, Import, Try again, a failed import's ways out) lives in its
  `footer`: `size="lg"`, `fullWidth`; quieter ones are ghosts stacked under it, full width too (Already have, Delete;
  Done), never side by side. The body only explains: a failure's `Banner` sits in the body, by what it is about, never
  in the footer.
- **Steps in a sheet**: the × always closes the whole sheet; going back a step is in the footer (a ghost "Back", or
  the step's own Done when the step only edits, PutAwaySheet's keeps).
- A lone action inside a screen section, a card or a list row is `fullWidth` too; quieter ones under it are
  `variant="ghost"`, also `fullWidth`. Never a small button stuck to the left edge.
- Only text-link actions next to something ("View original" beside the source, a tip's "Got it") and the
  centered action of a screen-size `EmptyState` keep their natural width; a section-size one's is full width.
- **Hiding a card** is one ×, the same everywhere (`DismissButton`: float disc at the card's top right): a ready
  import (seen), a failed import or scan (removed), a suggested video (Not for us, Not now). Never a "Dismiss" button.
- **Taking something out of the pantry** is a footer action of its sheet ("Ran out", "It's gone"), never a segment
  or a chip among its settings, and it offers Undo.
- Ask Mesa's bottom is its composer (the question field), so a failed answer or search says "Try again" in its
  own `Banner`, right where it failed. Everywhere else the way out is the footer's.
- **No Try again that can only fail the same way**: after Mesa's daily reading limit (error code `aiDailyLimit`, "Mesa
  has read a lot today. Try again tomorrow.") a failed import, scan, sheet or answer shows the words only; it is
  dismissed (the ×, Done). Try again is only ever offered on a failed job.
- **Add** is the same everywhere: the ink + at the end of each tab's `LargeTitle` (Home: a menu "Add a recipe", "Add to
  groceries", "Add to the pantry"; Recipes: the add sheet; Pantry: stocking; Groceries: the field, keyboard up). The bottom
  of the tabs belongs to Mesa (the Mesa button): no other action goes there.
- **More** (a ⋯ IconButton) opens `showActions`, the iOS action sheet: a few actions, Cancel last, destructive in red.
  The recipe's top bar is ♡ and ⋯ (Share, Edit recipe).

`IngredientSheet` (recipe screen): tap an ingredient to change its name or amount (kitchen measures:
`RECIPE_EDIT_UNITS`), "Add ingredient" under the list, "Remove from recipe". The pencil still opens the whole editor.

## Home: the order of things

What's for dinner? (date, the household's avatars → Settings, the + menu); the welcome tip; "Stock your pantry" while it
is empty; Tonight's idea; the imports list; On the menu (+ "Plan my week"); Use soon; Cook again. The evening's order:
what to cook tonight first, then what is planned, then what needs using.

## The recipe screen

The hero, then source, title, who made it and an "Ask about this recipe" chip (sparkle); the stats. The ingredients
section carries how many it is for (the Servings stepper beside "Ingredients") and one muted line under it ("The
original serves 4; amounts are adjusted." and "You have 9 of 17 ingredients…": a product counts once, however many
sections use it, like planning and Ideas), right where the amounts are; then the `IngredientList` (one `IngredientRow`
per line, each with its own mark, by section when the recipe has them) and the steps. In the editor, a heading line starts a
section ("Sauce:", "[Sauce]", "## Sauce", "**Sauce**"); the editor shows each section as "Sauce:". Redo ingredients
finds the parts of a recipe saved without any. Plan it · Cooked! in the footer bar. The ⋯ menu: Share, Edit recipe,
**Redo ingredients** (Mesa reads the ingredient lines again, one by one, as the editor shows them, with today's naming
and matching rules: a `reread` job; "Reading the ingredients again, line by line…" over the list while it works, then the
list refreshes in place with the toast "Bún Bò Huế's ingredients are up to date"; elsewhere the Mesa button and a toast ·
Open).

## Recipes: the order of things

Title and search (Ask Mesa is the Mesa button, on every tab); the share tip; For you this week; Your creators; the imports
list; New from your creators; then the All / Favorites chips right above the grid they filter. Searching (or a "Uses
tomato" filter) hides For you and the two creator sections; the Favorites chip does not, so the chips never jump under the
finger. Favorites come first in the grid, then newest first.

## Favorites

The heart (recipe screen, `select` haptic) is the only way to make one. Favorites then show up on their own:
first in Recipes; a clear lead in Tonight's idea (a favorite counts as needing two fewer things to buy, so what is at
home and what goes soon still decide; "One of your favorites." when nothing else explains it); "Cook again" on Home
(favorites not cooked in the last 14 days, the longest ago first, then the never cooked; at most 6; hidden when empty).
The first heart set on a phone says so once: the toast "Saved to Favorites · You'll see it in Cook again" (`TIP.cookAgain`).

## Plan my week

"Plan my week" (a FieldButton under On the menu on Home, once there are 2 recipes) opens the WeekPlanSheet; so does an
Ask Mesa answer's "Plan my week" button (its label in the question's language), with the answer's wishes filled in (the
chips they name ticked, the rest in the field; you still tap Suggest dinners). Wishes are
chips (Quick on weekdays, Use what's at home, Something new, Vegetarian) and a field; none means any week. Mesa answers
with dinners among your own recipes (a `plan` job): the day when it matters, why, what it uses up, one line for the week.
All come ticked: Mesa proposes, you untick. "Plan 4 dinners" plans them one by one like Plan it (each fills the list);
if one fails it stops and says which ("Added 2 of 4. Couldn't add Tinga: …"), the ones added show "On the menu", so trying
again adds the rest. Done: the sheet closes, toast "4 dinners on the menu · list updated" ("· all at home" when nothing was
missing).

## Ask about this recipe

"Ask about this recipe" (a chip with the sparkle, under the recipe's title and who made it) opens Ask Mesa about it: a
new conversation (unless Mesa is still answering the last one), the "About Tinga" chip over the field, examples "Make it
with what we have", "Make it for 2", "Can I make it ahead?". Its questions send the recipe (`subject_id`); × on the chip
asks about the whole kitchen again. Mesa only answers and proposes (add to the list, plan it): the recipe itself changes
only in the editor. A push for such a question opens Ask Mesa on it, chip included, not the recipe.

## For you, Ask Mesa

- **For you this week** (Recipes): every Monday Mesa looks for real recipe videos that fit the household (a background
  `for_you` job: no pill, no toast, no push) and keeps them in `suggestions` for 8 days. The rail shows the new ones not
  expired and not already in Recipes, this week's first then the best fits, at most 5, on both phones at once (live sync).
  Save starts one import (its "Saving" row shows in the imports list) and the suggestion is saved; × is "Not for us"
  (dismissed, toast "Fewer like this", no Undo: it only teaches); the thumbnail plays it in the in-app browser.
- **Ask Mesa**, the one assistant (the Mesa button on every tab, and the recipe screen's "Ask about this recipe"): a
  question → an `ask` job answered from the household's recipes, pantry and list (and the recipe, when about one). A
  question never waits behind an import (the worker keeps a quick lane) and its answer shows as Mesa writes it
  (`import_jobs.draft`, straight from live sync). Follow-up questions send the last 6 answered turns
  (`input_context`). This phone keeps the conversation (askMemory.ts): closing the app doesn't lose it; after a day
  without a question it starts afresh; "New" clears it. Answers only propose: "Add to the list" (toast with Undo, like
  the grocery field), "Plan it" (toast "On the menu · 2 items on your list" · Undo), "Open" a recipe (it comes over the
  conversation and Back returns to it; asked from that recipe, Ask goes back down to it), "Plan my week" (the
  WeekPlanSheet over the conversation, with its wishes). When someone wants new recipes, the answer says `find`: the app starts a `find` job at once, no tap,
  and its videos show under that answer (AskVideos: up to 5, each with why; Save imports one and its card says "Saved",
  Watch first; nothing found → the worker's words and Try again). Recipes and actions that point to a recipe the
  household no longer has are left out. The Mesa button simmers (VoiceOver: "Thinking…" / "Looking for videos…"); the toasts "Mesa answered",
  "Videos for spicy chicken are ready"; both open Ask Mesa (a search from outside the conversation shows as its own
  turn).

## Work Mesa does on its own

A creator's videos, ideas for a food, a translation, a week plan, Ask Mesa and the videos it looks for take from seconds
to minutes. Nobody waits for them:

- The sheet or screen says so while it works (`ProgressNote canLeave`) and can be left; the job keeps going (no
  "taking too long": the worker fails a job itself, and the sheet then shows its words and Try again).
- Leaving while it works is the moment to ask for notifications (`askForPushOnce`), like after a first scan.
- On every tab, the Mesa button above the tab bar simmers while one is still working; a tap reopens the latest
  (its sheet, Ask Mesa for a question or a search, or the recipe); its long press offers Stop (the job is deleted: no
  push) with the toast "Cancelled".
- When one lands with the app open: a toast "Ideas for tomato are ready" · Open (a success haptic), or "Couldn't find
  ideas for tomato" · See why, unless its sheet (or that recipe) is already on screen. Closed or in the background: a push,
  whose tap opens the same place.
- Once a day Mesa looks at the creators the household follows (nobody asked: no pill, no toast, no push). Recipe videos
  it hadn't seen are new: "2 new" on their pill in Your creators and a card in New from your creators, on both phones at
  once (live sync). Opening that creator's sheet, Save or × ("Not now") makes them no longer new; a video already in
  Recipes never shows.
- Once a week (Monday) For you fills itself the same way: nobody asked, so no pill, no toast, no push.
- The creator, ideas and week plan sheets and the Ask Mesa conversation exist once for the app (`AskSheetsProvider` in
  `app/_layout.tsx`; the Ask screen reads its conversation with `useAskMesaScreen()`): screens open them with
  `useAskSheets()` (`openCreator`, `openIdeas`, `openWeekPlan`, `openAsk`, `openAskAbout`), the Mesa button, toasts and
  notifications by job with `openJob(kind, jobId)` (a search opens Ask Mesa). What each kind of job says and where it
  opens is one entry in `src/data/askKinds.ts`: a new kind is one entry there. They start afresh with each kitchen.
  The Mesa button simmers meanwhile (VoiceOver: "Planning your week…", "Thinking…", "Looking for videos…").
  They are drawn at the root, or by a modal screen's own outlet while it is up (`useAskSheetsOutlet`, the shared-link screen).
  Only one comes up at a time: opening one lets any other slide away first.
