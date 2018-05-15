const {inPorcessService} = require("../../in-proc");
const bunyan = require("bunyan");
const assert = require("assert");

describe( "In process harness", function() {
	it("can start and stop", async function(){
		// Taken from: https://github.com/trentm/node-bunyan/issues/436
		const logger = bunyan.createLogger({name: "start-stop-test", streams: [{stream: process.stdout, level: 'error'}]});
		const harness = await inPorcessService( logger );
		const address = harness.metadataAddress;
		try {
			logger.info("Metadata address", address);
			assert(address);
		}finally {
			harness.stop()
		}
	});

	xit("can place an object then retrieve it", async function(){
		const logger = bunyan.createLogger({name: "start-stop-test", streams: [{stream: process.stdout, level: 'fatal'}]});
		const handler = await inPorcessService( logger );
		try {
			const client = handler.client;
			await client.store_value("some-container", "some-key", "some-value");
			const value = await client.get_value("some-container", "some-key");
			assert.equals(value, "some-value");
		}finally{
			handler.stop();
		}
	});
});
