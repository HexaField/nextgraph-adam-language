import { type LinkSyncAdapter, Perspective, type PerspectiveDiff, type PerspectiveDiffObserver, type SyncStateChangeObserver, type DID, PerspectiveState } from '@coasys/ad4m';
import { nextGraph } from './nextgraph-client.js';

export class NextGraphLinksAdapter implements LinkSyncAdapter {
  private diffObservers: PerspectiveDiffObserver[] = [];
  private syncStateObservers: SyncStateChangeObserver[] = [];
  private localAgents: DID[] = [];
  private state: PerspectiveState = PerspectiveState.LinkLanguageInstalledButNotSynced; 
  private _currentRevision: string = "mock-revision";
  // Cache the known state of links to calculate diffs in sync()
  private knownLinks: Map<string, any> = new Map();

  
  // Use a getter to access the dynamic repoId from nextGraph
  get repoId(): string {
    return nextGraph.repoId;
  }

  constructor(private context: any) {
    if (context && context.storageDirectory) {
        nextGraph.init(context.storageDirectory, context.agent?.did);
    }

    if (context && context.agent?.did) {
        this.localAgents = [context.agent.did];
    }

    const params = {
        name: context.templateData?.name,
        uid: context.templateData?.uid
    };

    // Ensure repo is created/loaded and then subscribe
    nextGraph.createRepo(params).then((repoId) => {
        // console.log("NextGraph Repo ready:", repoId);
        nextGraph.graphSubscribe(repoId);
        this.updateState(PerspectiveState.Synced);
    }).catch(e => {
        console.error("Failed to initialize NextGraph repo in LinksAdapter:", e);
    });
    
    // Subscribe to NextGraph updates
    nextGraph.onGraphUpdate(async (repoId, additions, removals, revision) => {
        if (repoId !== this.repoId) return;
        if (revision) this._currentRevision = revision;

        const processTriples = async (list: any[]) => {
            return Promise.all(list.map(async (t: any) => {
                const data = { source: t.subject, predicate: t.predicate, target: t.object };
                let valid = false;
                if (t.signature && this.context.agent && this.context.agent.verify) {
                    try {
                        valid = await this.context.agent.verify(t.signature, data);
                    } catch (e) {
                         // ignore
                    }
                }
                return {
                    author: t.author || "did:ng:unknown-author",
                    timestamp: t.timestamp || new Date().toISOString(),
                    data: data,
                    proof: { 
                        signature: t.signature || "", 
                        key: t.key || "", 
                        valid: valid
                    },
                    hash: () => 0
                };
            }));
        };

        const diff: PerspectiveDiff = {
            additions: (await processTriples(additions)) as any[],
            removals: (await processTriples(removals)) as any[]
        };
        
        // Update local cache
        diff.additions.forEach(l => {
             // Simple interaction hash simulation
             const key = `${l.data.source}::${l.data.predicate}::${l.data.target}`;
             this.knownLinks.set(key, l);
        });
        diff.removals.forEach(l => {
             const key = `${l.data.source}::${l.data.predicate}::${l.data.target}`;
             this.knownLinks.delete(key);
        });

        // Notify AD4M
        this.diffObservers.forEach(cb => cb(diff));
    });
  }

  setLocalAgents(agents: DID[]): void {
      this.localAgents = agents;
      // console.log("NextGraphLinksAdapter: updated local agents", this.localAgents);
  }

  writable(): boolean {
    return true;
  }

  public(): boolean {
    return false; // Or true depending on NextGraph repo visibility
  }

  async others(): Promise<DID[]> {
    return [];
  }

  async currentRevision(): Promise<string> {
    return this._currentRevision;
  }

