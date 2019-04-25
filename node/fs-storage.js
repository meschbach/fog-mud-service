const assert = require('assert');


const {Context} = require("junk-bucket/context");
const {express_server, JailedVFS, LocalFileSystem} = require("../junk");

const storageAPI = require("./http-v1");

function localFSStorage(logger, system, config) {
	const rootContext = new Context("fs-node", logger);
	assert(config.storage, "Storage not defined.");
	const localFS = new LocalFileSystem();
	const jailRoot = config.storage;
	const jailedFS = new JailedVFS(jailRoot, localFS);
	const storageAPI_v1 = storageAPI.http_v1(rootContext, jailedFS);


	const address = express_server(rootContext, storageAPI_v1, config.port, "127.0.0.1");
	const oldAddress = address.then((a) => {
		const parts = a.split(":");
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

module.exports = {
	localFSStorage
};
