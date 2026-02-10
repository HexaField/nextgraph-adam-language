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

    const signature = doc.metadata?.signature;
    const key = doc.metadata?.key;
    const author = doc.metadata?.author || "did:key:unknown";
    
    let valid = false;
    if (signature && this.context.agent && this.context.agent.verify) {
        try {
            valid = await this.context.agent.verify(signature, doc.data);
        } catch (e) {
            console.warn("Failed to verify signature:", e);
        }
    }
    
    return {
      author: author,
      timestamp: doc.metadata?.timestamp || new Date().toISOString(),
      data: doc.data,
      proof: {
          signature: signature || "",
          key: key || "",
          valid: valid,
          invalidReason: valid ? null : "Signature invalid or missing"
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

      let signature = "";
      let key = "";
      
      if (this.context.agent && this.context.agent.sign) {
          try {
              const signed = await this.context.agent.sign(content);
              signature = signed.signature;
              key = signed.key;
          } catch (e) {
              console.error("Failed to sign content:", e);
          }
      }

      // Store the content with metadata
      await nextGraph.docPut(nuri, content, { author, timestamp, signature, key });
      
      return nuri;
    }
  }
}
