
const request = require('request-promise-native');
class CoordinatorHTTPClient {
	constructor( serviceURL, logger ){
		this.base = serviceURL;
		this.logger = logger.child({mud: "http/storage-coordinator/v1", serviceURL});
	}

	//TODO: Node has to be aware of exposure itself
	async register_http( name, host, port, space = 0 ){
		this.logger.trace("Registering as an HTTP service", {host, port});
		try {
			const result = await request.post({url: this.base + "/nodes/" + name, body: {host, port, spaceAvailable: space}, json: true});
			this.logger.trace("Received result", result);
		}catch(e){
			throw new Error(e.message);
		}
	}
}

module.exports = {
	CoordinatorHTTPClient
};
