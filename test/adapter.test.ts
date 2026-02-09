import test from 'tape';
import { NextGraphAdapter } from '../src/adapter.js';

const mockContext = {
    storageDirectory: '/tmp/test',
    agent: {
        did: 'did:key:mock-agent-did'
    }
};

test('NextGraph Expression Adapter', async (t) => {
    const adapter = new NextGraphAdapter(mockContext);
    let createdAddress = "";

    t.test('createPublic', async (st) => {
        const content = { text: "Hello AD4M" };
        createdAddress = await adapter.putAdapter.createPublic(content);
        st.ok(createdAddress.startsWith('did:ng:Expression'), 'Address should start with did:ng:Expression');
        st.end();
    });

    t.test('get', async (st) => {
        // Use the address created in previous test, or fallback if previous failed
        const address = createdAddress || "did:ng:Expression:mock"; 
        if (!createdAddress) {
            // Pre-seed if needed, but here we expect failure if createPublic failed.
            // But let's try to get what we just created.
        }
        
        try {
            const expression = await adapter.get(address);
            st.ok(expression, 'Expression should be returned');
            if (expression) {
                // expression.data is what we saved.
                // We saved { text: "Hello AD4M" }
                // Check if content matches
                st.equal(expression.data.text, "Hello AD4M", "Content should match saved data");
            }
        } catch (e) {
            if (!createdAddress) {
                st.pass("Skipping get test because createPublic failed/didn't run");
            } else {
                st.fail(`Get failed: ${e}`);
            }
        }
        st.end();
    });
});
