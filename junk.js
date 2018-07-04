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

module.exports = {
	sha256_from_string
};