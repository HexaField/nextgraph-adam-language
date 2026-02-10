import { type LinkSyncAdapter, Perspective, type PerspectiveDiff, type PerspectiveDiffObserver, type SyncStateChangeObserver, type DID, PerspectiveState } from '@coasys/ad4m';
import { nextGraph } from './nextgraph-client.js';

export class NextGraphLinksAdapter implements LinkSyncAdapter {
  private diffObservers: PerspectiveDiffObserver[] = [];
  private syncStateObservers: SyncStateChangeObserver[] = [];
  private localAgents: DID[] = [];
  private state: PerspectiveState = PerspectiveState.LinkLanguageInstalledButNotSynced; 

  
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
        console.log("NextGraph Repo ready:", repoId);
        nextGraph.graphSubscribe(repoId);
        this.updateState(PerspectiveState.Synced);
    }).catch(e => {
        console.error("Failed to initialize NextGraph repo in LinksAdapter:", e);
    });
    
    // Subscribe to NextGraph updates
    nextGraph.onGraphUpdate((repoId, additions, removals) => {
        if (repoId !== this.repoId) return;

        const diff: PerspectiveDiff = {
            additions: additions.map((t: any) => ({
                author: t.author || "did:ng:unknown-author",
                timestamp: t.timestamp || new Date().toISOString(),
                data: { source: t.subject, predicate: t.predicate, target: t.object },
                proof: { 
                    signature: t.signature || "", 
                    key: t.key || "", 
                    valid: true // Assume valid for now, usually verify() would check this
                },
                hash: () => 0
            })) as any[],
            removals: removals.map((t: any) => ({
                author: t.author || "did:ng:unknown-author",
                timestamp: t.timestamp || new Date().toISOString(),
                data: { source: t.subject, predicate: t.predicate, target: t.object },
                proof: { 
                     signature: t.signature || "", 
                     key: t.key || "", 
                     valid: true 
                },
                hash: () => 0
            })) as any[]
        };
        
        // Notify AD4M
        this.diffObservers.forEach(cb => cb(diff));
    });
  }

  setLocalAgents(agents: DID[]): void {
      this.localAgents = agents;
      console.log("NextGraphLinksAdapter: updated local agents", this.localAgents);
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
    return "mock-revision";
  }

  async sync(): Promise<PerspectiveDiff> {
    // NextGraph handles sync in background.
    // We might return latest changes here if any.
    // Ensure we are acting on behalf of localAgents if active actions are taken
    if (this.localAgents.length > 0) {
        // console.debug("Syncing for agents:", this.localAgents);
    }
    return { additions: [], removals: [] };
  }

  async render(): Promise<Perspective> {
    const triples = await nextGraph.graphGetTriples(this.repoId);
    const links: any[] = triples.map((t: any) => ({
        author: t.author || "did:ng:unknown",
        timestamp: t.timestamp || new Date().toISOString(),
        data: {
            source: t.subject,
            predicate: t.predicate,
            target: t.object
        },
        proof: { 
            signature: t.signature || "", 
            key: t.key || "", 
            valid: true 
        }
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

    return await nextGraph.graphUpdate(this.repoId, additions, removals);
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
