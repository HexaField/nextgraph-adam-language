import test from 'tape';
import { NextGraphLinksAdapter } from '../src/links.js';
import { nextGraph } from '../src/nextgraph-client.js';
import { PerspectiveDiff } from '@coasys/ad4m';

const mockContext = {
    storageDirectory: '/tmp/test',
    agent: {
        did: 'did:key:mock-agent-did'
    }
};

test('NextGraph Links Adapter', async (t) => {
    // Initialize shared client
    await nextGraph.init(mockContext.storageDirectory);
    
    // Seed mock data
    const mockRepoId = "did:ng:repo:mock-repo-id";
    await nextGraph.graphUpdate(mockRepoId, [
        { subject: 'did:ad4m:s1', predicate: 'did:ad4m:p1', object: 'did:ad4m:o1' }
    ], []);

    const adapter = new NextGraphLinksAdapter(mockContext);

    t.test('render', async (st) => {
        const perspective = await adapter.render();
        st.ok(perspective, 'Perspective should be returned');
        st.equal(perspective.links.length, 1, 'Should have 1 link from mock');
        st.equal(perspective.links[0].data.source, 'did:ad4m:s1', 'Source should match mock');
        st.end();
    });

    t.test('commit', async (st) => {
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
        st.ok(revision.startsWith('new-revision-'), 'Should return new revision hash');
        st.end();
    });
});
