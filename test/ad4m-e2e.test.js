import { spawnExpressionAgent } from '@coasys/ad4m-test/helpers';

describe("NextGraph Expression Language", () => {
  it("should create and retrieve an expression", async () => {
    const agent = await spawnExpressionAgent();

    const content = { text: "Hello E2E" };
    const address = await agent.create(content);

    console.log("Created Expression Address:", address);

    const expression = await agent.get(address);
    console.log("Retrieved Expression:", expression);

    const data = typeof expression.data === 'string' ? JSON.parse(expression.data) : expression.data;
    expect(data.text).toBe("Hello E2E");
  });
});
