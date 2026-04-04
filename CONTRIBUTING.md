# Contributing to hungry-cli

## Language

All source code must be **TypeScript**. No `.js` files in `src/` — ever.

If you're adding a new adapter, new command, or any feature, write it in TypeScript
and make sure it compiles cleanly with `npm run build`.

## Development

```bash
npm install
npm run build          # compile once
npm run dev            # watch mode
npm test               # run tests
npm run test:coverage  # run tests with coverage
```

## Tests

Every new feature or adapter method needs tests. We use Vitest.

- Tests live alongside source as `*.test.ts` files
- Aim for real behavior tests, not mocks of internals
- Run the full suite before pushing: `npm test`

## Code Style

- Strict TypeScript (`strict: true` in tsconfig)
- ESM (`"type": "module"` in package.json)
- Node 22+
