const {NodesHTTPClient} = require("../../client/nodes");
// In process framework
const {inPorcessService} = require("../../in-proc");
//Test support
const {createTestLogger} = require("./test-junk");

const {expect} = require("chai");

describe("As a client", function(){
	describe("Given a registered node", function(){
		describe("When listed", function () {
			it("Provides the registered node", async function() {
				const logger = createTestLogger("node-list");
				const service = await inPorcessService( logger );
				try {
					const serviceAddress = service.metadataAddress;
					const addr = "http://" + serviceAddress.address + ":" +serviceAddress.port;
					const nodeClient = new NodesHTTPClient(addr, logger);
					const nodes = await nodeClient.allNodes();
					expect(nodes.map((m) => m.name)).to.deep.eq(["default"]);
				}finally {
					await service.stop();
				}
			})
		});

		describe("When increasing the limit", async function(){
			it("has an increase", async function(){
				const registeredCapacity = 10 * 1024 * 1024;
				const increaseInSize = 11 * 1024 * 1024;

				const logger = createTestLogger("node-capacity");
				const service = await inPorcessService( logger );
				try {
					const serviceAddress = service.metadataAddress;
					const addr = "http://" + serviceAddress.address + ":" +serviceAddress.port;
					const nodeClient = new NodesHTTPClient(addr, logger);
					const capacityIncrease = await nodeClient.increaseNodeCapacity("default", increaseInSize);
					expect(capacityIncrease.spaceAvailable).to.eq(registeredCapacity + increaseInSize);
				}finally {
					await service.stop();
				}
			});
		});
	});
});