# Implementation Plan: NextGraph Language for AD4M

This document outlines the strategy for creating an AD4M Language that utilizes NextGraph as its underlying storage and synchronization layer. This integration will enable AD4M agents to leverage NextGraph's CRDT-based local-first architecture, enabling real-time collaboration and seamless offline-first data handling.

## 1. Project Architecture & Setup

The project will be a standard AD4M Language implementation, built as a TypeScript module that bundles a WebAssembly (WASM) version of the NextGraph SDK.

### 1.1 Directory Structure
```
nextgraph-ad4m-language/
├── src/
│   ├── index.ts                # Main entry point (Language Factory)
│   ├── adapter.ts              # ExpressionAdapter implementation
│   ├── links.ts                # LinkSyncAdapter implementation
│   ├── nextgraph-client.ts     # Wrapper around NextGraph WASM/SDK
│   ├── utils.ts                # URI conversion (did:ng <-> AD4M format)
│   └── types.ts                # Type definitions
├── build/                      # Output directory for the bundled language
├── test/                       # Integration tests
├── package.json
├── tsconfig.json
└── rollup.config.js            # Bundling configuration
```

### 1.2 Dependencies
*   `@coasys/ad4m`: Core AD4M interfaces.
*   `nextgraph-sdk` (or equivalent): The JS/WASM client for NextGraph.
*   `rollup`: For bundling the final `.js` file for AD4M.

## 2. Core Components Mapping

| AD4M Concept | NextGraph Concept | Implementation Strategy |
| :--- | :--- | :--- |
| **Language** | `Repo` / `Branch` | Each instance of this language corresponds to a specific NextGraph Repo or Branch. |
| **Expression** | `Document` (Discrete) | AD4M `put()` creates a NG Document. The content (JSON) is stored in the Discrete (Yjs/Automerge) part. |
| **Address** | `Nuri` (`did:ng:...`) | AD4M addresses will map 1:1 to NextGraph URIs. |
| **Link** | `RDF Triple` | AD4M Links (`source`, `predicate`, `target`) map directly to NG's Graph CRDT triples. |
| **Neighbourhood** | `Repo` (Graph part) | The "Neighbourhood" is the shared graph context of a NextGraph Repo. |

## 3. Implementation Steps

### Phase 1: Initialization and Identity
**Goal:** Initialize the NextGraph client within the AD4M Language factory.

1.  **Language Factory (`create` function)**:
    *   [x] Initialize the NextGraph local node/client using the `context.storageDirectory` provided by AD4M.
    *   [x] Handle Identity: Map the AD4M Agent's DID (`did:key`) to a NextGraph Identity. Ideally, generate/retrieve a NextGraph Wallet that corresponds to the AD4M agent.

### Phase 2: Expression Adapter (Content)
**Goal:** Implement CRUD operations for data.

1.  **`put(expression)`**:
    *   [x] Create a new NextGraph **Document**.
    *   [x] Store the `expression.data` into the **Discrete** part of the Document (using the generic JSON/Map support of the CRDT).
    *   [x] Store `expression.author` and `expression.timestamp` as metadata fields in the Document or as RDF properties in the Document's internal graph.
    *   [x] Return the Nuri (`did:ng:o:...`) as the AD4M Address.

2.  **`get(address)`**:
    *   [x] Parse the Nuri.
    *   [x] Fetch the Document from the local NextGraph store.
    *   [x] Read the Discrete JSON data.
    *   [x] Reconstruct and return the standard AD4M `Expression` object.

### Phase 3: LinkSync Adapter (Graph)
**Goal:** Implement the "Neighbourhood" synchronization logic.

1.  **`sync()`**:
    *   [x] NextGraph handles syncing automatically via its background Broker connection.
    *   [x] The `sync()` method in AD4M acts as a polling mechanism or hook trigger. We will wire NextGraph's "Store Update" events to trigger the AD4M `perspectiveDiff` callbacks.
    *   [x] When new triples arrive in the NextGraph Repo, convert them to AD4M `Link` objects and notify the Executor.

2.  **`render()`**:
    *   [x] Query the full RDF graph of the NextGraph Repo.
    *   [x] Convert all triples (`Subject`, `Predicate`, `Object`) into AD4M Links.
    *   [x] Return a `Perspective` object.

3.  **`commit(diff)`**:
    *   [x] Take the `PerspectiveDiff` (added/removed links) from AD4M.
    *   [x] Convert additions to RDF Triples and insert them into the NextGraph Repo.
    *   [x] Convert removals to RDF Triples and remove them from the NextGraph Repo.
    *   *Note:* NextGraph uses CRDTs, so "removals" are handled via Observed-Remove logic.

### Phase 4: Capabilities & Security
**Goal:** Ensure permissions map correctly.

1.  **Read/Write Caps**:
    *   When sharing a Neighbourhood, AD4M uses a templated link.
    *   We must ensure the AD4M Language string includes the necessary NextGraph **ReadCap** and **WriteCap** (secret keys) so that other agents can actually join and sync.
    *   Format: `nextgraph://<repo-id>?readKey=...&writeKey=...`
    *   [x] URI parsing logic implemented in `src/utils.ts`.

## 4. Technical Challenges & Solutions

### 4.1 Synchronous vs Asynchronous
AD4M often expects `async` operations, while some CRDT interactions might be synchronous or event-driven.
*   **Solution**: Wrap NextGraph event emitters in Promises where necessary, but rely heavily on AD4M's `addCallback` pattern for real-time updates.

### 4.2 Rich Text vs. JSON
NextGraph differentiates between "Rich Text" (ProseMirror/Yjs) and "Data" (JSON).
*   **Solution**: The initial implementation will treat all AD4M data as "Data" (JSON). Future versions can inspect the `expression.data` type; if it looks like a ProseMirror doc, use NextGraph's Rich Text features for finer-grained collaboration.

### 4.3 Identity Mapping
AD4M uses `did:key`. NextGraph has its own wallet/ID system.
*   **Solution**: We might need to store the NextGraph private keys *inside* the AD4M Agent's secure storage (or the Language's local storage), effectively making the AD4M Agent the "holder" of the NextGraph Wallet.

## 5. Development Roadmap

1.  **Week 1**: "Hello World" - Setup repo, build the WASM bridge, and get a simple "create repo" command working inside AD4M. (Complete)
2.  **Week 2**: Expression Adapter - Implement `put` and `get` for JSON objects. (Complete)
3.  **Week 3**: Link Adapter - Implement `render` to view the graph. (Complete)
4.  **Week 4**: Sync - Wire up the live replication events to AD4M's `addCallback`. (Complete)
5.  **Week 5**: Testing & Packaging - Verify with the AD4M test harness and package for release. (Tests Implemented)
