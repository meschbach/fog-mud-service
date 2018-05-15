const bunyan = require('bunyan');

const express = require('express');
const morgan = require('morgan');
const {make_async} = require('junk-drawer/express');

const fs = require('fs');

function http_v1(logger, system, config) {
	const blocks = {};
	const app = make_async(express());
	app.use(morgan('short'));
	app.a_get("/block/:name", async (req, resp) => {
		const target =  req.params["name"];
		// const fileName = config.storage + "/" + target;
		logger.trace("Requested block ", {name: target});
		resp.sendFile( target, {root: config.storage} );
	});

	app.a_post("/block/:name", async (req, resp) => {
		const target =  req.params["name"];
		const fileName = config.storage + "/" + target;
		logger.trace("Placing block at ", {name: target});
		const sink = fs.createWriteStream( fileName );
		sink.on('error', (problem) => {
			logger.error("Failed to write target", {target, fileName }, problem);
			resp.status(500);
			resp.end();
		});
		req.on('end', () => {
			logger.trace("Completed piping data to file", {target, fileName });
			resp.status(200);
			resp.end();
		});
		req.pipe(sink);
	});

	const server = app.listen( config.port, () => {
		logger.info("HTTP listener bound on ", config.port);
	});

	return {
		end: function () {
			server.close();
		}
	}
}

const request = require('request-promise-native');
class CoordinatorHTTPClient {
	constructor( serviceURL, logger ){
		this.base = serviceURL;
		this.logger = logger.child({mud: "http/storage-coordinator/v1", serviceURL});
	}

	//TODO: Node has to be aware of exposure itself
	async register_http( name, host, port ){
		this.logger.trace("Registering as an HTTP service", {host, port});
		const result = await request.post({url: this.base + "/nodes/" + name, body: {host, port, type: 'persistent'}, json: true});
		this.logger.trace("Received result", result);
	}
}

if( require && require.main == module ){
	const {main} = require('junk-drawer');
	const log = bunyan.createLogger({name: 'mud-mem-node', level: process.env.LOG_LEVEL || 'info'});
	main( async (logger) => {
		const port = 9978;
		const httpComponent = http_v1(logger.child({proto: 'http/storage/v1', port}), null, {port, storage: 'fs-node-blocks'});
		try {
			const coordinator = "http://localhost:9977";
			const name = "example";
			const client = new CoordinatorHTTPClient(coordinator, logger);
			await client.register_http(name, "localhost", port);
		}catch(e){
			logger.error("Failed to register with the coordinator, exiting", e);
			httpComponent.end();
		}
	}, log);
} else {
	module.exports = {
		fsNodeStorage: http_v1,
		CoordinatorHTTPClient: CoordinatorHTTPClient
	}
}