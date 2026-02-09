
import { spawnExpressionAgent } from '@coasys/ad4m-test/helpers';

describe("NextGraph Expression Language", () => {
  it("should create and retrieve an expression", async () => {
    // Spawn an agent with the language (loaded from bundle passed via CLI)
    const agent = await spawnExpressionAgent();

    const content = { text: "Hello E2E" };
    // create(content) returns an Address (string)
    const address = await agent.create(content);

    if (!address) {
        throw new Error("Created address is null/undefined");
    }
    console.log("Created Expression Address:", address);

    // get(address) returns Expression object
    const expression = await agent.get(address);
    if (!expression) {
        throw new Error("Retrieved expression is null");
    }
    
    console.log("Retrieved Expression:", expression);

    // Verify content
    if (expression.data.text !== "Hello E2E") {
        throw new Error(`Content mismatch. Expected 'Hello E2E', got '${expression.data.text}'`);
    }
  });
});
