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

			const constObject = v0_deserialize(data.value);

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

module.exports = {
	newTemporaryLevelStore
}