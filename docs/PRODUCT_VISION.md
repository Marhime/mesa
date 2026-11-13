# Product Vision

> **Your kitchen, understood.**  
> A calmer, more thoughtful way to manage everyday cooking.

## 1. Vision

Build an intelligent system that understands and helps organize a household's culinary life.

The product should gradually understand what a household owns, enjoys eating, cooks, needs to buy, and wants to discover.

It should quietly take care of the coordination between recipes, inventory, shopping, and cooking, so people spend less time managing food and more time enjoying it.

The long-term ambition is not simply to build another recipe manager, grocery list, pantry tracker, or meal planner.

**It is to rethink how people interact with their kitchen.**

## 2. Product Promise

**Serenity through discreet intelligence.**

The product reduces the mental load of everyday cooking by anticipating needs and simplifying logistics without demanding constant attention.

The emotional outcome is serenity:

- I don't have to remember everything in the fridge.
- I don't have to rebuild the shopping list from scratch.
- I don't lose recipes I discover.
- I don't always have to figure out what to cook.
- I can still discover new things and enjoy cooking.

## 3. Product Identity

The product combines three dimensions:

### The Engine — An Intelligent Kitchen System

It connects recipes, ingredients, inventory, shopping, and household habits. It automates coordination and anticipates needs.

### The Soul — Personal Culinary Culture

It gives people a living library of recipes, discoveries, collections, and inspiration that grows with them.

### The Emotional Promise — Serenity

It makes everyday life feel lighter, calmer, and more effortless.

The intelligent system is the foundation. Culinary discovery gives the product warmth and personality.

## 4. AI Philosophy

AI is a core capability of the product, not a chatbot added on top.

It should act as the product's discreet intelligence: understanding context, organizing information, anticipating needs, and helping people make decisions.

### Three Levels of Intelligence

**1. Passive Intelligence**

- Understand recipes, ingredients, inventory, and household patterns.
- Keep information organized and up to date.
- Surface relevant information when the user opens the app.
- Identify opportunities to reduce waste and simplify planning.

**2. Assistive Intelligence**

- Extract and structure recipes from links, photos, screenshots, and shared content.
- Interpret receipts and help update inventory.
- Find recipes based on available ingredients and preferences.
- Calculate missing ingredients and prepare shopping lists.
- Adapt quantities and suggest substitutions.
- Help users make decisions with relevant context.

**3. Conversational Intelligence**

- Support natural language and, over time, voice interactions.
- Examples:
  - "What can we cook tonight?"
  - "Add milk, eggs, and coffee to the shopping list."
  - "Find something to make with these courgettes."
  - "We have friends coming over on Saturday. Suggest a menu."
- Allow people to interact by text, voice, and images through the same underlying intelligence.

The initial experience does not need to be conversation-first. AI should be integrated throughout the product, with conversational interaction available when it provides genuine value.

### AI Guardrails

- Be proactive, never pushy.
- Do not pretend to know what is in the kitchen when the information is uncertain.
- Distinguish known facts from estimates and assumptions.
- Do not silently make consequential changes.
- Prepare actions and recommendations; let users confirm important decisions.
- Make it easy to correct incorrect assumptions.
- Avoid premature conclusions about household preferences.
- Encourage discovery rather than trapping users in past habits.

## 5. Experience Principles

### Discreet, Proactive Intelligence

The product should anticipate needs mainly through the experience itself. Notifications should be rare, timely, and genuinely useful.

### Simple by Default

Show essential information first. Keep complexity behind the scenes and reveal detail when needed.

### Low Maintenance

The product must not become another household chore.

Prefer automation, approximate quantities, quick confirmations, and easy corrections over meticulous manual tracking.

### Context-Aware

Recommendations should consider:

- Available ingredients.
- Expiry dates.
- Saved recipes.
- Household preferences.
- Recent meals.
- Shopping needs.
- Variety and culinary discovery.

### Human in Control

The product guides without taking over. Users remain in control of meaningful decisions and can correct the system.

### Calm and Editorial

The brand and interface should feel premium, warm, minimal, and editorial.

Avoid the aesthetics of a supermarket, calorie tracker, or technical AI dashboard.

## 6. Core Product Loop

The product connects the full everyday cooking cycle:

1. **Discover or save a recipe** from a website, social platform, video, photo, screenshot, or personal creation.
2. **Structure and organize it** into a personal recipe library.
3. **Understand what is available** across fridge, freezer, and pantry.
4. **Prepare shopping needs** by combining recipe ingredients, household essentials, and recurring products, while subtracting what is already available.
5. **Confirm what was actually purchased** and update inventory accordingly.
6. **Cook** with a simple completion action and adjustable servings.
7. **Update the household context** so future recommendations and shopping suggestions become more relevant.

This connected loop is a central source of product value.

