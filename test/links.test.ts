import { describe, it, expect, beforeAll } from 'vitest';
import { NextGraphLinksAdapter } from '../src/links.js';
import { nextGraph } from '../src/nextgraph-client.js';
import { PerspectiveDiff } from '@coasys/ad4m';

const mockContext = {
    storageDirectory: '/tmp/test-links',
    agent: {
        did: 'did:key:mock-agent-did'
    }
};

describe('NextGraph Links Adapter', () => {
    let adapter: NextGraphLinksAdapter;

    beforeAll(async () => {
         // Initialize shared client
        await nextGraph.init(mockContext.storageDirectory);
        await nextGraph.createRepo();
        
        // Seed mock data
        const mockRepoId = "did:ng:repo:mock-repo-id";
        await nextGraph.graphUpdate(mockRepoId, [
            { subject: 'did:ad4m:s1', predicate: 'did:ad4m:p1', object: 'did:ad4m:o1' }
        ], []);

        adapter = new NextGraphLinksAdapter(mockContext);
    });

    it('render', async () => {
        const perspective = await adapter.render();
        expect(perspective, 'Perspective should be returned').toBeTruthy();
        expect(perspective.links.length, 'Should have 1 link from mock').toBe(1);
        expect(perspective.links[0].data.source, 'Source should match mock').toBe('did:ad4m:s1');
    });

    it('commit', async () => {
        // Mock diff
        const diff: PerspectiveDiff = {
            additions: [
                {
                    author: "did:key:test",
                    timestamp: new Date().toISOString(),
                    data: {
                        source: "did:ad4m:s2",
                        predicate: "did:ad4m:p2",
                        target: "did:ad4m:o2"
                    },
                    proof: { signature: "sig", key: "key", valid: true }
                } as any
            ],
            removals: []
        };

        const revision = await adapter.commit(diff);
        expect(revision.startsWith('new-revision-'), 'Should return new revision hash').toBeTruthy();
    });
});
