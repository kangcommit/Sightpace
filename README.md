# Next.js Frontend Template

## Overview

A server-rendered application built with React and the Next.js App Router, with theme support through next-themes.

This template includes TypeScript, Tailwind CSS, source-owned UI components, Biome, Vitest, Playwright, and Knip.

## Requirements

- Node.js `22.12.0` or newer.
- pnpm `12.14.0`, matching the `packageManager` field in `package.json`.

## Getting started

Copy this template directory into your application repository and run the following commands from its root:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), or the URL printed in the terminal if that port is occupied.

Before building your product, update the package name in `package.json`, replace the starter home page, and customize the application title, metadata, and styling.

## Available commands

| Command            | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `pnpm dev`         | Start the development server.                                           |
| `pnpm build`       | Create the production build.                                            |
| `pnpm start`       | Start the standalone production server.                                 |
| `pnpm check`       | Check formatting and lint rules with Biome.                             |
| `pnpm check:fix`   | Apply formatting and lint fixes with Biome.                             |
| `pnpm typecheck`   | Check TypeScript types.                                                 |
| `pnpm test`        | Run unit tests once.                                                    |
| `pnpm test:watch`  | Run unit tests in watch mode.                                           |
| `pnpm test:e2e`    | Run browser tests with Playwright.                                      |
| `pnpm test:e2e:ui` | Open the Playwright test runner.                                        |
| `pnpm knip`        | Check for unused files, exports, and dependencies.                      |
| `pnpm verify`      | Run formatting, lint, types, unit tests, build, and unused-code checks. |

## Project structure

| Location              | Responsibility                                         |
| --------------------- | ------------------------------------------------------ |
| `src/app/`            | Route definitions and page composition.                |
| `src/app/layout.tsx`  | Application entry or root layout and providers.        |
| `src/components/`     | Components shared across features.                     |
| `src/components/ui/`  | Reusable UI primitives owned by the application.       |
| `src/app/globals.css` | Global styles, theme tokens, and Tailwind entry point. |
| `tests/unit/`         | Unit and component tests.                              |
| `tests/e2e/`          | Browser tests for user flows.                          |
| `tests/setup.ts`      | Shared unit-test setup.                                |
| `components.json`     | UI component tooling configuration.                    |

The `@/` alias points to `src/`. Create `public/` when you need static assets served by filename.

## Adding a feature

1. Define the user flow and its route.
2. Add the route using the framework conventions described below.
3. Keep feature behavior in `src/features/<feature>/` when it grows beyond a small page.
4. Reuse components from `src/components/ui/` and promote shared components to `src/components/`.
5. Add loading, empty, error, and success states for data-dependent interfaces.
6. Add tests for the behavior and run `pnpm verify` plus the relevant browser tests.

### Routes and data

Create `src/app/settings/page.tsx` for `/settings`. Keep layouts, loading states, and error states in the route segment that owns them. Use `src/app/api/health/route.ts` as the example for an HTTP route handler.

Use Server Components by default. Add `'use client'` where browser state, effects, or event handlers are required, and keep credentials in server code.

### Folders and dependencies

Create folders when there is code to put in them. A growing feature can use this structure:

```text
src/features/settings/
├── components/       # Feature-specific UI
├── hooks/            # Feature-specific React hooks
├── api.ts            # Feature data access
└── types.ts          # Feature domain types
```

Keep feature-specific code within its feature. Put shared utilities in `src/lib/` and shared hooks in `src/hooks/` when multiple features need them. Shared code should not import feature internals. Prefer direct imports and avoid adding barrel files unless they provide a deliberate public interface.

## Configuration and conventions

- Use TypeScript and preserve strict type checking.
- Use kebab-case filenames and PascalCase React component names.
- Use Tailwind utilities and existing theme tokens for styling.
- Preserve semantic markup, keyboard access, labels, and visible focus states.
- Document new environment variables in a committed `.env.example`, including their purpose and whether they are required.
- Keep local environment files and secrets out of source control. Treat any value included in browser code as public.
- Keep dependencies, configuration, and this README updated as the application changes.

## Testing and verification

Unit tests use Vitest and Testing Library. Add tests under `tests/unit/` with a `.test.ts` or `.test.tsx` suffix. Browser tests belong under `tests/e2e/`.

Install the browser used by the current Playwright configuration before the first browser-test run:

```bash
pnpm exec playwright install chromium
pnpm verify
pnpm test:e2e
```

`pnpm verify` does not run browser tests. Playwright starts the development server automatically, or reuses an existing server outside CI.

## Production

Run `pnpm build` to generate the standalone output, then `pnpm start` to launch `.next/standalone/server.js`. When deploying the standalone server, copy `.next/static` to `.next/standalone/.next/static` and, if present, `public` to `.next/standalone/public`, or serve these assets through your hosting platform.

Configure application environment values in the hosting platform and check the deployed application's main user flows.
