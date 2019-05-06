const {expect} = require("chai");
const {parallel} = require("junk-bucket/future");

//Test support
const {createTestLogger} = require("./test-junk");

//Module tests
const {inPorcessService} = require("../../in-proc");

describe( "Given a valid system", function () {
	beforeEach(async function () {
		const logger = createTestLogger("object-backup-initial", false);
		this.harness = await inPorcessService( logger );
	});
	afterEach(async function(){
		if( this.harness ){
			await this.harness.stop();
		}
	});

	describe( "with no containers", function () {
		describe("when queried for the containers names", function () {
			beforeEach(async function () {
				this.response = await this.harness.client.listContainers();
				this.containers = this.response.containers;
			});

			it("gives en empty list", function(){
				expect(this.containers).to.deep.eq([]);
			});
		});
	});

	describe( "with three buckets", function () {
		const containerNames = [
			"correspondents",
			"fear",
			"delight"
		];

		beforeEach(async function () {
			const client = this.harness.client;
			await parallel( containerNames.map( (c) => client.store_value(c,"love and", "lost")));
		});

		describe("when queried for the containers names", function () {
			beforeEach(async function () {
				this.response = await this.harness.client.listContainers();
				this.containers = this.response.containers;
			});

			it("gives the names of the containers", function () {
				expect(this.containers.sort()).to.deep.eq(containerNames.sort());
			});
		});
	});
});