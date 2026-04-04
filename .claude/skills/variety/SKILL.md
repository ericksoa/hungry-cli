---
name: variety
description: Suggest food you haven't had recently to avoid ordering the same thing. Use when the user wants something different, is bored of their usual, wants to try new restaurants, or asks for variety/surprise. Trigger words include variety, something different, new, surprise, bored, not the usual, try something, switch it up.
---

# Variety Finder

Help the user break out of their ordering rut by tracking what they've had recently and suggesting something different.

## How to Use

1. Check the order history file for recent orders:

```bash
cat ~/.config/hungry/order-history.json 2>/dev/null || echo "No history yet"
```

The file contains entries like: `{"orders": [{"restaurant": "sweetgreen", "date": "2026-04-04T..."}]}`

If no history exists, skip the filtering step and just suggest diverse options.

2. Run a broad search:

```bash
node dist/cli.js search "food" --toon
```

3. **Filter out** restaurants the user has ordered from in the last 7 days (or whatever window makes sense).

4. **Prioritize diversity** in the remaining results:
   - Different cuisines than recent orders (if they had Japanese last, suggest Mediterranean)
   - Restaurants they've never ordered from
   - Higher-rated places they might have overlooked

5. Present **5 options** with a note on why each is a good change of pace:

```
You've had sweetgreen and Chipotle this week. Here's something different:

1. Kitava — 4.8 stars, 28 min
   Healthy bowls but NOT your usual salad spot

2. XENiA: Mediterranean Kitchen — 4.6 stars, 34 min
   Mediterranean — haven't had this cuisine recently
```

6. After the user orders, record it so future variety checks are accurate. Append to the history file:

```bash
echo '{"restaurant":"RESTAURANT_NAME","date":"DATE"}' >> ~/.config/hungry/order-history.json
```

(Or note that the order command should be updated to auto-record.)

## Variety Heuristics

- Same restaurant within 3 days = definitely skip
- Same cuisine within 3 days = try to avoid
- Never-ordered restaurants get a bonus
- If the user has no history, suggest a mix of cuisines: one healthy, one comfort, one ethnic

## Example Interaction

User: "I'm bored of my usual, surprise me"

1. Check history: sweetgreen (yesterday), Chipotle (2 days ago), KFC (4 days ago)
2. Search broadly
3. Filter out sweetgreen and Chipotle (too recent)
4. Deprioritize American/Mexican (had both recently)
5. Present: Mediterranean, Japanese, Korean, Indian, Thai options
