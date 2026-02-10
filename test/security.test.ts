import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextGraphLinksAdapter } from '../src/links.js';
import { NextGraphAdapter } from '../src/adapter.js';
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
        docCreate: vi.fn().mockResolvedValue('did:ng:o:doc-1'),
        docPut: vi.fn().mockResolvedValue(undefined),
        docGet: vi.fn().mockResolvedValue({
            data: { "text": "hello" },
            metadata: {
                author: "did:key:author",
                timestamp: "2023-01-01",
                signature: "sig-valid",
                key: "key-valid"
            }
        })
    }
}));

describe('NextGraph Security & Signatures', () => {
    let linksAdapter: NextGraphLinksAdapter;
    let expressionAdapter: NextGraphAdapter;
    
    // We mock the context.agent.sign/verify to simulate AD4M behavior
    const mockContext = {
        storageDirectory: '/tmp/test-security',
        agent: { 
            did: 'did:key:author',
            sign: vi.fn().mockResolvedValue({
                signature: "sig-generated",
                key: "key-generated"
            }),
            verify: vi.fn().mockImplementation(async (signature, data) => {
                return signature === "sig-valid";
            })
        },
        templateData: { name: 'SecurityTest' }
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        linksAdapter = new NextGraphLinksAdapter(mockContext);
        expressionAdapter = new NextGraphAdapter(mockContext);
        
        // Ensure init happens
        // Note: Real implementations might need await in init()
        await new Promise(r => setTimeout(r, 0));
    });

    // --- Links Tests (Graph) ---

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
        
        await linksAdapter.commit(diff);
        
        // The adapter should extract proof from the LinkExpression AND pass it to nextGraph
        expect(nextGraph.graphUpdate).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining([
                expect.objectContaining({
                    subject: 's1', // checking if triple data passed
                    signature: 'sig_abc123',
                    key: 'key_xyz789'
                })
            ]),
            expect.any(Array)
        );
    });

    it('Spec 2: render() should reconstruct LinkExpression with valid proof from stored data', async () => {
        // Mock stored data with metadata
        (nextGraph.graphGetTriples as any).mockResolvedValue([
            {
                subject: 's1', predicate: 'p1', object: 'o1',
                author: 'did:key:author',
                timestamp: '2023-01-01',
                signature: 'sig-valid',
                key: 'key-valid'
            }
        ]);

        const perspective = await linksAdapter.render();
        const link = perspective.links[0];
        
        expect(link).toBeDefined();
        expect(link.proof.signature).toBe('sig-valid');
        expect(link.proof.key).toBe('key-valid');
        // The adapter logic should call context.agent.verify(signature, data)
        // Since we mock verify returning true for "sig-valid"
        expect(link.proof.valid).toBe(true);
    });

    it('Spec 3: render() should mark link invalid if signature mismatch', async () => {
        (nextGraph.graphGetTriples as any).mockResolvedValue([
            {
                subject: 's1', predicate: 'p1', object: 'o1',
                author: 'did:key:author',
                timestamp: '2023-01-01',
                signature: 'sig-invalid', 
                key: 'key-valid'
            }
        ]);

        const perspective = await linksAdapter.render();
        const link = perspective.links[0];
        
        expect(link.proof.valid).toBe(false);
    });

    // --- Expression Tests (Documents) ---
    
    it('Spec 4: createPublic() should sign content and store signature', async () => {
        const content = { text: "hello" };
        
        await expressionAdapter.putAdapter.createPublic(content);
        
        // 1. Adapter should sign the content
        expect(mockContext.agent.sign).toHaveBeenCalledWith(content);
        
        // 2. Adapter should store content + signature
        expect(nextGraph.docPut).toHaveBeenCalledWith(
            'did:ng:o:doc-1', // created doc ID
            content,
            expect.objectContaining({
                author: 'did:key:author',
                signature: 'sig-generated', // from mock sign
                key: 'key-generated'
            })
        );
    });

    it('Spec 5: get() should return valid=true for verified signatures', async () => {
        const expr = await expressionAdapter.get('did:ng:o:doc-1');
        
        expect(expr).not.toBeNull();
        expect(expr?.proof.signature).toBe('sig-valid');
        // Should verify signature against content 
        expect(mockContext.agent.verify).toHaveBeenCalled();
        expect(expr?.proof.valid).toBe(true);
    });
    
    it('Spec 6: get() should return valid=false for invalid signatures', async () => {
        (nextGraph.docGet as any).mockResolvedValueOnce({
            data: { "text": "bad" },
            metadata: {
                author: "did:key:hacker",
                timestamp: "2023-01-01",
                signature: "sig-invalid",
                key: "key-hacker"
            }
        });

        const expr = await expressionAdapter.get('did:ng:o:doc-1');
        
        expect(expr?.proof.valid).toBe(false);
    });

});
