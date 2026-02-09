# NextGraph AD4M Language

This is an **AD4M Language** implementation that bridges [AD4M](https://ad4m.dev/) with [NextGraph](https://nextgraph.org/). It allows AD4M agents to use NextGraph as a decentralized, privacy-focused storage and synchronization backend for Perspectives, Expressions, and Links.

The adapter uses the official NextGraph WASM SDK (`@ng-org/nextgraph`) to manage wallets, private stores, and documents directly from within the AD4M Executor.

## Features

*   **Native WASM Integration**: Directly calls NextGraph WASM functions for high performance and security.
*   **Wallet Persistence**: Automatically creates and manages a NextGraph wallet (`wallet.ng`) locally.
    *   Uses a consistent password (`nextgraph-ad4m-secret`) for automated unlocking.
    *   Auto-recovers by creating a new wallet if the existing one is corrupted or incompatible.
*   **Document Storage**: Implements the `ExpressionAdapter` interface.
    *   Stores arbitrary JSON content as "discrete" documents in the NextGraph Private Store.
    *   Uses SPARQL queries (`docCreate`, `docPut`, `docGet`) to manage content predicates (`http://schema.org/text`).
*   **Graph Synchronization**: Implements the `LinkSyncAdapter` interface.
    *   Synchronizes AD4M Links (triples) with the NextGraph Repo Graph.
    *   Supports `additions` and `removals` via batched SPARQL updates.
*   **Real-time Updates**:
    *   Subscribes to remote changes on the Repo/Store using `doc_subscribe`.
    *   Propagates change signals to AD4M to trigger live updates in the UI.

## Architecture

*   **`src/index.ts`**: The Language Factory. Initializes the adapters.
*   **`src/nextgraph-client.ts`**: A robust wrapper around the `@ng-org/nextgraph` WASM SDK.
    *   Handles Broker initialization (`ng.test()`).
    *   Manages Wallet lifecycle (Create, Load, Import, Open, Session Start).
    *   Handles Error recovery (e.g., `NotFound` session errors).
    *   Provides high-level APIs for `docCreate`, `sparql_query`, `sparql_update`, and `doc_subscribe`.
*   **`src/adapter.ts`**: The Expression Adapter. Maps AD4M `get`/`put` operations to NextGraph Documents.
*   **`src/links.ts`**: The Link Sync Adapter. Maps AD4M Perspectives to NextGraph RDF Graphs.

## Prerequisities

*   Node.js (v18+ recommended)
*   npm or yarn
*   Rust toolchain (if rebuilding the underlying WASM - not required for standard usage)
*   A running AD4M Executor (for integration)

## Build & Test

### 1. Installation
```bash
npm install
```

### 2. Build
Compiles TypeScript to JavaScript in the `build/` directory.
```bash
npm run build
```

### 3. Unit/Integration Tests
Runs the test suite using `tape` and `ts-node`. This verifies the Client Wrapper logic (Wallet creation, Persistence, SPARQL ops) against an in-memory NextGraph broker.
```bash
npx ts-node test/nextgraph-client.test.ts
```
*Note: The tests create a temporary wallet in `/tmp/test-storage`.*

## Configuration

The adapter automatically initializes storage in the directory provided by the AD4M Host context (`context.storageDirectory`).
Inside this directory, you will find:
*   `wallet.ng`: The encrypted NextGraph wallet.
*   `wallet.ng.name`: The local name of the wallet.

## Usage in AD4M

To use this language in your AD4M application:

1.  **Publish**:
    ```bash
    ad4m languages publish build/index.js
    ```
    This returns a Language Hash (Address).

2.  **Create Perspective**:
    Use the GraphQL API to create a Perspective with this language:
    ```graphql
    mutation {
      perspective {
        add(name: "NextGraph Space", languages: ["<LANGUAGE_HASH>"]) {
          uuid
        }
      }
    }
    ```

3.  **Interact**:
    Any links added to this perspective or expressions created within it will be persisted to the local NextGraph wallet and synchronized with the NextGraph network (once peering is configured).

## Known Limitations (MVP)

*   **Password**: Currently uses a hardcoded password for the local wallet file to ensure non-interactive startup. Security relies on the host system's file permissions.
*   **Diff Granularity**: Real-time subscriptions currently notify AD4M *that* a change occurred, forcing a refresh. Granular diffs (telling AD4M exactly which links changed) are planned for the future once the NextGraph update format is fully mapped.
*   **Private Store Only**: Currently defaults to the Private Store. Public/Protected store support is stubbed but not fully exposed via AD4M config yet.

## License

MIT
