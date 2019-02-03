const {expect} = require("chai");
const {EventMetadataStore} = require("../../metadata/data-store");
const {createTestLogger} = require("../system/test-junk");
const {MemoryEventStore} = require( "../test-junk");
const {parallel} = require("junk-bucket/future");

describe("EventMetadataStore", function () {
	beforeEach(function () {
		this.store = new EventMetadataStore( new MemoryEventStore(), createTestLogger("EventMetaDataStore", false));
	});

	describe("Given a created stored", function () {
		beforeEach(async function () {
			this.allValues = {
				"2-tired": "3-been",
				"3-rain": "4-butterfly",
				"zebra": "last-one",
				"false/tuesday" : "get it done"
			};
			this.allKeys = Object.keys(this.allValues);
			await parallel(this.allKeys.map( async (k) => {
				const value = this.allValues[k];
				await this.store.stored("1-container", k, value);
			}));
		});

		describe("when a prefix search is preformed with null", function(){
			beforeEach(async function(){
				this.response = await this.store.list("1-container", null);
			});

			it("contains the correct keys", function(){
				expect(this.response).to.deep.eq( this.allKeys);
			});
		});

		describe("when a prefix search is preformed with undefined", function(){
			beforeEach(async function(){
				this.response = await this.store.list("1-container", undefined);
			});

			it("contains the correct keys", function(){
				expect(this.response).to.deep.eq(this.allKeys);
			});
		});

		describe("when a prefix search is preformed with a string of 'false'", function(){
			beforeEach(async function(){
				this.response = await this.store.list("1-container", "false");
			});

			it("contains the correct keys", function(){
				expect(this.response).to.deep.eq(["false/tuesday"]);
			});
		});

		describe("When the object is destroyed", function () {
			beforeEach(async function () {
				const removeKey = this.allKeys[1];
				this.removedKey = removeKey;
				await this.store.deleteObject("1-container", removeKey);
				this.allKeys = this.allKeys.filter( (k) => k != removeKey);
			});

			describe("when listed", function(){
				beforeEach(async function() {
					//TODO: Need a test which verifies prefix = {"",false, undefined, null} all work the same
					this.listing = await this.store.list("1-container", "");
				});

				it("no longer shows", function () {
					expect(this.listing).to.deep.eq(this.allKeys);
				});
			});

			describe("and replaced", function(){
				beforeEach(async function() {
					await this.store.stored("1-container", this.removedKey, "replacedValue");
				});

				it("object based backup show it as replaced", async function () {
					const result = await this.store.objectChangesBetween();
					expect(result.modified).to.deep.eq([{container: "1-container", key: this.removedKey}]);
				});
			});
		});
	});
});
