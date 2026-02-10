import type { ExpressionAdapter, Expression, Address, PublicSharing } from '@coasys/ad4m';
import { nextGraph } from './nextgraph-client.js';

export class NextGraphAdapter implements ExpressionAdapter {
  constructor(private context: any) {
    if (context && context.storageDirectory) {
        nextGraph.init(context.storageDirectory, context.agent?.did);
    }
  }

  async get(address: Address): Promise<Expression | null> {
    const doc = await nextGraph.docGet(address);
    if (!doc) return null;
    
    return {
      author: doc.metadata?.author || "did:key:unknown",
      timestamp: doc.metadata?.timestamp || new Date().toISOString(),
      data: doc.data,
      proof: {
          signature: "mock-sig",
          key: "mock-key",
          valid: true,
          invalidReason: null
      }
    } as Expression;
  }

  putAdapter: PublicSharing = {
    createPublic: async (content: object): Promise<Address> => {
      // Create a document
      // Use undefined sessionId to use the active session
      // Use "store" destination and "private" storeType
      // Use "YMap" and "DOM" as confirmed working combination
      const nuri = await nextGraph.docCreate(undefined, "YMap", "DOM", "store", "private", undefined);
      
      const author = this.context.agent.did;
      const timestamp = new Date().toISOString();

      // Store the content with metadata
      await nextGraph.docPut(nuri, content, { author, timestamp });
      
      return nuri;
    }
  }
}
