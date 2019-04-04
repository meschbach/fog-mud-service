
const request = require('request-promise-native');

class NodesHTTPClient {
	constructor( serviceURL, logger ){
		this.base = serviceURL;
		this.logger = logger.child({mud: "http/nodes/v1", serviceURL});
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

	async allNodes(){
		const address = this.base + "/nodes/";
		try {
			const result = await request.get({url: address, json: true});
			return result;
		}catch(e){
			if( 404 === e.statusCode) {
				throw new Error("API (not found): expected list at " + address);
			}
			throw new Error(e.message);
		}
	}
}

module.exports = {
	NodesHTTPClient
};