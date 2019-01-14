const {expect} = require("chai");
const {parallel} = require("junk-bucket/future");

//Test support
const {createTestLogger} = require("./test-junk");

//Module tests
const {inPorcessService} = require("../../in-proc");

describe( "Given a valid system", function () {
	beforeEach(async function () {
		const logger = createTestLogger("object-backup-initial");
		this.harness = await inPorcessService( logger );
	});
	afterEach(async function(){
		await this.harness.stop();
	});

	describe("Given an object has been deleted", function(){
		beforeEach( async function () {
			const client = this.harness.client;
			await parallel([
				client.store_value("delete-example", "tiger","paws" ),
				client.store_value("delete-example", "ba","wawa" )
			]);
			await client.delete("delete-example", "tiger");
		});

		describe("When listing the container", function () {
			beforeEach(async function() {
				const client = this.harness.client;
				// TODO: Need test to show prefix = {"",null,undefined} with the client produces no differences
				this.response = await client.list("delete-example", "");
			});

			it("does not appear", function () {
				expect(this.response.keys).to.deep.eq(["ba"]);
			})
		})
	});
});