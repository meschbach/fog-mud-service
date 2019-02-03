const {expect} = require("chai");
const {fake} = require("sinon");

const {MemoryEventStore} = require("../test-junk");
const {NodesEventStore} = require("../../metadata/data-store");

describe("Given an empty event machine", function () {
	describe('When asked for the nodes', function () {
		it("gives no nodes", async function(){
			const memoryStore = new MemoryEventStore();
			const nodesStore = new NodesEventStore(memoryStore);
			const nodes = await nodesStore.allNodes();
			expect(nodes).to.deep.eq([]);
		});
	});

	describe("When registering a new node", function(){
		it("shows as on-line", async function () {
			const memoryStore = new MemoryEventStore();
			const nodesStore = new NodesEventStore(memoryStore);

			const exampleName = "test-node";
			const availableSize = 4096;
			await nodesStore.registerNode("test-node", availableSize, {protocol:"in-process"} );

			const nodes = await nodesStore.onlineNodes();
			expect(nodes).to.deep.eq([{name: exampleName, spaceAvailable: availableSize, online: true, address: {protocol:"in-process"}}]);
		});

		describe("And allocating space available space from the node", function(){
			it("reflects the smaller space", async function(){
				const memoryStore = new MemoryEventStore();
				const nodesStore = new NodesEventStore(memoryStore);

				const exampleName = "test-node";
				const availableSize = 4096;
				await nodesStore.registerNode("test-node", availableSize, {protocol:"in-process"} );

				const usedSpace = 2048;
				await nodesStore.usedSpace( exampleName, usedSpace);

				const nodes = await nodesStore.onlineNodes();
				expect(nodes).to.deep.eq([{name: exampleName, spaceAvailable: availableSize - usedSpace, online: true, address: {protocol:"in-process"}}]);
			});
		});
	});


	describe("When the node goes offline", function(){
		it("is no longer available", async function(){
			const memoryStore = new MemoryEventStore();
			const nodesStore = new NodesEventStore(memoryStore);

			const exampleName = "test-node";
			const availableSize = 4096;
			await nodesStore.registerNode(exampleName, availableSize, {protocol:"in-process"} );
			await nodesStore.offline(exampleName);

			const nodes = await nodesStore.onlineNodes();
			expect(nodes).to.deep.eq([]);
		})
	});
});
