/*
 * An in-process version of the system.  Intended to provide a reasonable level of service for the system suitable for
 * testing components.  These tests aren't concerned with the security layer and will not configure them.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {promisify} = require("util");

//TODO: These are good candidates to move to the junk drawer
const fs_mkdtemp = promisify(fs.mkdtemp);
const fs_mkdir = promisify(fs.mkdir);

const {http_v1} = require("./metadata");
const {MudHTTPClient} = require("./client");
const {fsNodeStorage, CoordinatorHTTPClient} = require("./fs-node");

const levelup = require('levelup');
const leveldown = require('leveldown');

async function inPorcessService( logger ){
	// Create a temporary directory
	const tempPrefix = path.join( os.tmpdir(), "mud-");
	const root = await fs_mkdtemp( tempPrefix );
	const fs = path.join( root, "fs-storage" );
	await fs_mkdir(fs);
	const metadataDir = path.join( root, "metadata" );
	logger.info("File System Configuration ", {root, fs, metadataDir});

	// Create Metadata service
	const storage = {
		levelup: levelup(leveldown(metadataDir))
	};
	const metaData = http_v1(logger.child({app: 'metadata', port: 0}), storage, {port: 0});

	// Create a new block storage node
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
		stop: () => {
			blockStorage.end();
			metaData.end();
		}
	}
}

module.exports = {
	inPorcessService
};
