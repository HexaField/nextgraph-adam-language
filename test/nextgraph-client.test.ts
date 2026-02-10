import { describe, it, expect, beforeAll } from 'vitest';
import { nextGraph } from '../src/nextgraph-client.ts';
import * as fs from 'fs';

describe('NextGraph Client Wrapper Tests', () => {
    beforeAll(() => {
        // Reset singleton state
        (nextGraph as any).session = undefined;
        (nextGraph as any).userId = undefined;
        (nextGraph as any).walletName = undefined;
        (nextGraph as any)._repoId = undefined;
        (nextGraph as any).initPromise = null;
        (nextGraph as any).initialized = false;

        if (fs.existsSync('/tmp/test-client')) {
            fs.rmSync('/tmp/test-client', { recursive: true, force: true });
        }
    });

    it('Initialization', async () => {
        try {
            await nextGraph.init('/tmp/test-client');
        } catch (e) {
            throw new Error(`Initialization failed: ${e}`);
        }
    });

    it('Create Repo', async () => {
        try {
            const repoId = await nextGraph.createRepo();
            expect(repoId.startsWith('did:ng:repo'), 'Repo ID should start with did:ng:repo').toBeTruthy();
        } catch (e) {
            throw new Error(`Create Repo failed: ${e}`);
        }
    });

    it('Document Operations', async () => {
        try {
            // docCreate(sessionId, crdt, className, destination, storeType, storeRepo)
            // defaults: sessionId=internal, crdt="YMap", className="DOM", destination="store", storeType="private", storeRepo=undefined
            const nuri = await nextGraph.docCreate(undefined, "YMap", "DOM", "store", "private", undefined);
            expect(nuri.startsWith('did:ng:'), `docCreate returned valid NURI: ${nuri}`).toBeTruthy();
            
            // docPut(nuri, data, metadata)
            const data = { content: "Hello NextGraph" };
            await nextGraph.docPut(nuri, data);

            // docGet(nuri)
            const result = await nextGraph.docGet(nuri);
            expect(result.metadata, 'docGet returned metadata').toBeTruthy();
            expect(result.data, 'docGet returned stored data').toEqual(data);
            
        } catch (e) {
            throw new Error(`Document operations failed: ${e}`);
        }
    });

    it('Graph Subscription', async () => {
        try {
            const repoId = await nextGraph.createRepo();
            await nextGraph.graphSubscribe(repoId);
        } catch (e) {
            throw new Error(`Graph Subscription failed: ${e}`);
        }
    });
});
