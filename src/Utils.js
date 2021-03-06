var Utils = {};
window.Utils = Utils

Utils.ENABLE_LOG = true;
/**
 * A passthrough promise generator.
 * It will simply resolve with all the arguments it was given
 */
Utils.run = function(){
	var payload = arguments;
	return new Promise(function(resolve){
		resolve.apply(null, payload);
	});
}
/**
 * Will try for a specific number of times, and only reject if it fails in all
 * of those tries.
 * Alternatively, a filter can be passed to decide if it should reject before
 * reaching the maxium number of tries.
 *
 * @param {function} process - A process to be tried. A process needs to return
 * a function that returns a promise.
 * @param {number} [maxTries=10] - How many times should the process be tried before
 * rejecting.
 * @param {number} [interval=1000] - Milliseconds between each try.
 * @param {function} [earlyRejectFilter=run] - A filter function that takes in
 * reject payload of the process, and  returns a promise that rejects if it
 * should reject early, or resolves if it should continue trying.
 */
Utils.tryToExecute = function(label, process, maxTries, interval, earlyRejectFilter){
	maxTries = maxTries || 1;
	interval = interval || 1000;
	earlyRejectFilter = earlyRejectFilter || Utils.run;
	label = label || 'Try to execute';
	return function(){
		var payload = arguments;
		var promise = function(resolve, reject){
			var count = 0;
			var recursiveTry = function(){
				Utils.run.apply(null, arguments)
				.then(Utils.log(label + ': trial (' + (count+1) + '/' + maxTries + ')', true))
				.then(process)
				.then(resolve)
				.catch(function(){
					count++;
					// If the process failed too many times, reject it
					if(count >= maxTries){
						var rejectMessage = {
							file: 'Utils',
							step: 'tryToExecute',
							message: 'Failed trying to execute '+maxTries+' times.',
							payload: arguments
						}
						console.error(rejectMessage)
						reject(rejectMessage)
					}
					else{
						// If the process failed, check if it passes the
						// earlyRejectFilter, for a quick reject, or if it
						// should continue trying,
						Utils.run.apply(null, arguments)
						.then(earlyRejectFilter)
						.then(function () {
							setTimeout(function(){
								recursiveTry.apply(null, payload);
							}, interval);
						})
						.catch(reject)
					}
				})
			}
			recursiveTry.apply(null, payload);

		}
		return new Promise(promise);
	}
}
Utils.log = function(label, ignorePayload){
	var fn =  function(){
		var payload = arguments;
		var promise = function(resolve, reject){
			if(Utils.ENABLE_LOG){
				if(ignorePayload){
					console.log('%c'+label , 'font-weight: bold')
				}
				else{
					for (var i = 0; i < payload.length; i++) {
						console.log(
							'%c' + label +
							' %c \n' +
							JSON.stringify(payload[i],  null, "\t"),
							'font-weight: bold',
							'font-weight: normal'
						);
					};
				}
			}
			resolve.apply(null, payload);
		}
		return new Promise(promise);
	}

	return fn;
}
Utils.delay = function(millis){
	return function(){
		var payload = arguments;
		var promise = function(resolve, reject){
			setTimeout(function(){
				resolve.apply(null, payload);
			}, millis)
		}
		return new Promise(promise);
	}
}


Utils.safeWhile = function(conditionFn, loopFn, errorFn, maxIterations){
	maxIterations = maxIterations || 500;
	var count =  0;
	var forceBreak = false;
	var breakFn = function(){
		forceBreak = true;
	}
	if(typeof loopFn !== 'function'){
		console.error('safeWhile: 2nd argument is not a function!');
	}
	while(conditionFn()){
		count++;
		if(count > maxIterations){
			console.error('safeWhile: loop is stuck!');
			if(typeof errorFn === 'function'){
				errorFn();
			}
			break;
		}
		else if(forceBreak){
			break;
		}
		loopFn(breakFn);
	}
}

Utils.compareArrays = function(a,b){
	if(a.length != b.length) return false;

	for (var i = 0; i < a.length; i++) {
		if(a[i] != b[i])
			return false;
	};

	return true;
}
Utils.binToHex = function(bin) {
	var bufferView = new Uint8Array(bin);
	var hexes = [];
	for (var i = 0; i < bufferView.length; ++i) {
		hexes.push(bufferView[i]);
	}
	return hexes;
}
Utils.hexToBin = function(hex) {
	var buffer = new ArrayBuffer(hex.length);
	var bufferView = new Uint8Array(buffer);
	for (var i = 0; i < hex.length; i++) {
		bufferView[i] = hex[i];
	}
	return buffer;
}
Utils.storeAsTwoBytes = function(n) {
	var lo = (n & 0x00FF);
	var hi = (n & 0xFF00) >> 8;
	return [hi, lo];
}
Utils.pad = function(data, pageSize) {
	Utils.safeWhile(
		function () {
			return data.length % pageSize != 0;
		},
		function () {
			data.push(0);
		}
	);

	return data;
}
Utils.objectArrayDiffByKey = function(A, B, key) {
	var map = {}, C = [];

	for(var i = B.length; i--; )
		map[B[i][key]] = true;

	for(var i = A.length; i--; ) {
	if(!map.hasOwnProperty(A[i][key]))
		C.push(A[i]);
	}

	return C;
}

Utils.mapProperty = function(array, property) {
	return array.map(function(item) {
		return item[property];
	})
}
