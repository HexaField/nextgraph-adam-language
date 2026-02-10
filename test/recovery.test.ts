import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextGraph, NextGraphClientWrapper } from '../src/nextgraph-client.js';

// Mock Dependencies
const mockNg = vi.hoisted(() => ({
    wallet_create: vi.fn(),
    wallet_open_with_password: vi.fn(),
    wallet_import: vi.fn(),
    wallet_read_file: vi.fn(),
    session_start: vi.fn(),
    graph_get_triples: vi.fn(),
    graph_subscribe: vi.fn(),
    doc_subscribe: vi.fn(),
    doc_create: vi.fn(),
    test: vi.fn(),
    sparql_update: vi.fn(),
    sparql_query: vi.fn(),
    Verifier: {
        verify: vi.fn().mockReturnValue(true)
    }
}));

vi.mock('@ng-org/nextgraph', () => mockNg);

// Mock FS
const mockFs = vi.hoisted(() => {
    const fns = {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        renameSync: vi.fn(),
        mkdirSync: vi.fn(), // Added for completeness if client tries to make dir
    };
    return {
        default: fns,
        ...fns
    };
});
vi.mock('fs', () => mockFs);

describe('NextGraph Wallet Recovery', () => {
    let client: NextGraphClientWrapper;

    beforeEach(() => {
        vi.clearAllMocks();
        client = nextGraph; // Singleton
        // Reset singleton state manually for isolation
        (client as any).session = undefined;
        (client as any).walletName = "";
        (client as any).userId = null;
        (client as any)._repoId = null;
        (client as any).initPromise = null;
        (client as any).initialized = false;
    });

    it('Should recover from corrupted wallet file by creating a new one', async () => {
        const walletPath = '/tmp/bad_wallet';
        
        // Mock exists = true
        mockFs.existsSync.mockReturnValue(true);
        
        // Mock read = garbage
        mockFs.readFileSync.mockReturnValue("NOT_JSON");
        
        // Mock wallet_read_file to throw (simulating corruption)
        mockNg.wallet_read_file.mockRejectedValue(new Error("Invalid wallet format"));
        
        mockNg.wallet_create.mockResolvedValue({ 
            result: 'Ok', user: 'u1', wallet_name: 'w1', wallet_file: new Uint8Array([]) 
        });

        // Mock session start for the recovery path
        mockNg.session_start.mockResolvedValue({
            session_id: "new_session",
            private_store_id: "new_store"
        });

        // Call
        await client.init(walletPath);
        await client.createRepo({ name: 'RecoveryTest' });

        // Verify renameSync was called.
        expect(mockFs.renameSync.mock.calls.length).toBeGreaterThan(0);
        
        const expectedWalletFile = walletPath + "/wallet.ng";
        const renameCalls = mockFs.renameSync.mock.calls;
        // Find the call that renamed the wallet file (there might be others for .name, .secret)
        const walletRenameCall = renameCalls.find(args => args[0] === expectedWalletFile);
        
        expect(walletRenameCall).toBeDefined();
        // Regex for backup filename
        const backupPathRegex = /\.bak-.*\.ng$/;
        expect(walletRenameCall![1]).toMatch(backupPathRegex);

        
        // Expect creation of new wallet
        expect(mockNg.wallet_create).toHaveBeenCalled();
    });
});
