/*
 * An in-process version of the system.  Intended to provide a reasonable level of service for the system suitable for
 * testing components.  These tests aren't concerned with the security layer and will not configure them.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {promisify} = require("util");

const fs_mkdtemp = promisify(fs.mkdtemp);
const fs_mkdir = promisify(fs.mkdir);

const {http_v1} = require("./metadata");
const {MudHTTPClient} = require("./client");
const {fsNodeStorage, CoordinatorHTTPClient} = require("./fs-node");

async function inPorcessService( logger ){
	// Create a temporary directory
	const tempPrefix = path.join( os.tmpdir(), "mud-");
	const root = await fs_mkdtemp( tempPrefix );
	const fs = path.join( root, "fs-storage" );
	await fs_mkdir(fs);
	logger.info("File System Configuration ", {root, fs});

	// Create Metadata service
	const metaData = http_v1(logger.child({app: 'metadata', port: 0}), null, {port: 0});

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
