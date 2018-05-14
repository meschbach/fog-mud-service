/*
 * An in-process version of the system.  Intended to provide a reasonable level of service for the system suitable for
 * testing components.  These tests aren't concerned with the security layer and will not configure them.
 */
const fs = require("fs")
const os = require("os")
const path = require("path")
const {promisify} = require("util")

const fs_mkdtemp = promisify(fs.mkdtemp)

const {http_v1} = require("./http-v1")
const {fsNodeStorage, CoordinatorHTTPClient} = require("./fs-node");

async function inPorcessService( logger ){
	// Create a temporary directory
	const tempPrefix = path.join( os.tmpdir(), "mud-");
	const root = await fs_mkdtemp( tempPrefix );
	const fs = path.join( root, "fs-storage" );
	logger.info("File System Configuration ", {root, fs})

	// Create Metadata service
	const metaData = http_v1(logger.child({proto: 'http/v1', port: 0}), null, {port: 0});
	const metadatPort = await metaData.port;

	// Create a new block storage node
	const blockStoragePort = 0;
	const blockStorage = fsNodeStorage(logger.child({node: 'fs-storage'}), null, { client: "http://localhost:" + await metaData.port, root: fs, name: 'primary' });

	return {
		stop: () => {
			blockStorage.end();
			metaData.end();
		}
	}
}

module.exports = {
	inPorcessService
}