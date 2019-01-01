
const {makeTempDir, rmRecursively} = require("junk-bucket/fs");

async function newTempDirectory( context, template ){
	const dir = await makeTempDir(template);
	context.onCleanup(async function () {
		await rmRecursively(dir);
	});
	return dir;
}

module.exports = {
	newTempDirectory
};
