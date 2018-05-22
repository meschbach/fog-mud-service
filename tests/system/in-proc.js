const {inPorcessService} = require("../../in-proc");
const bunyan = require("bunyan");
const assert = require("assert");
const bunyanFormat = require("bunyan-format");

function createTestLogger( name, debug = false ){
	const level = debug ? "trace" : "error";
	const logger = bunyan.createLogger({
		name: name,
		streams: [
			{stream: bunyanFormat({outputMode: 'short'}), level: level}
			]
	});
	return logger;
}

describe( "In process harness", function() {
	it("can start and stop", async function(){
		// Taken from: https://github.com/trentm/node-bunyan/issues/436
		const logger = createTestLogger("start-stop-test");
		const harness = await inPorcessService( logger );
		const address = harness.metadataAddress;
		try {
			logger.info("Metadata address", address);
			assert(address);
		}finally {
			harness.stop()
		}
	});

	it("can place an object then retrieve it", async function(){
		const logger = createTestLogger("place-retrieve", false);
		const handler = await inPorcessService( logger );
		try {
			const client = handler.client;
			await client.store_value("some-container", "some-key", "some-value");
			const value = await client.get_value("some-container", "some-key");
			assert.equal(value, "some-value");
		}finally{
			handler.stop();
		}
	});
});
