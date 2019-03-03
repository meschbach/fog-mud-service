
const assert = require('assert');

const levelup = require('levelup');
const leveldown = require('leveldown');

const {contextTemporaryDirectory} = require("junk-bucket/fs");

async function newTemporaryLevelDB(context){
	const dir = await contextTemporaryDirectory(context, "level-event-store-");
	return openLevelDB(context, dir);
}

function openLevelDB(context, dir ){
	const db = levelup( leveldown( dir ) );
	context.onCleanup(async function f() {
		if( db ){
			await db.close();
		}
	});
	return db;
}

module.exports = {
	newTemporaryLevelDB,
	openLevelDB
};