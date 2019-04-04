const express = require("express");
const {make_async} = require("junk-bucket/express");

function objectBackupHTTP( logger, metadataStorage ) {
	const router = make_async(express.Router());
	router.a_get("/", async function( req, resp ){
		const fromVersion = undefined;
		const toRevision = await metadataStorage.currentVersion();
		logger.info("Backup request from ", {fromVersion, toRevision});

		const changes = await metadataStorage.objectChangesBetween(fromVersion, toRevision);
		logger.info("Changes", changes);
		resp.json({
			continuation: JSON.stringify(toRevision),
			changes
		});
	});

	router.a_get("/:id", async function( req, resp ){
		const fromVersion = JSON.parse(req.params["id"]);
		const toRevision = await metadataStorage.currentVersion();
		logger.info("Backup request from ", {fromVersion, toRevision});

		const changes = await metadataStorage.objectChangesBetween(fromVersion, toRevision);
		logger.info("Changes", changes);
		resp.json({
			continuation: JSON.stringify(toRevision),
			changes
		})
	});
	return router;
}

module.exports = {
	objectBackupHTTP
};
