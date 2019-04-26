const {inPorcessService} = require("../../in-proc");
const assert = require("assert");
const {parallel} = require("junk-bucket/future");
const {promisePiped, MemoryWritable} = require("junk-bucket/streams");

const fs = require('fs');

/*
 * Testing dependencies
 */
const {expect} = require('chai');
const {createTestLogger} = require("./test-junk");

const crypto = require('crypto');
async function digestStream( stream ) {
	const hashSink = new MemoryWritable();
	const hash = crypto.createHash('sha256');
	await promisePiped(stream.pipe(hash), hashSink);
	return hashSink.bytes.toString("hex");
}

const Future = require('junk-bucket/future');
const {promiseEvent} = require('junk-bucket/future');

describe( "In process harness", function() {
	it("can start and stop", async function(){
		const logger = createTestLogger("start-stop-test", false);
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
		const logger = createTestLogger("stream-objects", true);
		const handler = await inPorcessService( logger );
		try {
			const container = "some-container";
			const key = "streaming-data";
			const sourceFile = __dirname +"/" + "test.png";
			const sourceHash = await digestStream( fs.createReadStream( sourceFile ) );

			const client = handler.client;
			const streamingOut = client.stream_to( container, key );
			const source = fs.createReadStream( sourceFile );
			logger.info("Sending test stream");
			const doneSending = promiseEvent(streamingOut, "close");
			await promisePiped(source,streamingOut);
			await doneSending;

			logger.info("Retrieving stream");
			const streamIn = client.stream_from( container, key );
			const storedHash = await digestStream(streamIn);
			logger.info("Stream digesting completed", {storedHash});
			expect(storedHash).to.deep.eq(sourceHash);
		}finally{
			handler.stop();
		}
	});

	//TODO: The following test is a mess, should be cleaned up
	describe("Given a number of objects stored in a specific bucket", function(){
		const container = "some-container";
		const keyPrefix = "base/key/";

		// These drive the key with `keyPrefix + value`
		const storedValues = ["miley", "mocha", "what", "like"];
		const streamedValues = ["tunak"];

		beforeEach(async function () {
			this.logger = createTestLogger("prefix-list", false);
			this.handler = await inPorcessService( this.logger );


			const client = this.handler.client;
			await parallel(storedValues.map(async (value) => {
				await client.store_value(container, keyPrefix + value, value);
			}));

			await parallel( streamedValues.map( async (value) => {
				const stream = await client.stream_to(container, keyPrefix + value );
				const promise = promiseEvent(stream, 'close' );
				stream.end( value );
				await promise;
			}));
		});
		afterEach(async function f() {
			this.handler.stop();
		});

		describe("When queried for a specific prefix within the bucket",function () {
			beforeEach(async function f() {
				const client = this.handler.client;
				this.keyResults = await client.list( container, keyPrefix);
			});

			it("provides the full path to the elements within the bucket", function () {
				const expectKeys = [].concat(
					storedValues.map( v => keyPrefix + v),
					streamedValues.map(v => keyPrefix + v)).sort();
				const actualKeys = this.keyResults.keys.sort();
				expect(actualKeys).to.deep.eq(expectKeys);
			});
		})
	});
});
