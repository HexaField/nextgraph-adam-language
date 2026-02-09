import test from 'tape';
import { nextGraph } from '../src/nextgraph-client.ts';

test('NextGraph Client Wrapper Tests', async (t) => {
    t.test('Initialization', async (st) => {
        try {
            await nextGraph.init('/tmp/test-storage');
            st.pass('Initialized successfully');
        } catch (e) {
            st.fail(`Initialization failed: ${e}`);
        }
        st.end();
    });

    t.test('Create Repo', async (st) => {
        try {
            const repoId = await nextGraph.createRepo();
            st.ok(repoId.startsWith('did:ng:repo'), 'Repo ID should start with did:ng:repo');
        } catch (e) {
            st.fail(`Create Repo failed: ${e}`);
        }
        st.end();
    });

    t.test('Document Operations', async (st) => {
        try {
            // docCreate(sessionId, crdt, className, destination, storeType, storeRepo)
            // defaults: sessionId=internal, crdt="YMap", className="DOM", destination="store", storeType="private", storeRepo=undefined
            const nuri = await nextGraph.docCreate(undefined, "YMap", "DOM", "store", "private", undefined);
            st.ok(nuri.startsWith('did:ng:'), `docCreate returned valid NURI: ${nuri}`);
            
            // docPut(nuri, data, metadata)
            const data = { content: "Hello NextGraph" };
            await nextGraph.docPut(nuri, data);
            st.pass('docPut executed successfully');

            // docGet(nuri)
            const result = await nextGraph.docGet(nuri);
            st.ok(result.metadata, 'docGet returned metadata');
            st.deepEqual(result.data, data, 'docGet returned stored data');
            
        } catch (e) {
            st.fail(`Document operations failed: ${e}`);
        }
        st.end();
    });

    t.test('Graph Subscription', async (st) => {
        try {
            const repoId = await nextGraph.createRepo();
            await nextGraph.graphSubscribe(repoId);
            st.pass('graphSubscribe executed successfully');
        } catch (e) {
            st.fail(`Graph Subscription failed: ${e}`);
        }
        st.end();
    });
});
