const {createTestLogger} = require("./test-junk");
const {Context} = require("junk-bucket/context");
const {newTemporaryLevelDB} = require("../../junk/leveldb");
const {LevelUpEventStore} = require("../../junk/event-store-level");
const {EventMetadataStore, NodesEventStore} = require('../../metadata/data-store');
const {http_v1} = require("../../metadata");
const {MudHTTPClient} = require("../../client");
const {expect} = require("chai");

const {CoordinatorHTTPClient} = require("../../metadata/coordinator");

const {promiseEvent} = require("junk-bucket/future");
const {delay} = require("junk-bucket/future");

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
	const controlPlane = new CoordinatorHTTPClient("http://127.0.0.1:" + metadataAddress.port, context.logger.child({proto: "http/1.1/control/v1"}));
	const client = new MudHTTPClient("http://127.0.0.1:"+ metadataAddress.port, context.logger.child({proto: "httpv1.1/metadata/v1"}));
	return {
		client,
		controlPlane
	};
}

const {contextTemporaryDirectory} = require("junk-bucket/fs");
const {localFSStorage} = require("../../node/fs-storage");
async function newFileSystemStorage( parentContext ){
	const context = parentContext.subcontext("metadata");
	const dir = await contextTemporaryDirectory(context, "fs-node");
	context.blockStorage = await localFSStorage(context.logger.child({app: 'fs-storage'}), null, { storage: dir });
	context.onCleanup(() => {
		context.blockStorage.end();
	});

	const address = await context.blockStorage.address;
	context.controlPort = address.port;
	return context;
}

describe( "Given an instance of the system without nodes", function() {
	beforeEach(async function(){
		const logger = createTestLogger("no-nodes", false);
		const context = new Context("no-nodes", logger);
		this.context = context;
		const {client, controlPlane} = await newMetadataNode(context);
		this.metadata = client;
		this.controlPlane = controlPlane;
	});
	afterEach(async function(){
		await delay(10); //TODO: Figure out the sync issue (min: 10ms) [ECONNRESET from service socket]
		await this.context.cleanup()
	});

	describe("When asked to store an object", function(){
		it("refuses", async function () {
			let threw;
			try {
				await this.metadata.store_value( "test", "key","is going to fail");
				threw = false;
			}catch(e){
				threw = true;
			}
			expect(threw).to.be.eq(true);
		});
	});

	describe("When a node is added with 1M of storage", function(){
		beforeEach(async function setupStorage() {
			this.fsNode = await newFileSystemStorage(this.context);
			await this.controlPlane.register_http("primary", "localhost", this.fsNode.controlPort, 1024 * 1024 );
		});

		it("is able to store a small string", async function(){
			await this.metadata.store_value("test", "key","should succeed");
		});

		describe( "And all space is consumed via a stream", function(){
			beforeEach(async function consumeSpace() {
				const stream = this.metadata.stream_to( "large", "blob" );
				const closingStream = promiseEvent(stream, "close");
				stream.end(Buffer.alloc(1024*1024));
				await closingStream;
			});

			it( "is out of space" , async function() {
				let threw;
				try {
					await this.metadata.store_value("south", "east", "highway");
					threw = false;
				}catch(e){
					threw = true;
				}
				expect(threw).to.be.eq(true);
			})
		});
	});
});
