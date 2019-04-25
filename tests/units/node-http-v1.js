const {expect} = require("chai");
const {createTestLogger} = require("../system/test-junk");

const {Context} = require("junk-bucket/context");
const {delay} = require("junk-bucket/future");
const {MemoryWritable, promisePiped} = require("junk-bucket/streams");
const {InMemoryVFS} = require("junk-bucket/vfs");

const {http_v1, NodeHTTPV1} = require("../../node/http-v1");

/*
 * Junk Candidates
 */
const {listen} = require("../test-junk");

async function streamAsBuffer( source ){
	const target = new MemoryWritable();
	await promisePiped(source, target);
	return target.bytes;
}

const express = require("express");
const {logMorganTo, endStream} = require("../../junk");

describe("node http_v1 routes", function () {
	it("404s if the block name isn't given", async function(){
		const rootContext = new Context("node:http_v1", createTestLogger("node:http_v1", false));
		try {
			const vfs = new InMemoryVFS();
			const router = http_v1(rootContext, vfs);

			const app = express();
			app.use(logMorganTo(rootContext.logger.child({app: "node"})));
			app.use(router);
			const address = await listen(rootContext, app);
			const url = "http://" + address;
			const client = new NodeHTTPV1(url);

			let threw = false;
			try {
				await client.createReadableStream("non-existent");
			}catch(e){
				threw = true;
			}
			expect(threw).to.deep.eq(true);
		}finally {
			rootContext.cleanup();
		}
	});

	it("may stream and recall blobs", async function(){
		const rootContext = new Context("node:http_v1", createTestLogger("node:http_v1", false));
		try {
			const vfs = new InMemoryVFS();
			const router = http_v1(rootContext, vfs);

			const app = express();
			app.use(logMorganTo(rootContext.logger.child({app: "node"})));
			app.use(router);
			const address = await listen(rootContext, app);
			const url = "http://" + address;
			const client = new NodeHTTPV1(url);

			//Actual test
			const name = "glacier";
			const example = Buffer.from("I spend too much time in coffee shops");
			const sink = await client.createWritableStream(name);
			await endStream(sink, example);
			delay(50); //TODO: Find way to sync before reading.  Perhaps the client should implement strict consistency control

			const source = await client.createReadableStream(name);
			const result = await streamAsBuffer(source);
			expect(result).to.deep.eq(example);
		}finally {
			rootContext.cleanup();
		}
	});
});
