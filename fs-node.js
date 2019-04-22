const bunyan = require('bunyan');

const express = require('express');
const {make_async} = require('junk-bucket/express');
const Future = require('junk-bucket/future');
const {promiseEvent} = require("junk-bucket/future");
const {exists} = require('junk-bucket/fs');

const fs = require('fs');
const assert = require('assert');

const storageAPI = require("./node/http-v1");
const {Context} = require("junk-bucket/context");
const {logMorganTo, JailedVFS, LocalFileSystem} = require("./junk");

function http_v1(logger, system, config) {
	assert(config.storage, "Storage not defined.");
	const localFS = new LocalFileSystem();
	const jailRoot = config.storage;
	const jailedFS = new JailedVFS(jailRoot, localFS);

	const rootContext = new Context("fs-node", logger);

	const app = make_async(express());
	app.use(logMorganTo(logger));
	app.use(storageAPI.http_v1(rootContext, jailedFS));

	const addressFuture = new Future();
	const server = app.listen( config.port, '127.0.0.1', () => {
		logger.info("HTTP listener bound on ", server.address());
		addressFuture.accept(server.address());
	});
	const closedSocketPromise = promiseEvent(server,"close");
	closedSocketPromise.then(() => {}, () => {}); //TODO: Prevent leaking promise complaints, better way to do this?

	return {
		address: addressFuture.promised,
		end: async function () {
			server.close();
			await closedSocketPromise;
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