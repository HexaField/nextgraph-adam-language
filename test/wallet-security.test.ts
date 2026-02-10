import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock dependencies
const mockNg = {
    wallet_read_file: vi.fn(),
    wallet_open_with_password: vi.fn(),
    wallet_import: vi.fn(),
    session_start: vi.fn(),
    wallet_create: vi.fn(), // Note: code uses wallet_create, not wallet_create_v0
    wallet_create_v0: vi.fn(), 
    wallet_export: vi.fn(),
    verifier_create: vi.fn(),
    test: vi.fn().mockResolvedValue(undefined),
    sparql_query: vi.fn(),
    doc_create: vi.fn(),
    doc_put: vi.fn(),
    doc_get: vi.fn()
};

// Mock nextgraph package
vi.mock('@ng-org/nextgraph', () => mockNg);

// Mock fs
vi.mock('fs', async () => {
    const existsSync = vi.fn();
    const readFileSync = vi.fn();
    const writeFileSync = vi.fn();
    const mkdirSync = vi.fn();
    return {
        existsSync,
        readFileSync,
        writeFileSync,
        mkdirSync,
        default: {
            existsSync,
            readFileSync,
            writeFileSync,
            mkdirSync,
        }
    };
});

// Mock console to reduce noise
// global.console = { ...global.console, log: vi.fn(), error: vi.fn(), warn: vi.fn() };

describe('Wallet Password Security', () => {
    let NextGraphClient: any;
    
    // Setup environment
    const storageDir = '/tmp/test-storage';
    const walletPath = path.join(storageDir, 'wallet.ng');
    const secretPath = path.join(storageDir, 'wallet.ng.secret');
    const walletNamePath = path.join(storageDir, 'wallet.ng.name');

    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset singleton instance if possible or re-import
        // Since nextGraph is a singleton exported instance, we might need to reset its state manually if exposed, 
        // or rely on method calls doing the right thing with mocked fs.
        
        // We really want to test the class logic. 
        // Ideally we would import the class, but the file exports an instance.
        // Let's assume we can interact with the exported "nextGraph" instance.
        
        // Dynamic import to allow re-evaluation if needed (though es modules cache)
        const module = await import('../src/nextgraph-client.js');
        NextGraphClient = module.nextGraph;
        
        // Reset internal state if possible. 
        // The class has `initialized` flag. 
        // We can just test the `createRepo` logic flow by manipulating fs mocks.
        
        // We need to re-init with our storage dir
        try {
            NextGraphClient.init(storageDir, 'did:test:user');
        } catch(e) {}
    });

    it('Spec 1: Should generate and save a random password when creating new wallet', async () => {
        // Setup: No existing wallet
        (fs.existsSync as any).mockReturnValue(false);
        
        // Mock success path for creation
        mockNg.wallet_create.mockResolvedValue({
            wallet_name: 'new-wallet',
            user: 'user-id',
            wallet_file: new Uint8Array([1,2,3]),
            client: { user: 'user-id', id: 'user-id' }
        }); 
        mockNg.session_start.mockResolvedValue({ session_id: 'sess1' });
        
        // Execute
        await NextGraphClient.createRepo({ name: 'test-repo' });
        
        // Assert: Check if password file was written
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            secretPath, 
            expect.any(String), // The password
            'utf-8'
        );
        
        // Verify password is not the hardcoded default
        const callArgs = (fs.writeFileSync as any).mock.calls.find((call: any[]) => call[0] === secretPath);
        const savedPassword = callArgs[1];
        expect(savedPassword).not.toBe('nextgraph-ad4m-secret');
        expect(savedPassword.length).toBeGreaterThan(10);
    });

    it('Spec 2: Should read password from file when loading existing wallet', async () => {
        // Setup: Existing wallet files
        (fs.existsSync as any).mockImplementation((path: string) => {
            return [walletPath, walletNamePath, secretPath].includes(path);
        });
        
        const mockPassword = "random-secure-password-123";
        (fs.readFileSync as any).mockImplementation((path: string) => {
            if (path === secretPath) return mockPassword;
            if (path === walletNamePath) return "test-wallet";
            if (path === walletPath) return Buffer.from([]);
            return "";
        });

        // Mock ng operations
        mockNg.wallet_read_file.mockResolvedValue({});
        const mockOpenedWallet = {};
        mockNg.wallet_open_with_password.mockResolvedValue(mockOpenedWallet);
        mockNg.wallet_import.mockResolvedValue({ id: 'user1' });
        mockNg.session_start.mockResolvedValue({ session_id: 'sess1' });

        // Execute
        // Reset session on client to force reload
        NextGraphClient.session = undefined;
        await NextGraphClient.createRepo();

        // Assert
        expect(fs.readFileSync).toHaveBeenCalledWith(secretPath, 'utf-8');
        expect(mockNg.wallet_open_with_password).toHaveBeenCalledWith(
            expect.anything(),
            mockPassword
        );
    });
});
