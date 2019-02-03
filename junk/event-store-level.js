const {promiseEvent} = require("junk-bucket/future");
const {last} = require("junk-bucket/arrays");

const {newTemporaryLevelDB} = require("./leveldb");

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

function v0_deserialize( dbRepresentation ) {
	const stringRepresentation = dbRepresentation.toString("utf-8");
	const event = JSON.parse(stringRepresentation);
	return Object.freeze(event);
}

class LevelUpEventStore {
	constructor( db ){
		this.db = db;
		this._id = 0;
	}

	_termID(){
		if(this._term === undefined ){
			this._term = this._getTerm();
		}
		return this._term;
	}

	async _getTerm() {
		const lastTerm = await level_keyOptional(this.db,"v0/term");
		let term;
		if( lastTerm ){
			term = parseInt( lastTerm ) + 1;
		} else {
			term = 0;
		}
		await this.db.put("v0/term", term);
		return term;
	}

	_nextID(){
		const id = this._id + 1;
		this._id = id;

		return this._termID().then( term => {
			return {
				term: term,
				id
			}
		});
	}

	currentVersion(){
		const id = this._id;
		return this._termID().then( term => {
			return {
				term: term,
				id
			}
		});
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

	async publish( event ){
		const dbRepresentation = JSON.stringify(event);
		const momento = await this._nextID();
		const key = momento_key(momento);
		await this.db.put(key, dbRepresentation);
		return momento;
	}

	async byMomento( momento ){
		const key = momento_key(momento);
		const dbRepresentation = await this.db.get( key );
		return v0_deserialize(dbRepresentation);
	}

	async replay( consumer, fromMomento = {} ){
		const maxTerm = await this._getTerm();
		let term = fromMomento.term || 0;
		let id = fromMomento.id || 1;
		let lastGoodMomento;
		let hadMore;
		const prefix = "v0/events";
		do {
			const key = prefix + "/" + term + "/" + id;
			const record = await level_keyOptional(this.db, key);
			if( !record ){
				if( term >= maxTerm ){
					hadMore = false;
				} else {
					term++;
					id = 1;
				}
			} else {
				hadMore = true;
				const momento = Object.freeze({term,id});
				const constObject = v0_deserialize(record);
				await consumer(momento, constObject);
				id++;
				lastGoodMomento = momento;
			}
		} while( hadMore );
		return lastGoodMomento;
	}
}

async function newTemporaryLevelStore(context){
	const db = await newTemporaryLevelDB(context);
	const eventStore = new LevelUpEventStore(db);
	return eventStore;
}

module.exports = {
	newTemporaryLevelStore,
	LevelUpEventStore
}