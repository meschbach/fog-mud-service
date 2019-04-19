/***********************************************************************************************************************
 * Utilities without a proper home at this time.
 *
 * Some of these are likely to find a home in junk-bucket.
 **********************************************************************************************************************/

/***********************************************************************************************************************
 * Cryptography related
 **********************************************************************************************************************/
const crypto = require('crypto');
function sha256_from_string( str ){
	const hash = crypto.createHash('sha256');
	hash.update(str);
	return hash.digest("hex");
}

/***********************************************************************************************************************
 * File System Promise adapters
 **********************************************************************************************************************/
const {promiseEvent} = require("junk-bucket/future");
const {makeTempDir, mkdir, mkdtemp, rmRecursively} = require("junk-bucket/fs");

/***********************************************************************************************************************
 * Level Database
 **********************************************************************************************************************/

const levelup = require('levelup');
const leveldown = require('leveldown');

/**
 * Creates a new LevelUp instance within a temporary directory
 * @returns {Promise<{}>}
 */
async function level_mktemp() {
	const dir = await makeTempDir("level-");
	const db = levelup(leveldown( dir ));

	return {
		close: async function(){
			if( db.isOpen() ){
				await db.close();
			}
			await rmRecursively(dir);
		},
		db
	};
}

async function level_forEachKey( db, onKey ){
	await promiseEvent( db.createKeyStream().on('data', ( rawKey ) => {
		const fullKey = rawKey.toString('utf-8');
		onKey(fullKey);
	}), 'end');
}

/**********************************************************
 * Express
 **********************************************************/
const morgan = require("morgan");
function logMorganTo(logger){
	return morgan('short', {
		stream: {
			write: function (message) {
				logger.info(message.trim());
			}
		}
	})
}

/**********************************************************
 * Streams
 **********************************************************/
const {PassThrough} = require("stream");

class FinishOnResolve extends PassThrough {
	constructor(response, onFlush) {
		super();
		this._response = response;
		this._onFlush = onFlush;
	}

	_flush(callback) {
		this._onFlush();
		this._response.then(
			() => {
				callback()
			},
			(problem) => callback(problem)
		);
	}
}


/**********************************************************
 * streaming requests
 **********************************************************/
const Future = require("junk-bucket/future");
const request = require("request");

/**
 * Blocks a request entity from being considered complete until response headers have been received and interpreted.
 * This is helpful for streaming entities of unknown sizes.
 *
 * @param opts request options
 * @param interpretResponse a possibly async function to interpret the response body
 * @returns {Writable} a writable which will not finish until the response is received and interpreted
 */
function streamRequestEntity( opts, interpretResponse ) {
	const query = request(opts);
	const responseCompletion = new Future();
	query.on("response", function (response) {
		interpretResponse(response, responseCompletion)
			.then( function(){
				if(!responseCompletion.resolved) {
					responseCompletion.accept();
				}
			}, function (problem) {
				if(!responseCompletion.resolved) {
					responseCompletion.reject(problem);
				}
			});
	});
	const gate = new FinishOnResolve(responseCompletion.promised, () => query.end());
	gate.pipe(query);
	return gate;
}


/***********************************************************************************************************************
 * Exports
 **********************************************************************************************************************/
module.exports = {
	sha256_from_string,

	fs_mkdir: mkdir,
	fs_mkdtemp: mkdtemp,

	level_mktemp,
	level_forEachKey,

	logMorganTo,
	FinishOnResolve,
	streamRequestEntity
};
