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
		beforeEach( async function() {
			const client = this.harness.client;
			await client.store_value("backup-test", "test", "test-value");
			await client.store_value("backup-test", "delete-key", "delete-value");
		});

		describe("on first backup", function(){
			beforeEach( async function() {
				const client = this.harness.client;
				this.result = await client.initiateObjectBackup();
			});

			it("provides a set of objects", function(){
				expect(this.result.objects.length).to.eq(2);
			});

			it("is given a list of objects to be backed up", function(){
				expect(this.result.objects).to.deep.eq([
					{container:"backup-test", key: "test"},
					{container:"backup-test", key: "delete-key"},
				]);
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

			describe("when the object is deleted", function() {
				beforeEach(async function () {
					const client = this.harness.client;
					await client.delete("backup-test", "delete-key");
				});

				describe("on the next run", function(){
					beforeEach(async function(){
						const client = this.harness.client;
						this.incrementalResponse = await client.incrementalBackupChanges(this.result.continuation);
						this.changes = this.incrementalResponse.changes;
					});

					it("reports the object deleted", function(){
						expect(this.changes.destroyed).to.deep.eq([{container: "backup-test", key: "delete-key"}]);
					});

					it("has no modified objects", function() { expect(this.changes.modified).to.deep.eq([]); });
					it("has no new objects", function(){ expect(this.changes.created).to.deep.eq([]); });
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
