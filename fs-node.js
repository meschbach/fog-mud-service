const bunyan = require('bunyan');

const express = require('express');
const morgan = require('morgan');
const {make_async} = require('junk-bucket/express');
const Future = require('junk-bucket/future');
const {promiseEvent} = require("junk-bucket/future");
const {exists} = require('junk-bucket/fs');

const fs = require('fs');
const assert = require('assert');

function http_v1(logger, system, config) {
	assert(config.storage, "Storage not defined.");

	const blocks = {};
	const app = make_async(express());
	app.use(morgan('short', {
		stream: {
			write: function (message) {
				logger.info(message.trim());
			}
		}
	}));
	app.a_get("/block/:name", async (req, resp) => {
		const target =  req.params["name"];
		//TODO: Verify the resulting path is under the traget path
		const fileName = config.storage + "/" + target;
		logger.trace("Requested block ", {name: target, fileName});
		if( await exists(fileName)) {
			resp.sendFile( target, {root: config.storage} );
		} else {
			resp.notFound();
		}
	});

	app.a_post("/block/:name", async (req, resp) => {
		const target =  req.params["name"];
		const fileName = config.storage + "/" + target;

		//Store object
		logger.info("Placing block at ", {name: target, headers: req.headers, closed: req.ended});
		const sink = fs.createWriteStream( fileName );
		const onEnd = promiseEvent(sink, "finish");
		req.pipe(sink, {end:true});
		await onEnd;
		resp.status(204);
		resp.end();
	});

	const addressFuture = new Future();
	const server = app.listen( config.port, '127.0.0.1', () => {
		logger.info("HTTP listener bound on ", server.address());
		addressFuture.accept(server.address());
	});

	return {
		address: addressFuture.promised,
		end: function () {
			server.close();
		}
	}
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
		fsNodeStorage: http_v1,
		CoordinatorHTTPClient: CoordinatorHTTPClient
	}
}