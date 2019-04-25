const assert = require('assert');

const storageAPI = require("./node/http-v1");
const {Context} = require("junk-bucket/context");
const {express_server, JailedVFS, LocalFileSystem} = require("./junk");

function http_v1(logger, system, config) {
	const rootContext = new Context("fs-node", logger);

	assert(config.storage, "Storage not defined.");
	const localFS = new LocalFileSystem();
	const jailRoot = config.storage;
	const jailedFS = new JailedVFS(jailRoot, localFS);
	const storageAPI_v1 = storageAPI.http_v1(rootContext, jailedFS);


	const address = express_server(rootContext, storageAPI_v1, config.port, "127.0.0.1");
	const oldAddress = address.then((a) => {
		const parts = a.split(":")
		return {
			address: parts[0],
			port: parseInt(parts[1])
		}
	});

	return {
		address: oldAddress,
		end: async function(){
			await rootContext.cleanup();
		}
	};
}

const { CoordinatorHTTPClient } = require("./metadata/coordinator");

if( require && require.main == module ){
	const {main} = require('junk-bucket');
	const {formattedConsoleLog} = require("junk-bucket/logging-bunyan");
	main( async (logger) => {
		const port = 9978;
		const httpComponent = http_v1(logger.child({proto: 'http/storage/v1', port}), null, {port, storage: 'fs-node-blocks'});
		try {
			const coordinator = "http://127.0.0.1:9977";
			const name = "example";
			const client = new CoordinatorHTTPClient(coordinator, logger);
			await client.register_http(name, "127.0.0.1", port, 1024 * 1024);
		}catch(e){
			logger.error("Failed to register with the coordinator, exiting", e);
			httpComponent.end();
		}
	}, formattedConsoleLog("fs-storage"));
} else {
	module.exports = {
		fsNodeStorage: http_v1
	}
}