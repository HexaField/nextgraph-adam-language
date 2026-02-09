// Type definitions for NextGraph AD4M Language

export interface NextGraphConfig {
  repoId?: string;
  readKey?: string;
  writeKey?: string;
}

export interface NextGraphClient {
    init(path: string, identity?: string): Promise<void>;
    createRepo(): Promise<string>;
    docCreate(sessionId: any, crdt: string, className: string, destination: string, storeType: any, storeRepo: any): Promise<any>;
}
