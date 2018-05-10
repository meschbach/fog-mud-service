/*
 * An in-process version of the system.  Intended to provide a reasonable level of service for the system suitable for
 * testing components.  These tests aren't concerned with the security layer and will not configure them.
 */
const fs = require("fs")
const os = require("os")
const path = require("path")
const {promisify} = require("util")

const fs_mkdtemp = promisify(fs.mkdtemp)

async function inPorcessService( logger ){
	// Create a temporary directory
	const tempPrefix = path.join( os.tmpdir(), "mud-");
	const root = await fs_mkdtemp( tempPrefix );
	const fs = path.join( root, "fs-storage" );
	logger.info("File System Configuration ", {root, fs})

	// Create Metadata service
	const metadatPort = 0;
	const metaData = http_v1(logger.child({proto: 'http/v1', port: metadatPort}), null, {port: metadatPort});

	// Create a new block storage node
	const blockStoragePort = 0;
	const blockStroage = fsStorageNode({ client: "http://localhost:" + await metaData.port, root: fs, name: 'primary' });

	return {
		stop: () => {
			blockStorage.stop();
			metaData.stop();
		}
	}
}

module.exports = {
	inPorcessService
}