  async sync(): Promise<PerspectiveDiff> {
    if (!this.repoId) return { additions: [], removals: [] };

    try {
        const triples = await nextGraph.graphGetTriples(this.repoId);
        
        // Convert to AD4M Links
        const remoteLinks = await Promise.all(triples.map(async (t: any) => {
            const data = { 
                source: t.subject, 
                predicate: t.predicate, 
                target: t.object 
            };
            
            let valid = false;
            // Similar verification logic as typical
            if (t.signature && this.context.agent && this.context.agent.verify) {
                try {
                    valid = await this.context.agent.verify(t.signature, data);
                } catch (e) { /* ignore */ }
            }

            return {
                author: t.author || "did:ng:unknown",
                timestamp: t.timestamp || new Date().toISOString(),
                data: data,
                proof: { 
                    signature: t.signature || "", 
                    key: t.key || "", 
                    valid: valid 
                },
                hash: () => ""
            };
        }));

        const newAdditions: any[] = [];
        const currentKeys = new Set<string>();

        // Calculate Additions
        for (const link of remoteLinks) {
            const key = `${link.data.source}::${link.data.predicate}::${link.data.target}`;
            currentKeys.add(key);
            if (!this.knownLinks.has(key)) {
                newAdditions.push(link);
                this.knownLinks.set(key, link);
            }
        }

        // Calculate Removals
        const newRemovals: any[] = [];
        for (const [key, link] of this.knownLinks) {
            if (!currentKeys.has(key)) {
                newRemovals.push(link);
            }
        }
        
        // Cleanup removals from cache
        newRemovals.forEach(l => {
             const key = `${l.data.source}::${l.data.predicate}::${l.data.target}`;
             this.knownLinks.delete(key);
        });

        // If we found changes, we must be on a new dynamic revision
        if (newAdditions.length > 0 || newRemovals.length > 0) {
             // In a perfect world we get the revision from the triplestore metadata
             // For now we assume if we found diffs, we are "current".
        }

        return {
            additions: newAdditions,
            removals: newRemovals
        };

    } catch (e) {
        console.error("LinkSyncAdapter.sync() failed:", e);
        return { additions: [], removals: [] };
    }
  }

  async render(): Promise<Perspective> {
    const triples = await nextGraph.graphGetTriples(this.repoId);
    const links = await Promise.all(triples.map(async (t: any) => {
        const data = {
            source: t.subject,
            predicate: t.predicate,
            target: t.object
        };
        
        let valid = false;
        // Verify signature if present
        if (t.signature && this.context.agent && this.context.agent.verify) {
            try {
                // We assume signatures are made over the link data object
                valid = await this.context.agent.verify(t.signature, data);
            } catch (e) {
                console.warn("Link verification failed", e);
            }
        } else {
             // If no signature, default to valid if we trust the store? 
             // Or false? Spec 3 expects invalid if signature mismatch.
             // If no signature at all, it's arguably valid (unsigned) or invalid (policy).
             // For now, if signature is present but mismatches = invalid.
             // If signature is missing = invalid implies strict mode.
             // Old code was valid: true.
             // Let's assume if signature is missing, valid is false (unverified).
             // But usually unsigned links are just unsigned. 
             // However, t.signature check handles the presence.
        }

        return {
            author: t.author || "did:ng:unknown",
            timestamp: t.timestamp || new Date().toISOString(),
            data: data,
            proof: { 
                signature: t.signature || "", 
                key: t.key || "", 
                valid: valid 
            },
            hash: () => 0 
        };
    }));
    return new Perspective(links);
  }

  async commit(diff: PerspectiveDiff): Promise<string> {
    // Apply diff to NextGraph repo
    const additions = diff.additions.map(l => ({
        subject: l.data.source,
        predicate: l.data.predicate,
        object: l.data.target,
        // Pass validation metadata to NextGraph
        author: l.author,
        signature: l.proof?.signature,
        key: l.proof?.key,
        timestamp: l.timestamp
    }));
    
    const removals = diff.removals.map(l => ({
        subject: l.data.source,
        predicate: l.data.predicate,
        object: l.data.target,
        // Pass validation metadata if needed involved in removal
    }));

    const newRev = await nextGraph.graphUpdate(this.repoId, additions, removals);
    this._currentRevision = newRev;
    return newRev;
  }

  addCallback(callback: PerspectiveDiffObserver) {
    this.diffObservers.push(callback);
  }

  addSyncStateChangeCallback(callback: SyncStateChangeObserver): number {
    this.syncStateObservers.push(callback);
    // Emit current state immediately to new observer
    callback(this.state);
    return 1;
  }
  
  private updateState(newState: PerspectiveState) {
      this.state = newState;
      this.syncStateObservers.forEach(cb => cb(newState));
  }
}