A saved recipe should be actionable: it can influence shopping, be cooked, and update the inventory.

## 7. Core Product Capabilities

### Personal Recipe Library

- Create and edit recipes manually.
- Import recipes from websites and, where technically feasible, Instagram, YouTube, TikTok, and other sources.
- Support sharing a link, pasting a URL, or importing from a photo or screenshot.
- Extract structured fields where possible:
  - Title
  - Ingredients
  - Quantities and units
  - Instructions
  - Servings
  - Preparation time
  - Image
  - Source URL
- Preserve the original source.
- Distinguish the original recipe from the user's editable version and personal modifications.
- Do not promise perfect extraction from every platform or media source.

### Household Inventory

- Organize ingredients across fridge, freezer, and pantry.
- Support approximate quantities rather than obsessive weighing or counting.
- Track expiry dates when known and highlight ingredients to use soon.
- Update inventory after confirmed shopping and cooking.
- Allow quick manual corrections.
- Never require perfect inventory accuracy before the app remains useful.

### Intelligent Shopping List

- Combine ingredients from selected recipes, household essentials, and recurring products.
- Consolidate duplicates and quantities.
- Subtract ingredients already available.
- Support categories, manual additions, and favorites.
- Support a global shopping-completed action with exceptions.
- Support individual item checkboxes.
- Support receipt-photo extraction to prefill actual purchases.
- Let users correct extracted purchases before confirmation.
- Only items actually purchased should update inventory.
- Unpurchased items remain pending.

### Cooking Flow

- Make recipe completion simple, ideally with one clear "Cooked!" action.
- Deduct ingredient quantities based on the selected number of servings.
- Default to three servings, while allowing users to change it.
- Do not block cooking because inventory is incomplete; people adapt recipes in real life.
- Make it easy to correct stock afterwards.

### Discovery and Suggestions

- Offer suggestions based on available stock, ingredients nearing expiry, household preferences, variety, and recent meals.
- Explain why a recipe is recommended.
- Balance familiar choices with new discoveries.
- Avoid becoming a nutrition-coaching product.
- Meal planning can exist as an optional capability, never a mandatory workflow.

### Shared Household

- Individual accounts can belong to a shared household.
- Recipes, inventory, shopping lists, favorites, and cooking history are shared and synchronized.
- Avoid unnecessary attribution, activity logs, or complex permissions in the initial product.
- Keep the model extensible to additional household members and multiple households.

## 8. MVP vs. Long-Term Vision

The long-term vision should guide architecture and product decisions, but it must not become the MVP scope.

| Area        | Initial Product                                               | Long-Term Direction                                 |
| ----------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Recipes     | Personal structured recipe library and imports                | Living culinary memory across sources and formats   |
| Inventory   | Approximate shared household inventory                        | Intelligent understanding of household food context |
| Shopping    | Consolidated list based on recipes and stock                  | Proactive management of household needs             |
| Cooking     | Simple cooking completion and stock update                    | Contextual assistance throughout cooking            |
| Suggestions | Contextual recipe recommendations                             | Personalized culinary discovery and planning        |
| AI          | Extraction, interpretation, suggestions, and assisted actions | Multimodal household culinary intelligence          |
| Interaction | Clear visual interface with text input where useful           | Natural interaction through text, voice, and images |

Build the foundations so the product can evolve toward the long-term vision without trying to deliver every advanced capability immediately.

## 9. What This Product Is Not

- Not just a recipe bookmarking app.
- Not just a grocery checklist.
- Not a strict pantry accounting system.
- Not a calorie tracker or nutrition coach.
- Not a mandatory weekly meal planner.
- Not a chatbot-first product.
- Not an app that constantly sends notifications or demands engagement.

## 10. Product Decision Filter

When evaluating a feature or design decision, ask:

1. Does it reduce the mental load of everyday cooking?
2. Does it make the connected recipe–inventory–shopping–cooking loop more useful?
3. Does it make the product smarter without making the experience more complicated?
4. Does it preserve user control and communicate uncertainty honestly?
5. Does it support the long-term vision without overengineering the current release?

If a feature adds complexity without meaningfully improving serenity, usefulness, or culinary discovery, it should be challenged.

## 11. Brand Direction

The brand should express:

- Calm, confidence, and quiet intelligence.
- Warmth and human culinary culture.
- Premium, minimal, timeless, editorial design.
- Technology that feels sophisticated but stays in the background.

Avoid names and visual language that feel like grocery logistics, diet tracking, generic AI, or a kitchen gadget.

The brand should communicate the feeling of a kitchen that is understood — not a list of features.

---

## Working Principle

**Complexity belongs in the product, not in the user's daily experience.**

The product should do the thinking in the background, make the next useful action obvious, and leave people free to enjoy cooking.
