import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextGraphLinksAdapter } from '../src/links.js';
import { nextGraph } from '../src/nextgraph-client.js';

// Mock the NextGraph client
vi.mock('../src/nextgraph-client.js', () => ({
    nextGraph: {
        init: vi.fn(),
        createRepo: vi.fn().mockResolvedValue('did:ng:repo:test'),
        repoId: 'did:ng:repo:test',
        graphSubscribe: vi.fn(),
        onGraphUpdate: vi.fn(),
        graphUpdate: vi.fn().mockResolvedValue('rev-sig-1'),
        graphGetTriples: vi.fn().mockResolvedValue([]),
    }
}));

describe('NextGraph Security & Signatures', () => {
    let adapter: NextGraphLinksAdapter;
    const mockContext = {
        storageDirectory: '/tmp/test-security',
        agent: { did: 'did:key:author' },
        templateData: { name: 'SecurityTest' }
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        adapter = new NextGraphLinksAdapter(mockContext);
        await new Promise(r => setTimeout(r, 0));
    });

    it('Spec 1: commit() should include signature metadata in graph update', async () => {
        const proof = { 
            signature: 'sig_abc123', 
            key: 'key_xyz789', 
            valid: true 
        };
        
        const diff = {
            additions: [
                { 
                    data: { source: 's1', predicate: 'p1', target: 'o1' }, 
                    author: 'did:key:author', 
                    timestamp: '2023-01-01', 
                    proof 
                }
            ] as any[],
            removals: []
        };

        await adapter.commit(diff);

        expect(nextGraph.graphUpdate).toHaveBeenCalled();
        const args = (nextGraph.graphUpdate as any).mock.calls[0];
        const additions = args[1];

        // We expect the addition object to now contain extra metadata properties
        // The implementation strategy mentioned "props" or "metadata"
        // Let's assume we map it to an object structure that NextGraph accepts, 
        // or encoded in the object if NextGraph only supports RDF triples.
        // If NextGraph supports props on triples (Property Graph style), great.
        // If not, we might fail unless we implement a serialization strategy.
        
        // For this test, let's assume we expect a `props` or similar field on the passed object
        // Or if using standard generic triple interface:
        // { subject, predicate, object, signature: string, key: string, author: string }
        
        expect(additions[0].signature).toBe('sig_abc123');
        expect(additions[0].key).toBe('key_xyz789');
        expect(additions[0].author).toBe('did:key:author');
    });

    it('Spec 2: render() should reconstruct LinkExpression with valid proof from stored data', async () => {
        // Mock stored triples HAVE signature data
        (nextGraph.graphGetTriples as any).mockResolvedValue([
            { 
                subject: 's1', 
                predicate: 'p1', 
                object: 'o1',
                // Mocking returned metadata
                author: 'did:key:stored-author',
                signature: 'sig_stored',
                key: 'key_stored'
            }
        ]);

        const perspective = await adapter.render();
        const link = perspective.links[0];

        expect(link.author).toBe('did:key:stored-author');
        expect(link.proof.signature).toBe('sig_stored');
        expect(link.proof.key).toBe('key_stored');
        // By default should assume validity until checked, or we might need to re-verify
        expect(link.proof.valid).toBe(true); 
    });

    it('Spec 3: Incoming sync updates should also carry proofs', () => {
        const observer = vi.fn();
        adapter.addCallback(observer);
        const onUpdate = (nextGraph.onGraphUpdate as any).mock.calls[0][0];

        // Simulate update WITH metadata
        onUpdate('did:ng:repo:test', 
            [{ 
                subject: 's2', predicate: 'p2', object: 'o2', 
                author: 'did:key:remote', signature: 'sig_remote', key: 'key_remote' 
            }], 
            []
        );

        const call = observer.mock.calls[0][0];
        const addition = call.additions[0];

        expect(addition.author).toBe('did:key:remote');
        expect(addition.proof.signature).toBe('sig_remote');
    });
});
