//Testing dependencies
const {expect} = require("chai");

//Test support
const {createTestLogger} = require("./test-junk");

//Module tests
const {inPorcessService} = require("../../in-proc");

describe("For a object backup system", function(){
	beforeEach(async function(){
		const logger = createTestLogger("object-backup-initial", true);
		this.harness = await inPorcessService( logger );
	});
	afterEach(async function(){
		await this.harness.stop();
	});

	describe("operating in batch mode", function(){
		describe("on first backup", function(){
			beforeEach( async function() {
				const client = this.harness.client;
				await client.store_value("backup-test", "test");
				this.result = await client.initiateObjectBackup();
			});

			it("has a continuation token", function(){
				expect(this.result.continuation,"continuation token").to.exist;
			});
			it("provides a set of objects", function(){
				expect(this.result.objects).to.exist;
			});

			it("is given a list of objects to be backed up", function(){
				console.log(this.result);
				expect(this.result.objects[0].container).to.eq("backup-test");
			});

			describe("on the next run", function () {
				it("receives a deleted list");
				it("receives an updated list");
				it("receives a list of new objects");
			})
		});
	})
});
