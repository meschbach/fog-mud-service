const {expect} = require("chai");
const {EventMetadataStore} = require("../../metadata/data-store");
const {createTestLogger} = require("../system/test-junk");

class MemoryStore {
	constructor(){
		this.events = [];
	}

	async publish( event ){
		this.events.push(event);
	}

	async replay( f ){
		let i = 0;
		while( i < this.events.length ){
			f(i, this.events[i]);
			i++;
		}
	}
}

describe("EventMetadataStore", function () {
	beforeEach(function () {
		this.store = new EventMetadataStore( new MemoryStore(), createTestLogger("EventMetaDataStore"));
	});

	describe("Given a created stored", function () {
		beforeEach(async function () {
			await this.store.stored("1-container", "2-tired", "3-been");
			await this.store.stored("1-container", "3-rain", "4-butterfly");
		});

		describe("When the object is destroyed", function () {
			beforeEach(async function () {
				await this.store.deleteObject("1-container", "2-tired");
			});

			describe("when listed", function(){
				beforeEach(async function() {
					//TODO: Need a test which verifies prefix = {"",false, undefined, null} all work the same
					this.listing = await this.store.list("1-container", "");
				});

				it("no longer shows", function () {
					expect(this.listing).to.deep.eq(["3-rain"]);
				});
			});
		});
	});
});
