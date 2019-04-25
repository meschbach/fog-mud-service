
const {localFSStorage} = require("./node/fs-storage");
const http_v1 = localFSStorage;

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