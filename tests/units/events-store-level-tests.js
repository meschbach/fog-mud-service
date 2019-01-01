const {promiseEvent} = require("junk-bucket/future");
const {last} = require("junk-bucket/arrays");

const {newTempDirectory} = require("../../junk/context");

const levelup = require('levelup');
const leveldown = require('leveldown');

async function newTemporaryLevelDB(context){
	const dir = await newTempDirectory(context, "level-event-store-");
	const db = levelup( leveldown( dir ) );
	context.onCleanup(async function f() {
		if( db ){
			await db.close();
		}
	});
	return db;
}

function momento_key( momento ){
	return "v0/events/" + momento.term + "/" + momento.id;
}

async function level_keyOptional( db, key ){
	try {
		return await db.get(key);
	}catch( err ){
		if( err.notFound ){
			return undefined;
		} else {
			throw err;
		}
	}
}

class LevelUpEventStore {
	constructor( db ){
		this.db = db;
	}

	async _nextID(){
		if( !this._term || !this._id ){
			//New term
			const lastTerm = await level_keyOptional(this.db,"v0/term");
			this._term = (lastTerm || -1) + 1;
			await this.db.put("v0/term", this._term);
			//Always start from 0
			this._id = 0;
		}
		const id = this._id++;
		return {
			term: this._term,
			id
		}
	}

	async countRecords(){
		let count = 0;
		const stream = this.db.createReadStream({gt: "v0/events",lt: "v0/eventsz", values: false});
		stream.on('data', function(keyBytes){
			count++;
		});
		await promiseEvent(stream, 'end');
		return count;
	}

	async store( event ){
		const dbRepresentation = JSON.stringify(event);
		const momento = await this._nextID();
		const key = momento_key(momento);
		await this.db.put(key, dbRepresentation);
		return momento;
	}

	async byMomento( momento ){
		const key = momento_key(momento);
		const dbRepresentation = await this.db.get( key );
		const stringRepresentation = dbRepresentation.toString("utf-8");
		const event = JSON.parse(stringRepresentation);
		return event;
	}

	async replay( consumer, fromMomento ){
		const options = { keys: true, values: true, lt: 'v0/eventsz' };
		if( fromMomento ){
			options.gte = momento_key(fromMomento);
		} else {
			options.gt = "v0/events";
		}

		let lastMomento;
		const stream = this.db.createReadStream(options);
		stream.on('data', function( data ){
			//TODO: It may be better to use a 'Transform' or look at how to adapt 'Tranform' to use promises.
			stream.pause();

			const stringKey = data.key.toString("utf-8");
			const keyParts = stringKey.split("/");
			const momentoParts = last(keyParts,2);
			const term = parseInt(momentoParts[0]);
			const id = parseInt(momentoParts[1]);
			const momento = Object.freeze({ term, id });
			lastMomento = momento;

			const stringRepresentation = data.value.toString("utf-8");
			const event = JSON.parse(stringRepresentation);
			const constObject = Object.freeze(event);

			const promise = consumer(momento, constObject );
			if( promise.then ){
				promise.then( () => {
					stream.resume();
				}, (e) => {
					stream.emit('error', e );
				});
			}else{
				stream.resume();
			}
		});
		await promiseEvent(stream, 'end');
		return lastMomento;
	}
}

async function newTemporaryLevelStore(context){
	const db = await newTemporaryLevelDB(context);
	const eventStore = new LevelUpEventStore(db);
	return eventStore;
}

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
