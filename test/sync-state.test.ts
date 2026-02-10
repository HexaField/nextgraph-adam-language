import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextGraphLinksAdapter } from '../src/links.js';
import { PerspectiveState } from '@coasys/ad4m';

// Mock the NextGraph client
vi.mock('../src/nextgraph-client.js', () => ({
    nextGraph: {
        init: vi.fn(),
        // We use a promise we can resolve/reject manually to control timing
        createRepo: vi.fn(),
        repoId: 'did:ng:repo:test',
        graphSubscribe: vi.fn(),
        onGraphUpdate: vi.fn(),
        graphGetTriples: vi.fn().mockResolvedValue([]),
    }
}));

import { nextGraph } from '../src/nextgraph-client.js';

describe('NextGraph Sync State Management', () => {
    let adapter: NextGraphLinksAdapter;
    const mockContext = {
        storageDirectory: '/tmp/test-sync-state',
        agent: { did: 'did:key:initial-agent' },
        templateData: { name: 'SyncStateTest' }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset initPromise or similar in real code if needed, 
        // but here we are mocking methods.
    });

    it('Spec 1: Should emit LinkLanguageInstalledButNotSynced initially', () => {
        // Setup createRepo to hang so we can check initial state before it resolves
        (nextGraph.createRepo as any).mockReturnValue(new Promise(() => {}));

        adapter = new NextGraphLinksAdapter(mockContext);
        
        const callback = vi.fn();
        adapter.addSyncStateChangeCallback(callback);

        // Should be called immediately with initial state
        expect(callback).toHaveBeenCalledWith(PerspectiveState.LinkLanguageInstalledButNotSynced);
    });

    it('Spec 2: Should emit Synced when repo is ready', async () => {
        // Setup createRepo to resolve immediately-ish
        let resolveRepo: (val: string) => void;
        const repoPromise = new Promise<string>(r => { resolveRepo = r; });
        (nextGraph.createRepo as any).mockReturnValue(repoPromise);

        adapter = new NextGraphLinksAdapter(mockContext);
        
        const callback = vi.fn();
        adapter.addSyncStateChangeCallback(callback);

        // Initial state check
        expect(callback).toHaveBeenCalledWith(PerspectiveState.LinkLanguageInstalledButNotSynced);

        // Trigger repo ready
        resolveRepo!('did:ng:new-repo');
        
        // Wait for microtasks
        await new Promise(r => setTimeout(r, 0));

        expect(callback).toHaveBeenCalledWith(PerspectiveState.Synced);
    });

    it('Spec 3: Should not emit Synced if repo creation fails', async () => {
        // Setup createRepo to reject
        let rejectRepo: (err: any) => void;
        const repoPromise = new Promise<string>((_, r) => { rejectRepo = r; });
        (nextGraph.createRepo as any).mockReturnValue(repoPromise);

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        adapter = new NextGraphLinksAdapter(mockContext);
        
        const callback = vi.fn();
        adapter.addSyncStateChangeCallback(callback);

        rejectRepo!(new Error("Connection failed"));
        
        await new Promise(r => setTimeout(r, 0));

        // Should call initial, but NOT Synced
        expect(callback).toHaveBeenCalledWith(PerspectiveState.LinkLanguageInstalledButNotSynced);
        expect(callback).not.toHaveBeenCalledWith(PerspectiveState.Synced);
        
        consoleSpy.mockRestore();
    });
});
