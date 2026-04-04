---
name: cheap
description: Find budget-friendly food delivery with the best deals. Use when the user wants to save money, find deals, discounts, BOGO offers, low delivery fees, or stay under a budget. Trigger words include cheap, budget, deal, save, affordable, under $X, BOGO, discount, free delivery.
---

# Budget Meal Finder

Help the user find the most affordable delivery options by prioritizing deals, low fees, and value.

## How to Use

1. Run a search with the user's query (or a general one):

```bash
node dist/cli.js search "<query>" --toon
```

If no specific query, try "food" or "dinner" to get a broad set of results.

2. **Score and rank** results by value (best deals first):

   **Deal signals (highest priority):**
   - "Buy 1, Get 1 Free" — best deal, effectively 50% off
   - "X% off (Spend $Y)" — percentage discounts
   - "Spend $X, Save $Y" — dollar-off deals
   - "Free Item (Spend $X)" — free food with purchase
   - "X Offers Available" — multiple deals stacked

   **Fee signals:**
   - "Low fee" is better than "Moderate fee"
   - Avoid "High fee" restaurants

   **Value signals:**
   - High rating (4.5+) means better food per dollar
   - Fast ETA means less time waiting for your money's worth

3. Present the **top 5 deals** with the deal/offer prominently displayed.

4. If the user has a budget (e.g., "under $15"), note it and when they browse a menu, flag items that are likely over budget.

5. When showing a menu:
```bash
node dist/cli.js menu "<restaurant-url>" --toon
```
Sort by price (cheapest first) and highlight items under the user's budget.

## Budget Tips to Share

- BOGO deals are almost always the best value
- "Low fee" restaurants save $2-5 on delivery
- Combo meals are usually cheaper than ordering items separately
- Percentage discounts get better the more you spend (but don't overspend just for the deal)

## Example Interaction

User: "find me something cheap, under $15"

1. Search broadly
2. Rank by deals and low fees
3. Present: "Best deals right now: 1. Taco Primo — Buy 1, Get 1 Free, Low fee..."
4. User picks one, show menu sorted by price
5. Flag items under $15, offer to add to cart
