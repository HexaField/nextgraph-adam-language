import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextGraphLinksAdapter } from '../src/links.js';

// Mock the NextGraph client
vi.mock('../src/nextgraph-client.js', () => ({
    nextGraph: {
        init: vi.fn(),
        createRepo: vi.fn().mockResolvedValue('did:ng:repo:test'),
        repoId: 'did:ng:repo:test',
        graphSubscribe: vi.fn(),
        onGraphUpdate: vi.fn(), 
        graphUpdate: vi.fn().mockResolvedValue('rev-123'),
        graphGetTriples: vi.fn().mockResolvedValue([]),
    }
}));

import { nextGraph } from '../src/nextgraph-client.js';

describe('NextGraph Data Synchronization', () => {
    let adapter: NextGraphLinksAdapter;
    const mockContext = {
        storageDirectory: '/tmp/test-sync-data',
        agent: { did: 'did:key:initial-agent' },
        templateData: { name: 'SyncDataTest' }
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        adapter = new NextGraphLinksAdapter(mockContext);
        // Wait for constructor promises
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('Spec 1: commit() should call nextGraph.graphUpdate with correct params', async () => {
        const diff = {
            additions: [
                { data: { source: 's1', predicate: 'p1', target: 'o1' }, author: 'me', timestamp: '', proof: { signature: '', key: '', valid: true } }
            ] as any[],
            removals: [
                { data: { source: 's2', predicate: 'p2', target: 'o2' }, author: 'me', timestamp: '', proof: { signature: '', key: '', valid: true } }
            ] as any[]
        };

        await adapter.commit(diff);

        expect(nextGraph.graphUpdate).toHaveBeenCalledTimes(1);
        const args = (nextGraph.graphUpdate as any).mock.calls[0];
        
        // Arg 0: repoId
        expect(args[0]).toBe('did:ng:repo:test');
        
        // Arg 1: Additions (mapped to SG/Triple structure)
        expect(args[1]).toEqual([{ subject: 's1', predicate: 'p1', object: 'o1' }]);
        
        // Arg 2: Removals
        expect(args[2]).toEqual([{ subject: 's2', predicate: 'p2', object: 'o2' }]);
    });

    it('Spec 2: Incoming updates from NextGraph should trigger diffObservers', () => {
        const observer = vi.fn();
        adapter.addCallback(observer);

        // Retrieve the callback registered with nextGraph.onGraphUpdate
        expect(nextGraph.onGraphUpdate).toHaveBeenCalled();
        const updateCallback = (nextGraph.onGraphUpdate as any).mock.calls[0][0];

        // Simulate incoming update
        const additions = [{ subject: 's_in', predicate: 'p_in', object: 'o_in' }];
        const removals = [{ subject: 's_rm', predicate: 'p_rm', object: 'o_rm' }];
        
        updateCallback('did:ng:repo:test', additions, removals);

        expect(observer).toHaveBeenCalledTimes(1);
        const emittedDiff = observer.mock.calls[0][0];

        expect(emittedDiff.additions).toHaveLength(1);
        expect(emittedDiff.additions[0].data.source).toBe('s_in');
        expect(emittedDiff.additions[0].data.predicate).toBe('p_in');
        expect(emittedDiff.additions[0].data.target).toBe('o_in');

        expect(emittedDiff.removals).toHaveLength(1);
        expect(emittedDiff.removals[0].data.source).toBe('s_rm');
    });

    it('Spec 3: Ignore updates for other repos', () => {
        const observer = vi.fn();
        adapter.addCallback(observer);

        const updateCallback = (nextGraph.onGraphUpdate as any).mock.calls[0][0];

        // Simulate update for DIFFERENT repo
        updateCallback('did:ng:repo:OTHER', [], []);

        expect(observer).not.toHaveBeenCalled();
    });
});
