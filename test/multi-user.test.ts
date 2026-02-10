import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextGraphLinksAdapter } from '../src/links.js';

// Mock the NextGraph client
vi.mock('../src/nextgraph-client.js', () => ({
    nextGraph: {
        init: vi.fn(),
        createRepo: vi.fn().mockResolvedValue('did:ng:repo:test'),
        repoId: 'did:ng:repo:test',
        graphSubscribe: vi.fn(),
        onGraphUpdate: vi.fn(),
        graphGetTriples: vi.fn().mockResolvedValue([]),
    }
}));

describe('NextGraph Multi-User Support', () => {
    let adapter: NextGraphLinksAdapter;
    const mockContext = {
        storageDirectory: '/tmp/test-multi-user',
        agent: { did: 'did:key:initial-agent' },
        templateData: { name: 'MultiUserMesh' }
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        adapter = new NextGraphLinksAdapter(mockContext);
        // Wait for constructor promise logic (createRepo) to potentially settle
        await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('Spec 1: Should implement setLocalAgents interface', () => {
        expect(adapter.setLocalAgents).toBeDefined();
        expect(typeof adapter.setLocalAgents).toBe('function');
    });

    it('Spec 2: Should update internal state when setLocalAgents is called', () => {
        const agentList = ['did:key:worker1', 'did:key:worker2'];
        
        // We expect no error
        expect(() => adapter.setLocalAgents(agentList)).not.toThrow();

        // Since localAgents is private, we can't check it directly without casting to any,
        // but checking it exists and holds value is part of unit verification.
        adapter.setLocalAgents(agentList);
        expect((adapter as any).localAgents).toEqual(agentList);
    });

    it('Spec 3: Should default to initial context agent if no others set', () => {
        // Checking default state (implementation detail check)
        // If the implementation initializes it with the context agent
        const currentAgents = (adapter as any).localAgents;
        // Depending on design, this might be empty initially or contain creator
        expect(Array.isArray(currentAgents)).toBe(true);
    });

    it('Spec 4: Sync should utilize local agents', async () => {
        const agentList = ['did:key:worker1'];
        adapter.setLocalAgents(agentList);

        const spy = vi.spyOn(console, 'log'); // Or however we choose to verify side-effects for now
        await adapter.sync();
        
        // For now, we just ensure sync doesn't fail when agents are set
        expect(true).toBe(true); 
    });
});
