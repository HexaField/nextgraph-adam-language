import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextGraph } from '../src/nextgraph-client.js';
import { NextGraphLinksAdapter } from '../src/links.js';

// Mock dependencies using vi.hoisted to ensure availability before imports
const mockNg = vi.hoisted(() => ({
    wallet_read_file: vi.fn(),
    wallet_open_with_password: vi.fn(),
    wallet_import: vi.fn(),
    session_start: vi.fn().mockResolvedValue({ session_id: 'sess1' }),
    wallet_create: vi.fn().mockResolvedValue({
        result: 'Ok',
        user: 'did:key:zMockUser',
        wallet_name: 'test-wallet',
        wallet_file: new Uint8Array([1, 2, 3])
    }),
    test: vi.fn(),
    sparql_query: vi.fn(),
    sparql_update: vi.fn(),
    doc_create: vi.fn(),
    doc_put: vi.fn(),
    doc_get: vi.fn(),
    graph_get_triples: vi.fn(),
    create_repo: vi.fn(),
    doc_subscribe: vi.fn(),
    Verifier: {
        verify: vi.fn().mockReturnValue(true)
    }
}));

vi.mock('@ng-org/nextgraph', () => mockNg);
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
}));

describe('Data Integrity & Robustness', () => {
    
    // --- Task 1: JSON Escaping ---
    describe('JSON Serialization & Escaping', () => {
        beforeEach(async () => {
            vi.clearAllMocks();
            // Ensure session is set
            await nextGraph.createRepo({ name: 'test' });
        });

        it('Spec 1: docPut should correctly escape JSON containing special characters for SPARQL', async () => {
            const trickyData = {
                text: "Line 1\nLine 2",
                quote: 'He said "Hello"',
                backslash: "C:\\Windows\\System32",
                tab: "Col1\tCol2",
                unicode: "🚀 NextGraph"
            };
            
            await nextGraph.docPut('did:ng:o:doc1', trickyData);
            
            expect(mockNg.sparql_update).toHaveBeenCalled();
            const query = mockNg.sparql_update.mock.calls[0][1];
            
            // Analyze the query to ensure proper escaping
            // The JSON string itself:
            const internalJson = JSON.stringify(trickyData);
            
            // In SPARQL, a double quoted string literal must escape " as \" and \ as \\ 
            // It also supports \n, \t etc.
            // Our previous implementation was: jsonStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            
            // If the input has a backslash, JSON.stringify makes it double backslash: "C:\\Windows"
            // SPARQL needs that double backslash to be escaped again? 
            // Let's verify what we expect. 
            // Expected in SPARQL: " ... \"C:\\\\Windows ... "
            
            // We want to verify that the query contains a valid SPARQL string literal that reflects our JSON.
            // We mainly verify we aren't producing syntax errors or dataloss.
            // Verified robust escaping (tripled backslashes for quotes inside JSON inside SPARQL)
            expect(query).toContain('He said \\\\\\"Hello\\\\\\"');
            expect(query).toContain('C:\\\\\\\\Windows\\\\\\\\System32'); 
        });
    });

    // --- Task 2: Revision History ---
    describe('Revision History', () => {
        let adapter: NextGraphLinksAdapter;
        
        beforeEach(async () => {
            vi.clearAllMocks();
            // Setup Links Adapter
            const context = {
                storageDirectory: '/tmp/test',
                agent: { did: 'did:key:user' }
            };
            adapter = new NextGraphLinksAdapter(context);
            // Mock graphUpdate to return a revision
            nextGraph.graphUpdate = vi.fn().mockResolvedValue('rev-hash-123');
        });

        it('Spec 2: currentRevision() should return a mock initially', async () => {
            // NOTE: This spec changes from "mock" to "real" or at least "tracked".
            expect(await adapter.currentRevision()).not.toBeNull();
        });

        it('Spec 3: Update should change revision', async () => {
            const rev1 = await adapter.currentRevision();
            
            // Commit a change
            const diff = { additions: [], removals: [] };
            await adapter.commit(diff);
            
            const rev2 = await adapter.currentRevision();
            
            // If we implement revision tracking, this should likely change, 
            // or at least match the one returned by graphUpdate.
            // For the test, we want to fix the implementation to store the revision returned by commit.
             expect(rev2).toBe('rev-hash-123');
             expect(rev2).not.toEqual(rev1);
        });
    });
});
