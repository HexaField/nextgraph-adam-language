import { spawnLinkAgent } from '@coasys/ad4m-test/helpers';
import { expect } from 'chai';

describe("NextGraph Multi-Agent Neighbourhood", () => {
    it("Two agents can join the same neighbourhood and sync links", async function() {
        this.timeout(60000); // Give plenty of time for sync

        console.log("Starting Agent Alice...");
        const alice = await spawnLinkAgent();
        console.log("Alice started.");
        
        console.log("Starting Agent Bob...");
        const bob = await spawnLinkAgent();
        console.log("Bob started.");

        // Alice is the creator. Her neighbourhood is the one we use.
        // spawnLinkAgent creates a neighbourhood and returns the wrapper.
        // wrapper.neighbourhood is the Shared URL.
        const sharedUrl = alice.neighbourhood;
        console.log("Shared URL:", sharedUrl);

        // Bob joins Alice's neighbourhood
        console.log("Bob joining Alice's neighbourhood...");
        const joinedResult = await bob.client.neighbourhood.joinFromUrl(sharedUrl);
        const bobPerspectiveUuid = joinedResult.uuid;
        console.log("Bob joined with perspective UUID:", bobPerspectiveUuid);

        // Allow some time for initial graph sync (if any)
        await new Promise(r => setTimeout(r, 2000));

        // Alice adds a link
        console.log("Alice adding a link...");
        const link = { 
            source: "root", 
            predicate: "test:predicate", 
            target: "test:value" 
        };
        await alice.addLink(link);
        console.log("Link added by Alice.");
        
        // Wait for sync
        console.log("Waiting for sync (5s)...");
        await new Promise(r => setTimeout(r, 5000));

        // Bob checks for the link
        console.log("Bob querying links...");
        const links = await bob.client.perspective.queryLinks(bobPerspectiveUuid, {});
        console.log(`Bob found ${links.length} links.`);
        
        // Find our link
        const found = links.find(l => 
            l.data.source === "root" && 
            l.data.predicate === "test:predicate" && 
            l.data.target === "test:value"
        );
        
        if (found) {
            console.log("Success! Link found by Bob.");
        } else {
            console.log("Link NOT found. Links present:", JSON.stringify(links, null, 2));
        }

        expect(found).to.exist;
    });
});
