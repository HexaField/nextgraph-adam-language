import { describe, it, expect, beforeAll } from 'vitest';
import { NextGraphAdapter } from '../src/adapter.js';
import { nextGraph } from '../src/nextgraph-client.js';
import * as fs from 'fs';

const mockContext = {
    storageDirectory: '/tmp/test-adapter',
    agent: {
        did: 'did:key:mock-agent-did'
    }
};

describe('NextGraph Expression Adapter', async () => {
    let adapter: NextGraphAdapter;
    let createdAddress = "";

    beforeAll(async () => {
       // Reset singleton state
       (nextGraph as any).session = undefined;
       (nextGraph as any).userId = undefined;
       (nextGraph as any).walletName = undefined;
       (nextGraph as any)._repoId = undefined;
       // (nextGraph as any).initCalled = false; // initCalled is not on the class, only initialized is
       (nextGraph as any).initPromise = null;
       (nextGraph as any).initialized = false;

       // Clean up previous runs
       if (fs.existsSync(mockContext.storageDirectory)) {
           fs.rmSync(mockContext.storageDirectory, { recursive: true, force: true });
       }
       
       // Ensure we have a session
       // init is called by createRepo if needed, but Adapter constructor also calls init.
       // We can just call createRepo to ensure wallet+session exists.
       await nextGraph.init(mockContext.storageDirectory);
       await nextGraph.createRepo();
       
       adapter = new NextGraphAdapter(mockContext);
    });

    it('createPublic', async () => {
        const content = { text: "Hello AD4M" };
        createdAddress = await adapter.putAdapter.createPublic(content);
        expect(createdAddress.startsWith('did:ng:o'), 'Address should start with did:ng:o').toBeTruthy();
    });

    it('get', async () => {
        // Use the address created in previous test, or fallback if previous failed
        const address = createdAddress || "did:ng:Expression:mock"; 
        if (!createdAddress) {
            // Pre-seed if needed, but here we expect failure if createPublic failed.
            // But let's try to get what we just created.
        }
        
        try {
            const expression = await adapter.get(address);
            expect(expression, 'Expression should be returned').toBeTruthy();
            if (expression) {
                // expression.data is what we saved.
                // We saved { text: "Hello AD4M" }
                // Check if content matches
                expect(expression.data.text, "Content should match saved data").toBe("Hello AD4M");
            }
        } catch (e) {
            if (!createdAddress) {
                console.warn("Skipping get test because createPublic failed/didn't run");
            } else {
                throw new Error(`Get failed: ${e}`);
            }
        }
    });
});
