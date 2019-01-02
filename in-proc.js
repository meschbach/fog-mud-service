/*
 * An in-process version of the system.  Intended to provide a reasonable level of service for the system suitable for
 * testing components.  These tests aren't concerned with the security layer and will not configure them.
 */
const os = require("os");
const path = require("path");

//TODO: These are good candidates to move to the junk drawer
const { fs_mkdtemp, fs_mkdir } = require("./junk");

const {http_v1} = require("./metadata");
const {MudHTTPClient} = require("./client");
const {fsNodeStorage, CoordinatorHTTPClient} = require("./fs-node");

const {Context} = require("./junk");
const {newTempDirectory} = require("./junk/context");
const {openLevelDB} = require("./junk/leveldb");
const {LevelUpEventStore} = require("./junk/event-store-level");
const {EventMetadataStore} = require('./metadata/data-store');

const {mkdir} = require('junk-bucket/fs');

async function makeSubdirectory( base, sub ){
	const fullPath = path.join(base,sub);
	await mkdir(fullPath);
	return fullPath;
}

async function inPorcessService( logger ){
	const context = new Context("In-process Mud system", logger);
	const root = await newTempDirectory(context, "mud-");
	const metadataDir = await makeSubdirectory(root, "metadata");
	const metadataLevelDB = await openLevelDB( context, metadataDir );
	const metadataLevelEventStore = new LevelUpEventStore(metadataLevelDB);
	const metadataStorage = new EventMetadataStore(metadataLevelEventStore, logger.child({service:"metadata", component: "event storage"}));

	// Create Metadata service
	const coordinator = {
		storage: metadataStorage
	};
	const metaData = await http_v1(logger.child({app: 'metadata', port: 0}), coordinator, {port: 0});

	// Create a new block storage node
	const fs = await makeSubdirectory(root, "fs-storage");
	const blockStorage = fsNodeStorage(logger.child({app: 'fs-storage'}), null, { client: "http://127.0.0.1:" + await metaData.port, storage: fs, name: 'primary' });

	//create the client
	const metadataAddress = await metaData.address;
	const client = new MudHTTPClient("http://127.0.0.1:"+ metadataAddress.port, logger.child({proto: "httpv1.1/metadata"}));

	//Register the block storage node with the client
	const blockStorageAddress = await blockStorage.address;
	logger.info("Block storage: ", blockStorageAddress);
	const coordination = new CoordinatorHTTPClient("http://127.0.0.1:" + metadataAddress.port, logger.child({proto: "http/1.1/metadata"}));
	await coordination.register_http("default", blockStorageAddress.address, blockStorageAddress.port );

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

module.exports = {
	inPorcessService
};
