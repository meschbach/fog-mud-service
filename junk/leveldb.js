const {newTempDirectory} = require("./context");

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

module.exports = {
	newTemporaryLevelDB
};