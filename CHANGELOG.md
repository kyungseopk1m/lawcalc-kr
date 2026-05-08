# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- Initial pnpm workspace infrastructure.
- Root TypeScript, ESLint, Prettier, editor, and ignore configuration.
- BSL 1.1 license with future Apache-2.0 change license.
- Initial README and project documentation.
- CI and release workflow skeletons.
- Desktop React/Vite shell for the judgment-interest calculator UI.
- Tauri 2.x shell and IPC command stubs for PDF, CSV, clipboard, and `.lcalc` save/load.
- `@lawcalc-kr/core-engine` package scaffold with public interest-calculation types and placeholder tests.
- Golden-test policy and placeholder wiring for court-output comparison cases.

### Changed

- Refreshed `pnpm-lock.yaml` after desktop, Tauri, and core-engine package integration.
