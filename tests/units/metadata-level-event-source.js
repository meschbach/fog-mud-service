const {level_mktemp, level_forEachKey} = require("../../junk");
const {EventStore} = require("junk-bucket/event-store");
const {parallel} = require("junk-bucket/future");
const assert = require("assert");

class LevelUpEventStore {
	constructor( database ){
		this.db = database;
	}

	async save( record ){
		await this.db.put( "v0/r" + Date.now(), JSON.stringify(record) );
	}

	async all(){
		const keys = [];
		await level_forEachKey( this.db, (key) => {
			keys.push( key );
		});
		return await parallel(keys.map( async (k) => {
			const value = (await this.db.get(k)).toString("utf-8");
			return JSON.parse(value);
		}));
	}
}

function and( ...what ){
	return function( event ) {
		return what.every(f => f(event));
	}
}

function gate( key, value ){
	return function( event ){
		return event && event[key] == value;
	}
}

function inDomain( which ){ return gate( "domain", which); }
function ofType( which ){ return gate( "type", which ); }
function inContainer( named ) { return gate("container", named ); }
function withKeyPrefix( prefix ) { return (event) => (event.key || "").startsWith(prefix) }
function withKey( key ) { return gate("key", key) }

class LevelStreamStorage {
	constructor(events){
		this.events = events;
	}

	async stored( user, container, key, node, block ){
		await this.events.store({v:0, domain: "mud", type: "object", op: "stored", who: user, container, key, node, block});
	}

	async stats( container, key ){
		const allEvents = await this.events.all();
		const interestedEvents = allEvents.filter( and(inDomain("mud"), ofType("object"), inContainer(container), withKey( key ) ));
		const projection = interestedEvents.reduce( (state, event) => {
			return event;
		}, {});
		console.log(projection);
		return projection;
	}

	async list( container, prefix ){
		const allEvents = await this.events.all();
		const interestedEvents = allEvents.filter( and(inDomain("mud"), ofType("object"), inContainer(container), withKeyPrefix( prefix ) ));
		const projection = interestedEvents.reduce( (state, event) => {
			state.push( event.key );
			return state;
		}, []);
		return projection;
	}
}

describe( "Given a level database", function(){
	beforeEach(async function(){
		this.user_id = "fear delight";
		this.level = await level_mktemp();
		this.db = this.level.db;
		this.storage = new LevelStreamStorage(new EventStore(new LevelUpEventStore(this.db)));
	});

	afterEach(async function () {
		try {
			await this.level.close();
		}catch(e){
			console.error(e.bad);
			throw e;
		}
	});

	describe("when an object is stored under a key in a node and block", function(){
		beforeEach(async function () {
			this.container = "fall";
			this.key = "in";

			this.node = "peaceful";
			this.block = "storm";

			await this.storage.stored( this.user_id, this.container, this.key, this.node, this.block );
		});

		it("can recall the node and block", async function() {
			const stat = await this.storage.stats( this.container, this.key );
			console.log(stat);
			assert.equal(stat.who, this.user_id);
			assert.equal(stat.node, this.node);
			assert.equal(stat.block, this.block);
		});

		it("can list the key in the container", async function() {
			const list = await this.storage.list( this.container, "" );
			assert( list.includes(this.key) );
		});
	})
});
