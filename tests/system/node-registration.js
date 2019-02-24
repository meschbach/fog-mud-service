const {createTestLogger} = require("./test-junk");
const {Context} = require("junk-bucket/context");
const {newTemporaryLevelDB} = require("../../junk/leveldb");
const {LevelUpEventStore} = require("../../junk/event-store-level");
const {EventMetadataStore, NodesEventStore} = require('../../metadata/data-store');
const {http_v1} = require("../../metadata");
const {MudHTTPClient} = require("../../client");
const {expect} = require("chai");

async function newMetadataNode( parentContext ){
	const context = parentContext.subcontext("metadata");
	const db = await newTemporaryLevelDB(context);
	const eventsStorage = new LevelUpEventStore(db);
	const metadataStorage = new EventMetadataStore(eventsStorage, context.logger.child({service:"metadata", component: "event storage"}));
	const nodesStorage = new NodesEventStore(eventsStorage);

	const coordinator = {
		storage: metadataStorage,
		nodesStorage
	};
	const metaData = await http_v1(context.logger.child({app: 'metadata', port: 0}), coordinator, {port: 0});
	context.metadata = metaData;
	context.metadataAdress = await metaData.address;
	context.onCleanup(async () => {
		await metaData.end();
	});
	const metadataAddress = await metaData.address;
	const client = new MudHTTPClient("http://127.0.0.1:"+ metadataAddress.port, context.logger.child({proto: "httpv1.1/metadata"}));
	return client;
}

describe( "Given an instance of the system without nodes", function() {
	beforeEach(async function(){
		const logger = createTestLogger("no-nodes", false);
		const context = new Context("no-nodes", logger);
		this.context = context;
		this.metadata = await newMetadataNode(context);
	});
	afterEach(async function(){
		this.context.cleanup()
	});

	describe("When asked to store an object", function(){
		it("refuses", async function () {
			try {
				await this.metadata.store_value( "test", "key","is going to fail");
				expect("Failed to throw").to.be.false();
			}catch(e){
				//Passed
			}
		});
	});
});
