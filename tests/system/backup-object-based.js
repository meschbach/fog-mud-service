//Testing dependencies
const {expect} = require("chai");

//Test support
const {createTestLogger} = require("./test-junk");

//Module tests
const {inPorcessService} = require("../../in-proc");

describe("For a object backup system", function(){
	beforeEach(async function(){
		const logger = createTestLogger("object-backup-initial", false);
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
				expect(this.result.objects[0].container).to.eq("backup-test");
			});

			describe("when nothing changes", function() {
				describe("and the backup tries to continue", function(){
					beforeEach(async function(){
						const client = this.harness.client;
						this.incrementalResponse = await client.incrementalBackupChanges(this.result.continuation);
					});

					it("has no modified objects", function() { expect(this.incrementalResponse.changes.modified).to.be.empty; });
					it("has no new objects", function(){ expect(this.incrementalResponse.changes.created).to.be.empty; });
					it("has no deleted objects", function(){ expect(this.incrementalResponse.changes.destroyed).to.be.empty; });
				});
			});

			xdescribe("when the object is deleted", function() {
				describe("on the next run", function(){
					it("reports the object deleted");
					it("has no modified objects", function() { expect(this.incrementalResponse.modified).to.be.empty; });
					it("has no new objects", function(){ expect(this.incrementalResponse.created).to.be.empty; });
				});
			});

			xdescribe("when the object is replaced", function(){
				describe("on the next run", function(){
					it("reports the object has been modified");
					it("has no new objects", function(){ expect(this.incrementalResponse.created).to.be.empty; });
					it("has no deleted objects", function(){ expect(this.incrementalResponse.destroyed).to.be.empty; });
				});
			});


			xdescribe("when a new object is added", function(){
				describe("on the next run", function(){
					it("has no modified objects", function() { expect(this.incrementalResponse.modified).to.be.empty; });
					it("has no deleted objects", function(){ expect(this.incrementalResponse.destroyed).to.be.empty; });
					it("reports the new object exists");
				});
			});
		});
	})
});
