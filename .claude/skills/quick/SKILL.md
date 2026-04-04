---
name: quick
description: Find the fastest food delivery options. Use when the user is in a hurry, wants fast delivery, short ETA, or needs food ASAP. Trigger words include quick, fast, hungry now, ASAP, rush, hurry, short wait, under 20 min.
---

# Quick Delivery Finder

Help the user get food as fast as possible by sorting results by delivery ETA.

## How to Use

1. Run a search:

```bash
node dist/cli.js search "<query>" --toon
```

If the user doesn't have a preference, search "food" for the broadest set of options.

2. **Parse the ETA** from each result (e.g., "13 min", "22 min") and sort ascending.

3. **Filter** to only show restaurants with ETA under a threshold:
   - Default: 25 minutes
   - If the user says "really fast" or "ASAP": 15 minutes
   - If the user specifies: use their number

4. Present results **sorted by fastest first**, showing ETA prominently:

```
1. Taco Primo — 13 min
   Low fee · 4.7 (500+) · Buy 1, Get 1 Free

2. McDonald's — 16 min
   Moderate fee · 4.6 (15,000+) · Free Item (Spend $15)
```

5. If the user picks one, show menu and offer to add to cart. Skip lengthy browsing — the user is in a hurry. Suggest popular/featured items first.

## Speed Tips

- Restaurants with "Low fee" tend to be closer (faster delivery)
- High review counts (10,000+) often indicate efficient operations
- Combo meals are faster than custom orders (less prep time)
- Avoid restaurants with "Moderate" or "High" fee if speed matters — they may be farther away

## Example Interaction

User: "I'm starving, get me food fast"

1. Search "food"
2. Filter to under 20 min ETA
3. Present fastest options
4. User picks, show featured items, add to cart quickly
5. `node dist/cli.js order` to preview, `--confirm` to place
