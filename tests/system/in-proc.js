const {inPorcessService} = require("../../in-proc");
const bunyan = require("bunyan");
const assert = require("assert");
const bunyanFormat = require("bunyan-format");

const fs = require('fs');

function createTestLogger( name, debug = false ){
	const level = debug ? "trace" : "error";
	// Taken from: https://github.com/trentm/node-bunyan/issues/436
	const logger = bunyan.createLogger({
		name: name,
		streams: [
			{stream: bunyanFormat({outputMode: 'short'}), level: level}
			]
	});
	return logger;
}

const crypto = require('crypto');
function digestStream( stream ) {
	const hash = crypto.createHash('sha256');
	stream.pipe(hash);
	return hash.digest('hex');
}

const Future = require('junk-drawer/future');
function promiseEvent( from, name ) {
	const sync = new Future();
	from.on(name, function(what){
		sync.accept(what);
	});
	from.on('error', function (why) {
		sync.reject(why)
	});
	return sync.promised;
}

describe( "In process harness", function() {
	it("can start and stop", async function(){
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

	it("can stream objects", async function() {
		const logger = createTestLogger("stream-objects", false);
		const handler = await inPorcessService( logger );
		try {
			const container = "some-container";
			const key = "streaming-data";
			const sourceFile = __dirname +"/" + "test.png";
			const sourceHash = digestStream( fs.createReadStream( sourceFile ) );

			const client = handler.client;
			const streamingOut = client.stream_to( container, key );
			const source = fs.createReadStream( sourceFile );
			source.pipe(streamingOut);
			await promiseEvent(source, 'end');

			const streamIn = client.stream_from( container, key );
			const storedHash = digestStream(streamIn);
			await promiseEvent(streamIn, 'end');
			assert.equal( storedHash, sourceHash );
		}finally{
			handler.stop();
		}
	});
});
