const {newTemporaryLevelStore} = require("../../junk/event-store-level");

const {expect} = require("chai");
const {Context} = require("../../junk");
const {createTestLogger} = require("../system/test-junk");

describe("LevelEventStore", function () {
	describe("Given a new LevelEventStore", function () {
		beforeEach(async function () {
			this.context = new Context("New LevelEventStore", createTestLogger("New LevelEventStore", true));
			this.eventStore = await newTemporaryLevelStore(this.context);
		});

		afterEach(async function () {
			await this.context.cleanup();
		});

		it("it has no stored records", async function(){
			expect(await this.eventStore.countRecords()).to.eq(0);
		});

		describe("When an event has been added", function () {
			beforeEach(async function () {
				const event = {
					testEvent: 1
				};
				this.exampleEvent = Object.assign({}, event);
				this.momento = await this.eventStore.store(event);
				//TODO: Retitle test to make this a clear requirement
				event.testEvent = 2; //Ensure we avoid storing mutable structures.
			});

			it("it has 1 stored records", async function(){ expect(await this.eventStore.countRecords()).to.eq(1); });
			it("can recall the event given the momento", async function f() {
				expect(await this.eventStore.byMomento( this.momento )).to.deep.eq(this.exampleEvent);
			})
		});

		describe("When multiple events are added", function(){
			beforeEach(async function f() {
				await this.eventStore.store(1);
				this.secondEvent = await this.eventStore.store(2);
				await this.eventStore.store(3);
			});

			describe("And is replayed", function (){
				beforeEach( async function replay() {
					this.events = [];
					this.result = await this.eventStore.replay(async (momento, value) => {
						this.lastSeen = momento;
						this.events.push( value );
					});
				});

				it("provides the events in order", function(){
					expect(this.events).to.deep.eq([1,2,3]);
				});

				it("provides the last momento", function(){
					expect(this.result).to.deep.eq(this.lastSeen);
				})
			});

			describe("And is replayed from the second event", function(){
				beforeEach( async function replay() {
					this.events = [];
					this.result = await this.eventStore.replay(async (momento, value) => {
						this.lastSeen = momento;
						this.events.push( value );
					}, this.secondEvent);
				});

				it("replays all events from there forward", function(){
					expect(this.events).to.deep.eq([2,3]);
				});
			});
		});
	});
});
