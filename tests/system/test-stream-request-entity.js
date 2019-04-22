const {expect} = require("chai");

//TODO: Move to Junk
const express = require("express");
const {asyncRouter} = require("junk-bucket/express");
const {logMorganTo, streamRequestEntity} = require("../../junk");
const {listen, testContext} = require("../test-junk");
const {delay, promiseEvent} = require("junk-bucket/future");

const Future = require("junk-bucket/future");
const {MemoryReadable, MemoryWritable, promisePiped} = require("junk-bucket/streams");

async function anonymousExpress( context, router ){
	const app = express();
	app.use(logMorganTo(context.logger));
	app.use( router );
	const address = await listen(context, app);
	return address;
}

describe("streamRequestEntity", function(){
	describe("as a unit", function(){
		it("sends the entire request entity", async function () {
			const readRequestEntity = new Future();
			const buffer = new MemoryWritable();

			const context = testContext("stream-not-ended", false);
			try {
				const router = asyncRouter(context.logger);
				router.a_post("/test", async (req, resp) => {
					await promisePiped(req,buffer);
					readRequestEntity.accept(buffer);

					resp.statusCode = 204;
					resp.end();
				});
				const address = await anonymousExpress(context, router);

				const url = "http://" + address + "/test";
				context.logger.info("Requesting", url);
				const entityStream = await streamRequestEntity({url, method: "POST"}, async (resp) => {
					context.logger.trace("Received response", resp.statusCode);
				});
				const example = Buffer.from("learn your lesson well", "utf-8");
				const toSend = new MemoryReadable(example);

				context.logger.trace("Piping from client");
				await promisePiped(toSend, entityStream);
				await promiseEvent(entityStream, "close");
				context.logger.trace("Client piping completed");

				await readRequestEntity.promised;
				expect(buffer.bytes).to.deep.eq(example);
			}finally {
				await context.cleanup();
			}
		});

		it("raises an error when the HTTP response is an error", async function () {
			const buffer = new MemoryWritable();

			const context = testContext("stream-not-ended", false);
			try {
				const router = asyncRouter(context.logger);
				router.a_post("/test", async (req, resp) => {
					await promisePiped(req,buffer);

					resp.statusCode = 503;
					resp.end();
				});
				const address = await anonymousExpress(context, router);

				const url = "http://" + address + "/test";
				context.logger.info("Requesting", url);
				const entityStream = await streamRequestEntity({url, method: "POST"}, async (resp) => {
					await delay(1);
					throw new Error();
				});
				const example = Buffer.from("learn your lesson well", "utf-8");
				const toSend = new MemoryReadable(example);

				let raised = false;
				context.logger.trace("Piping from client");
				try {
					await promisePiped(toSend, entityStream);
					await promiseEvent(entityStream,'close');
				}catch(e){
					raised = true;
				}

				expect(raised).to.deep.eq(true);
			}finally {
				await context.cleanup();
			}
		});


		it("raises an error when the HTTP response interpreter errors", async function () {
			const buffer = new MemoryWritable();

			const context = testContext("stream-not-ended", false);
			try {
				const router = asyncRouter(context.logger);
				router.a_post("/test", async (req, resp) => {
					context.logger.trace("Test");
					await promisePiped(req,buffer);

					resp.statusCode = 200;
					resp.end();
				});
				const address = await anonymousExpress(context, router);

				const url = "http://" + address + "/test";
				context.logger.info("Requesting", url);
				const entityStream = await streamRequestEntity({url, method: "POST"}, (resp) => {
					context.logger.trace("Error");
					throw new Error();
				});
				const example = Buffer.from("learn your lesson well", "utf-8");
				const toSend = new MemoryReadable(example);

				let raised = false;
				context.logger.trace("Piping from client");
				try {
					await promisePiped(toSend, entityStream);
					await promiseEvent(entityStream, "close");
				}catch(e){
					raised = true;
				}
				context.logger.trace("Assertion");

				expect(raised).to.deep.eq(true);
			}finally {
				await context.cleanup();
			}
		});
	});
});
