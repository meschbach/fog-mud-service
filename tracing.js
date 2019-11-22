const {initTracerFromEnv} = require('jaeger-client');

function attachTracing( context, name ){
	const config = {
		serviceName: name || context.name
	};

	context.tracer = initTracerFromEnv(config);
}

module.exports = {
	attachTracing
};
