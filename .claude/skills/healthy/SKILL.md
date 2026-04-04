---
name: healthy
description: Find healthy food delivery options. Use when the user wants nutritious meals, salads, bowls, protein-forward options, or wants to avoid junk food. Trigger words include healthy, nutritious, clean eating, salad, bowl, protein, light, low-cal.
---

# Healthy Food Finder

Help the user find healthy delivery options by searching, filtering, and ranking results.

## How to Use

1. Run a search using the hungry CLI with the user's query (or a health-oriented default):

```bash
node dist/cli.js search "<query>" --toon
```

Good default queries if the user is vague: "healthy bowl", "salad", "poke", "grain bowl", "grilled chicken"

2. From the results, **filter out** restaurants that are clearly unhealthy:
   - Fast food chains (burger joints, fried chicken, pizza chains)
   - Anything with "fried", "wings", "nachos", "milkshake" prominently featured

3. **Rank the remaining** by these health signals (best first):
   - Name/description contains: salad, bowl, poke, grain, quinoa, kale, mediterranean, sushi, grilled, organic, protein, tofu, acai, smoothie, seafood
   - Higher ratings (4.7+ is a good sign of quality)
   - Prefer restaurants with "Healthy" in their category tags

4. Present the **top 5** to the user with a one-line note on why each is a good healthy pick.

5. If the user picks one, run:
```bash
node dist/cli.js menu "<restaurant-url>" --toon
```
Then highlight the healthiest items on the menu (salads, bowls, grilled proteins, veggie options).

## Health Heuristics

**Bias toward:** lean proteins (grilled chicken, fish, tofu), vegetables, whole grains, bowls, salads, Mediterranean/Japanese/Korean/Thai cuisine, anything organic or farm-to-table.

**Bias against:** deep fried, heavy cream/cheese-based, sugary sauces, pure carb bombs, fast food chains. Exception: if the user explicitly asks for something indulgent, respect it.

## Example Interaction

User: "find me something healthy"

1. Search for "healthy bowl"
2. Filter and rank results
3. Present: "Here are the top healthy options near you: ..."
4. User picks one, show the menu with healthy items highlighted
5. Offer to add to cart: `node dist/cli.js cart add "<url>" "<item>"`
