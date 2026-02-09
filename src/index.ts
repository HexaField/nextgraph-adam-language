import type { Language, LanguageContext, Interaction } from '@coasys/ad4m';
import { NextGraphAdapter } from './adapter.js';
import { NextGraphLinksAdapter } from './links.js';
import { nextGraph } from './nextgraph-client.js';

function create(context: LanguageContext): Language {
  // Initialize NextGraph client with storage directory and Agent DID
  // Note: context.storageDirectory might be where we store local data
  nextGraph.init(context.storageDirectory, context.agent.did);

  const expressionAdapter = new NextGraphAdapter(context);
  const linksAdapter = new NextGraphLinksAdapter(context);

  return {
    name: 'nextgraph-ad4m-language',
    expressionAdapter,
    linksAdapter,
    interactions: (expression) => [],
  } as Language;
}

export const name = 'nextgraph-ad4m-language';
export default create;
