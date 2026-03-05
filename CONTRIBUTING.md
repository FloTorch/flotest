# Contributing to FloTorch Loadtest

Thank you for your interest in contributing! This document outlines the guidelines and conventions for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies with `pnpm install`
4. Create a new branch from `main` for your changes

## Issues Before PRs

- **Bug fixes and features** must have an associated issue before opening a PR. This ensures changes are discussed and agreed upon before work begins.
- **Trivial changes** (typos, minor documentation fixes) may skip the issue requirement and go straight to a PR.

If you're unsure whether your change needs an issue, err on the side of creating one — it only takes a moment.

## Development Workflow

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Lint
pnpm lint

# Format
pnpm format

# Build
pnpm build
```

## Commit Convention

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. Every commit message must follow this format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                                          |
| ---------- | ---------------------------------------------------- |
| `feat`     | A new feature                                        |
| `fix`      | A bug fix                                            |
| `docs`     | Documentation only changes                           |
| `style`    | Changes that do not affect the meaning of the code   |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf`     | A code change that improves performance              |
| `test`     | Adding missing tests or correcting existing tests    |
| `chore`    | Changes to the build process or auxiliary tools      |
| `ci`       | Changes to CI configuration files and scripts        |

### Examples

```
feat(runner): add support for Anthropic backend
fix(reporter): correct percentile calculation for empty datasets
docs: update CLI usage examples in README
chore: upgrade zod to v4
```

### Breaking Changes

Append `!` after the type/scope for breaking changes:

```
feat(schemas)!: restructure config schema
```

## TypeScript Guidelines

### Strict Types

This project enforces strict TypeScript. The following rules are non-negotiable:

- **No `any`** — use proper types, generics, or `unknown` with type narrowing instead.
- **No `unknown` as a shortcut** — if you use `unknown`, you must narrow it before use. Don't use it as a lazy substitute for `any`.
- **No unnecessary `never`** — `never` should only appear where the type system naturally infers it (exhaustive switches, impossible states). Don't use it as a type assertion hack.
- **Use Zod schemas** for runtime validation and infer types from them using `z.infer<>` where applicable.
- **Prefer explicit return types** on exported functions.

### Code Style

- The project uses **oxlint** for linting and **oxfmt** for formatting — not ESLint or Prettier.
- Run `pnpm lint` and `pnpm format` before submitting a PR.
- Follow existing code patterns and conventions in the codebase.

## Pull Requests

1. Reference the related issue in the PR description (e.g., `Closes #42`).
2. Keep PRs focused — one logical change per PR.
3. Ensure the build passes (`pnpm build`).
4. Ensure linting passes (`pnpm lint`).
5. Write a clear PR description explaining **what** changed and **why**.

## Reporting Bugs

Use the **Bug Report** issue template. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node.js version, OS, etc.)

## Requesting Features

Use the **Feature Request** issue template. Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
