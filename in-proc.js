/*
 * An in-process version of the system.  Intended to provide a reasonable level of service for the system suitable for
 * testing components.  These tests aren't concerned with the security layer and will not configure them.
 */
const {http_v1} = require("./metadata");
const {MudHTTPClient} = require("./client");
const {localFSStorage} = require("./node/fs-storage");
const {CoordinatorHTTPClient} = require("./metadata/coordinator");

const {Context} = require("junk-bucket/context");
const {contextTemporaryDirectory} = require("junk-bucket/fs");
const {openLevelDB} = require("./junk/leveldb");
const {LevelUpEventStore} = require("./junk/event-store-level");
const {EventMetadataStore, NodesEventStore} = require('./metadata/data-store');

const {makeSubdirectory} = require("./junk");

async function inPorcessService( logger ){
	const context = new Context("In-process Mud system", logger);
	const root = await contextTemporaryDirectory(context, "mud-");

	// Create Metadata service
	const metadataDir = await makeSubdirectory(root, "metadata");
	const metaDataContext = context.subcontext("metadata");
	const metaData = await newMetadataService(metaDataContext, {metadataDir});

	// Create a new block storage node
	const fs = await makeSubdirectory(root, "fs-storage");
	const blockStorage = localFSStorage(logger.child({app: 'fs-storage'}), null, { client: "http://127.0.0.1:" + await metaData.port, storage: fs, name: 'primary' });

	//create the client
	const metadataAddress = await metaData.address;
	const client = new MudHTTPClient("http://127.0.0.1:"+ metadataAddress.port, logger.child({proto: "httpv1.1/metadata"}));

	//Register the block storage node with the client
	const blockStorageAddress = await blockStorage.address;
	logger.info("Block storage: ", blockStorageAddress);
	const coordination = new CoordinatorHTTPClient("http://127.0.0.1:" + metadataAddress.port, logger.child({proto: "http/1.1/metadata"}));
	await coordination.register_http("default", blockStorageAddress.address, blockStorageAddress.port, 10 * 1024 * 1024 );

	return {
		metadataAddress,
		client,
		stop: async () => {
			blockStorage.end();
			metaData.end();
			await context.cleanup();
		}
	}
}


/***********************************************************************************************************************
 * Metadata service
 **********************************************************************************************************************/
async function newMetadataService( context, config ){
	// Extract configuration
	const metadataDir = config.metadataDir;
	const http_v1_port = config.http_v1;

	// Open the persistance layer
	context.logger.trace("Using LevelDB storage directory", metadataDir);
	const metadataLevelDB = await openLevelDB( context, metadataDir );
	const metadataLevelEventStore = new LevelUpEventStore(metadataLevelDB);

	// Setup the storage event controllers
	const eventsContext = context.subcontext("event storage");
	const metadataStorage = new EventMetadataStore(metadataLevelEventStore, eventsContext.logger);

	// Setup the node controllers
	const nodesStorage = new NodesEventStore(metadataLevelEventStore);

	// Expose the API service
	const serviceContext = context.subcontext("http_v1");
	const coordinator = {
		storage: metadataStorage,
		nodesStorage
	};
	serviceContext.logger.info("Asking to bind to port", {http_v1_port});
	const metaData = await http_v1(serviceContext.logger, coordinator, {port: http_v1_port, tracer: config.tracer });
	return metaData;
}

module.exports = {
	inPorcessService,
	newMetadataService
};
