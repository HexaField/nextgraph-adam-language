import { describe, it, expect, beforeEach } from 'vitest';
import { nextGraph } from '../src/nextgraph-client.ts';
import fs from 'fs';

describe('NextGraph Parameterized Client Tests', () => {
    const getTestDir = () => '/tmp/test-client-params-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

    beforeEach(() => {
        // Reset singleton state manually
        (nextGraph as any).session = undefined;
        (nextGraph as any).userId = undefined;
        (nextGraph as any).walletName = undefined;
        (nextGraph as any)._repoId = undefined;
        (nextGraph as any).initCalled = false;
        (nextGraph as any).initPromise = null;
        (nextGraph as any).initialized = false;
    });

    it('should create a wallet with specific Name (smoke test)', async () => {
        const testDir = getTestDir();
        await nextGraph.init(testDir);
        
        const params = { name: "CommunityGarden" };
        // This should pass parameters to internal wallet creation
        const repoId = await nextGraph.createRepo(params);
        
        const walletName = (nextGraph as any).walletName;
        console.log("Wallet Name (ID):", walletName);
        
        expect(repoId.startsWith('did:ng:repo')).toBeTruthy();
        expect(walletName).toBeDefined();
        expect(walletName.length).toBeGreaterThan(10);

        // Verification: ensure wallet file exists
        const walletFile = testDir + '/wallet.ng';
        expect(fs.existsSync(walletFile)).toBeTruthy();
        
        // Clean up
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch(e) {}
    });

    it('should create a wallet with UID if Name is missing (smoke test)', async () => {
        const testDir = getTestDir();
        await nextGraph.init(testDir);
        
        const params = { uid: "uid-9999" };
        const repoId = await nextGraph.createRepo(params);
        
        const walletName = (nextGraph as any).walletName;
        expect(walletName).toBeDefined();
        
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch(e) {}
    });

    it('should fall back to default if no params provided', async () => {
         const testDir = getTestDir();
        await nextGraph.init(testDir);
        
        const repoId = await nextGraph.createRepo();
        
        const walletName = (nextGraph as any).walletName;
        expect(walletName).toBeDefined();
        
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch(e) {}
    });
});
