// Utilities for converting between AD4M URIs and NextGraph URIs

export function ad4mAddrToNextGraph(addr: string): string {
  // AD4M address might be "did:ng:..." or something else
  // If it's a generic AD4M hash, we might need to look it up.
  // But plan says "AD4M addresses will map 1:1 to NextGraph URIs"
  return addr;
}

export function nextGraphUriToAd4m(ngUri: string): string {
  return ngUri;
}

export interface RepoCaps {
    repoId: string;
    readKey?: string;
    writeKey?: string;
}

export function parseRepoUri(uri: string): RepoCaps | null {
    try {
        const url = new URL(uri);
        if (url.protocol !== 'nextgraph:') return null;
        
        return {
            repoId: url.hostname, // assuming nextgraph://repo-id
            readKey: url.searchParams.get('readKey') || undefined,
            writeKey: url.searchParams.get('writeKey') || undefined
        };
    } catch (e) {
        return null;
    }
}
