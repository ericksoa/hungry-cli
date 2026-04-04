---
name: lunch
description: The "just feed me" button. Find and order a great lunch by balancing health, budget, speed, and variety. Use when the user wants lunch, wants to be fed, says "I'm hungry", or wants a recommendation without specifying preferences. Trigger words include lunch, feed me, hungry, what should I eat, order me food, recommend something, just pick something.
---

# Lunch — The "Just Feed Me" Skill

This is the all-in-one lunch ordering skill. It balances health, budget, speed, and variety to recommend the best options right now. No analysis paralysis — just good food, fast.

## How to Use

### Step 1: Search

Run a search with a sensible default query. If the user gave a hint, use it. Otherwise:

```bash
node dist/cli.js search "healthy bowl" --toon
```

Also run a second search if the first is too narrow:
```bash
node dist/cli.js search "lunch" --toon
```

### Step 2: Score and Rank

For each result, score on four dimensions:

**Health (40% weight):**
- Positive: salad, bowl, poke, grain, grilled, organic, mediterranean, japanese, korean, thai, protein, tofu, seafood
- Negative: fried, burger, pizza, fast food chains, donut, wings, nachos
- Score 0-100

**Budget (25% weight):**
- Has a deal (BOGO, % off, free item): +25 points
- Low delivery fee: +15 points
- Moderate fee: -5 points
- Score 0-100

**Speed (20% weight):**
- Under 20 min ETA: +20 points
- Under 30 min: +10 points
- Over 30 min: -5 points

**Variety (15% weight):**
- Check `~/.config/hungry/order-history.json`
- Not ordered from in last 7 days: +15 points
- Ordered yesterday: -10 points

**Composite lunch score** = health*0.4 + budget*0.25 + speed + variety

### Step 3: Present Top 3

Show exactly 3 picks, ranked by composite score:

```
Here are my top 3 picks for lunch:

1. Kitava [score: 82]
   Low fee · 28 min · 4.8 stars · Buy 1, Get 1 Free
   Why: Healthy bowls, great deal, haven't been there this week

2. sweetgreen (Marina) [score: 75]
   Low fee · 22 min · 4.5 stars · Spend $20, Save $5
   Why: Fast, reliable healthy option, $5 off today

3. moonbowls [score: 71]
   Moderate fee · 32 min · 4.6 stars · Buy 1, Get 1 Free
   Why: Korean bowls, BOGO deal, good variety pick
```

### Step 4: Order Flow

When the user picks one:

1. Show the menu: `node dist/cli.js menu "<url>" --toon`
2. Recommend 2-3 items that fit the health/budget criteria
3. When they choose: `node dist/cli.js cart add "<url>" "<item>"`
4. Preview: `node dist/cli.js order`
5. Confirm: `node dist/cli.js order --confirm`

### Step 5: Record

After ordering, note the restaurant for variety tracking:
```bash
# Read existing history, append, write back
```

## Decision Philosophy

- **Don't overthink it.** Three picks is enough. More causes paralysis.
- **Health over price, but deals matter.** A healthy $18 bowl with a BOGO beats a $12 burger.
- **Speed is a tiebreaker.** All else equal, pick the faster option.
- **Variety keeps things interesting.** Gently steer away from yesterday's restaurant.
- **Respect the user's vibe.** If they say "something light" bias healthy. If they say "I need comfort food" bias indulgent. If they say nothing, bias healthy.

## Example Interaction

User: "feed me"

1. Search "healthy bowl" and "lunch"
2. Merge and deduplicate results
3. Score each on health/budget/speed/variety
4. Present top 3 with reasons
5. User says "2" — show sweetgreen menu
6. Recommend: "Harvest Bowl ($18.95) or Kale Caesar ($18.25) — both solid"
7. User picks Harvest Bowl
8. Add to cart, preview order, confirm
9. "Order placed! Harvest Bowl from sweetgreen, $18.95, arriving in ~22 min"
