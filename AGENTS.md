# Repository Guidelines

## Project Structure & Module Organization
`main.go` and `app.go` bootstrap the Wails desktop app and expose the Go-to-frontend bridge. Backend code lives in `internal/`: `internal/cluster` handles kubeconfig file management, `internal/config` persists app settings, and `internal/kube` wraps Kubernetes API operations. The React frontend lives in `frontend/src`, organized by feature (`features/workloads`, `features/network`, `features/terminal`) plus shared code in `shared/`. Build output lands in `frontend/dist` and the packaged app in `build/bin`. Treat `frontend/wailsjs` as generated code.

## Build, Test, and Development Commands
Use `make dev` to start Wails in development mode with the Vite frontend. Use `make build` to create the desktop bundle. Use `go test ./...` to compile-check backend packages; the repo currently has no Go test files, so this mainly catches regressions. In `frontend/`, run `npm run build` to type-check with `tsc` and produce a production bundle. Use `make clean` when build artifacts or `node_modules` state become suspect.

## Coding Style & Naming Conventions
Format Go with `gofmt`; keep package names lowercase and unexported helpers short and explicit. Follow existing Go patterns such as `ClusterInfo`, `GetPodDetails`, and `safeJoin`. TypeScript runs with `strict` mode enabled, so avoid `any` and keep shared types in `frontend/src/shared/types`. Use PascalCase for React components, camelCase for hooks and utilities, and colocate feature-specific components under their feature folder. Match the existing two-space indentation in frontend files.

## Testing Guidelines
Add Go tests as `*_test.go` beside the package they cover. For frontend behavior, prefer testable hooks and pure helpers under `shared/` or feature `hooks/`; if you add a test runner later, keep tests adjacent to the source. Before opening a PR, run `go test ./...` and `npm run build`.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commits, for example `feat: ...` and `fix(pods): ...`. Keep that format, use optional scopes when useful, and write imperative summaries. PRs should describe the user-visible change, list validation steps, link related issues, and include screenshots or recordings for UI changes.
