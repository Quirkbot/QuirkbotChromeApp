(function (){
"use strict";

var HexUploader = function(){
	var self = this;

	var errors = {
		INVALID_HEX: 'INVALID_HEX',
		CONNECTION_ERROR: 'CONNECTION_ERROR',
		UNHANDLED: 'UNHANDLED'
	}

	var avrProtocol = {
		PAGE_SIZE: 128,
		PROGRAM_ADDRESS: 0,
		SOFTWARE_IDENTIFIER: 0x53, // S
		//SOFTWARE_VERSION: 0x56, // V
		ENTER_PROGRAM_MODE: 0x50, // P
		LEAVE_PROGRAM_MODE: 0x4c, // L
		SET_ADDRESS: 0x41, // A
		WRITE: 0x42, // B TODO: WRITE_PAGE
		TYPE_FLASH: 0x46, // F
		EXIT_BOOTLOADER: 0x45, // E
		CR: 0x0D, // Carriage return
		//READ_PAGE: 0x67, // g
		RESET_BITRATE: 1200,
		UPLOAD_BITRATE: 57600
	}

	/**
	 * Uploads a hex string to a connection.
	 * It will try to put the device in bootloader mode, then try to upload the
	 * hex, and finally try to restablish communication with the device.
	 **/
	var uploadHex = function(connection, hexString){
		var promise = function(resolve, reject){
			run(connection)
			.then(log('HEX-UPLOADER: Started upload process', true))
			.then(addHexDataToConnection(hexString))
			.then(log('HEX-UPLOADER: Trying to enter bootloader mode...', true))
			.then(tryToExecute(enterBootaloderMode, 10, 1000))
			.then(log('HEX-UPLOADER: Trying to upload...', true))
			.then(tryToExecute(upload, 10, 600, filterWrongSoftware))
			.then(log('HEX-UPLOADER: Trying to open the communication connection...', true))
			.then(tryToExecute(openCommunicationConnection, 10, 1000))
			.then(delay(1500))
			.then(setQuirkbotsUploadStatus('Upload completed.'))
			.then(log('HEX-UPLOADER: Upload Process Completed!', true))
			.then(removeHexDataFromConnection)
			.then(resolve)
			.catch(function(){
				setQuirkbotsUploadStatus('Upload failed.')(connection);
				delete connection.hexData;
				var rejectMessage = {
					file: 'HexUploader',
					step: 'uploadHex',
					message: 'Upload failed',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});

		}
		return new Promise(promise);
	}
	Object.defineProperty(self, 'uploadHex', {
		value: uploadHex
	});
	/**
	 * Uploads "quickly" a hex string to a connection.
	 * It is quick because it will assume device is already on bootloader mode,
	 * and will not restablish the communication connection after the upload.
	 **/
	var quickUploadHex = function(connection, hexString){
		var promise = function(resolve, reject){
			run(connection)
			.then(log('HEX-UPLOADER: Started quick upload process', true))
			.then(addHexDataToConnection(hexString))
			.then(tryToExecute(upload, 10, 600, filterWrongSoftware))
			.then(removeHexDataFromConnection)
			.then(setQuirkbotsUploadStatus('Upload completed.'))
			.then(resolve)
			.catch(function(){
				setQuirkbotsUploadStatus('Upload failed.')(connection);
				delete connection.hexData;
				var rejectMessage = {
					file: 'HexUploader',
					step: 'quickUploadHex',
					message: 'Quick upload failed',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});

		}
		return new Promise(promise);
	}
	Object.defineProperty(self, 'quickUploadHex', {
		value: quickUploadHex
	});
	// -------------------------------------------------------------------------
	var addHexDataToConnection = function(hexString){
		return function(connection){
			var promise = function(resolve, reject){
				var hexData = new CHROME_ARDUINO_INTEL_HEX(hexString).parse();
				if (hexData == "FAIL") {
					var rejectMessage = {
						file: 'HexUploader',
						step: 'addHexDataToConnection',
						message: 'Could not parse hexString.',
						payload: hexString
					}
					console.error(rejectMessage)
					reject(rejectMessage)
					return;
				}
				// pad data to correct page size
				pad(hexData, avrProtocol.PAGE_SIZE)

				connection.hexData = hexData;
				resolve(connection)
			}
			return new Promise(promise);
		}
	}
	var removeHexDataFromConnection = function(connection){
		var promise = function(resolve, reject){
			delete connection.hexData;
			resolve(connection)
		}
		return new Promise(promise);

	}
	var connectWithParams = function(options){
		return function(connection){
			var promise = function(resolve, reject){
				SerialApi.connect(connection.device.path, options)
				.then(function(connectionInfo){
					if (typeof(connectionInfo) == "undefined" ||
						typeof(connectionInfo.connectionId) == "undefined" ||
						connectionInfo.connectionId == -1){
						var rejectMessage = {
							file: 'HexUploader',
							step: 'connectWithParams',
							message: 'Could not connect',
							payload: connectionInfo
						}
						console.error(rejectMessage)
						reject(rejectMessage)
					}
					else{
						connection.connectionInfo = connectionInfo;
						resolve(connection);
					}
				})
				.catch(function(){
					var rejectMessage = {
						file: 'HexUploader',
						step: 'connectWithParams',
						message: 'Could not connect.',
						payload: arguments
					}
					console.error(rejectMessage)
					reject(rejectMessage)
				});
			}
			return new Promise(promise);
		}
	}
	var disconnect = function(connection){
		var promise = function(resolve, reject){
			SerialApi.disconnect(connection.connectionInfo.connectionId)
			.then(function(success){
				if(success){
					delete connection.connectionInfo;
					resolve(connection);
				}
				else {
					var rejectMessage = {
						file: 'HexUploader',
						step: 'disconnect',
						message: 'Could not disconnect',
						payload: ''
					}
					console.error(rejectMessage)
					reject(rejectMessage)
				}
			})
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'disconnect',
					message: 'Could not disconnect',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var disconnectAnyway = function(connection){
		var promise = function(resolve, reject){
			if(!connection.connectionInfo){
				run(connection)
				.then(log('HEX-UPLOADER: Desconnecting: skipped!', true))
				.then(resolve)
				return;
			}
			run(connection)
			.then(log('HEX-UPLOADER: Desconnecting: using SerialApi...', true))
			.then(disconnect)
			.then(log('HEX-UPLOADER: Disconnected!', true))
			.then(resolve)
			.catch(function(){
				resolve(connection)
			})
		}
		return new Promise(promise);
	}
	var send = function(payload){
		return function(connection){
			var promise = function(resolve, reject){
				SerialApi.send(connection.connectionInfo.connectionId, hexToBin(payload))
				.then(function(sendInfo){
					if(sendInfo.error){
						var rejectMessage = {
							file: 'HexUploader',
							step: 'send',
							message: 'Could not send',
							payload: sendInfo
						}
						console.error(rejectMessage)
						reject(rejectMessage)
					}
					else resolve(connection)
				})
				.catch(function () {
					var rejectMessage = {
						file: 'HexUploader',
						step: 'send',
						message: 'SerialApi.send rejected.',
						payload: arguments
					}
					console.error(rejectMessage)
					reject(rejectMessage)
				})
			}
			return new Promise(promise);
		}
	}
	var waitForResponse = function(response){
		var timeout = 500;
		return function(connection){
			var promise = function(resolve, reject){
				var onReceive = function(message){
					if(message.connectionId != connection.connectionInfo.connectionId)
						return;

					var buffer = new Uint8Array(message.data);

					if(compareArrays(buffer, response)){
						chrome.serial.onReceive.removeListener(onReceive);
						clearTimeout(timer);
						resolve(connection)
					}
					else {
						chrome.serial.onReceive.removeListener(onReceive);
						clearTimeout(timer);

						// for a more useful error message, we convert the
						// buffer to string, but first it needs to be a norma
						// array not a Uint8Array.
						var bufferAsNormalArray = Array.prototype.slice.call(buffer);
						bufferAsNormalArray.length === buffer.length;
						bufferAsNormalArray.constructor === Array;
						var rejectMessage = {
							file: 'HexUploader',
							step: 'waitForResponse',
							message: 'Response did not match.',
							payload: {
								char: [buffer, response],
								string: [bufferAsNormalArray.map(String.fromCharCode), response.map(String.fromCharCode)]
							}
						}
						console.error(rejectMessage)
						reject(rejectMessage);
					}
				}
				chrome.serial.onReceive.addListener(onReceive);

				var timer = setTimeout(function(){
					chrome.serial.onReceive.removeListener(onReceive);
					var rejectMessage = {
						file: 'HexUploader',
						step: 'waitForResponse',
						message: 'Response timeout.',
						payload: ''
					}
					console.error(rejectMessage)
					reject(rejectMessage);
				}, timeout)
			}
			return new Promise(promise);
		}
	}
	var writeAndGetResponse = function(payload, response){
		return function(connection){
			var promise = function(resolve, reject){
				run(connection)
				.then(send(payload))
				.then(waitForResponse(response))
				.then(resolve)
				.catch(function(){
					var rejectMessage = {
						file: 'HexUploader',
						step: 'writeAndGetResponse',
						message: 'Could not write and get response.',
						payload: arguments
					}
					console.error(rejectMessage)
					reject(rejectMessage)
				});
			}
			return new Promise(promise);
		}
	}
	var waitForSameDeviceToDisappear = function(connection){
		var promise = function(resolve, reject){
			var count = 0;
			var check = setInterval(function(){
				SerialApi.getDevices()
				.then(function(devices){
					count++;
					var exists = false;
					for (var i = 0; i < devices.length; i++) {
						console.log('HEX-', devices[i].path, connection.device.path)
						if(devices[i].path == connection.device.path){
							exists = true;
							break;
						}
					};
					if(!exists){
						clearInterval(check);
						resolve(connection)
						return;
					}
					if(count == 50){
						clearInterval(check);
						var rejectMessage = {
							file: 'HexUploader',
							step: 'waitForSameDeviceToDisappear',
							message: 'Device never disappeared.',
							payload: ''
						}
						console.error(rejectMessage)
						reject(rejectMessage)
					}
				})

			}, 150)
		}
		return new Promise(promise);
	}
	var waitForNewDeviceToAppear = function(connection){
		var promise = function(resolve, reject){
			SerialApi.getDevices()
			.then(function(intialDevices){
				var count = 0;
				var initialPaths = {}
				intialDevices.forEach(function(device){
					initialPaths[device.path] = true;
				})
				var check = setInterval(function(){
					SerialApi.getDevices()
					.then(function(devices){
						count++;
						for (var i = 0; i < devices.length; i++) {
							if(!initialPaths[devices[i].path]){
								clearInterval(check);
								connection.device.originalPath = connection.device.path;
								connection.device.path = devices[i].path;
								resolve(connection)
								return;
							}
						};
						if(count == 50){
							clearInterval(check);
							var rejectMessage = {
								file: 'HexUploader',
								step: 'waitForNewDeviceToAppear',
								message: 'Device never appeared.',
								payload: ''
							}
							console.error(rejectMessage)
							reject(rejectMessage)
						}
					})

				}, 150)
			});

		}
		return new Promise(promise);
	}
	var waitForSameDeviceToAppear = function(connection){
		var promise = function(resolve, reject){
			var count = 0;
			var check = setInterval(function(){
				SerialApi.getDevices()
				.then(function(devices){
					count++;
					var exists = false;
					for (var i = 0; i < devices.length; i++) {
						if(devices[i].path == connection.device.path){
							exists = true;
							break;
						}
					};
					if(exists){
						clearInterval(check);
						resolve(connection)
						return;
					}
					if(count == 20){
						clearInterval(check);
						var rejectMessage = {
							file: 'HexUploader',
							step: 'waitForSameDeviceToAppear',
							message: 'Device never appeared.',
							payload: ''
						}
						console.error(rejectMessage)
						reject(rejectMessage)
					}
				})

			}, 1)
		}
		return new Promise(promise);
	}
	var setQuirkbotsUploadProgress = function(progress) {
		return function(connection){
			var promise = function(resolve, reject){
				connection.quirkbot.upload.progress = progress;
				resolve(connection);
			}
			return new Promise(promise);
		}
	}
	var setQuirkbotsUploadStatus = function(status) {
		return function(connection){
			var promise = function(resolve, reject){
				connection.quirkbot.upload.status = status;
				resolve(connection);
			}
			return new Promise(promise);
		}
	}
	var enterBootaloderMode = function(connection){
		var promise = function(resolve, reject){
			run(connection)
			.then(setQuirkbotsUploadStatus('Reseting...'))
			.then(setQuirkbotsUploadProgress(0))
			.then(log('HEX-UPLOADER: Making sure port is disconnected', true))
			.then(disconnectAnyway)
			.then(delay(100))
			.then(log('HEX-UPLOADER: Triggering reset by opening and closing a '+avrProtocol.RESET_BITRATE+' baudrate connection', true))
			.then(connectWithParams({bitrate: avrProtocol.RESET_BITRATE}))
			.then(delay(300))
			.then(disconnect)
			.then(log('HEX-UPLOADER: Waiting for device to disappear.', true))
			.then(waitForSameDeviceToDisappear)
			.then(log('HEX-UPLOADER: Waiting for a new device to appear.', true))
			.then(waitForNewDeviceToAppear)
			.then(log('HEX-UPLOADER: Entered bootloader mode!', true))
			.then(resolve)
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'enterBootaloderMode',
					message: 'Could not enter bootloader mode.',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var upload = function(connection){
		var promise = function(resolve, reject){
			run(connection)
			.then(log('HEX-UPLOADER: Opening connection for upload...', true))
			.then(disconnectAnyway)
			.then(delay(100))
			.then(openUploadConnection)
			.then(log('HEX-UPLOADER: Checking for software indetifier "QUIRKBO" (confirms Quirkbot bootloader).', true))
			.then(checkSoftware('QUIRKBO'))
			.then(log('HEX-UPLOADER: Entering program mode...', true))
			.then(enterProgramMode)
			.then(log('HEX-UPLOADER: Setting programing address...', true))
			.then(setProgrammingAddress)
			.then(setQuirkbotsUploadStatus('Uploading...'))
			.then(log('HEX-UPLOADER: Write pages...', true))
			.then(writePagesRecursivelly)
			.then(setQuirkbotsUploadStatus('Connecting...'))
			.then(log('HEX-UPLOADER: Leaving program mode...', true))
			.then(leaveProgramMode)
			.then(log('HEX-UPLOADER: Exiting bootloader...', true))
			.then(exitBootlader)
			.then(setQuirkbotsUploadProgress(1))
			.then(resolve)
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'upload',
					message: 'Could not upload.',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var openUploadConnection = function(connection){
		var promise = function(resolve, reject){
			run(connection)
			.then(log('HEX-UPLOADER: Connecting with '+avrProtocol.UPLOAD_BITRATE+' baudrate', true))
			.then(connectWithParams({bitrate: avrProtocol.UPLOAD_BITRATE}))
			.then(delay(500))
			.then(resolve)
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'openUploadConnection',
					message: 'Could not open connection.',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var openCommunicationConnection = function(connection){
		var promise = function(resolve, reject){
			run(connection)
			.then(disconnectAnyway)
			.then(delay(2000))
			.then(log('HEX-UPLOADER: Connecting with 115200 baudrate', true))
			.then(connectWithParams({
				bitrate: 115200,
				persistent: true,
				name: connection.device.path
			}))
			.then(delay(500))
			.then(resolve)
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'openCommunicationConnection',
					message: 'Could not open connection.',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var enterProgramMode = function(connection){
		var promise = function(resolve, reject){
			run(connection)
			.then(writeAndGetResponse([avrProtocol.ENTER_PROGRAM_MODE], [avrProtocol.CR]))
			.then(log('HEX-UPLOADER: Entered program mode!', true))
			.then(resolve)
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'enterProgramMode',
					message: 'Could not enter program mode.',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var checkSoftware = function(identifier){
		return function (connection) {
			var identifierChars = identifier.split('').map(function(s){
				return s.charCodeAt(0);
			})
			var promise = function(resolve, reject){
				run(connection)
				.then(writeAndGetResponse([avrProtocol.SOFTWARE_IDENTIFIER], identifierChars))
				.then(log('HEX-UPLOADER: Software match!', true))
				.then(resolve)
				.catch(function(){
					var rejectMessage = {
						file: 'HexUploader',
						step: 'checkSoftware',
						message: 'Could check software.',
						payload: arguments
					}
					console.error(rejectMessage)
					reject(rejectMessage)
				});
			}
			return new Promise(promise);
		}
	}
	var leaveProgramMode = function(connection){
		var promise = function(resolve, reject){
			run(connection)
			.then(writeAndGetResponse([avrProtocol.LEAVE_PROGRAM_MODE], [avrProtocol.CR]))
			.then(log('HEX-UPLOADER: Left program mode!', true))
			.then(resolve)
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'leaveProgramMode',
					message: 'Could not leave program mode.',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var exitBootlader = function(connection){
		var promise = function(resolve, reject){
			run(connection)
			.then(writeAndGetResponse([avrProtocol.EXIT_BOOTLOADER], [avrProtocol.CR]))
			.then(log('HEX-UPLOADER: Exited bootloader!', true))
			.then(resolve)
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'exitBootlader',
					message: 'Could not leave program mode.',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var setProgrammingAddress = function(connection){
		var promise = function(resolve, reject){
			var addressBytes = storeAsTwoBytes(avrProtocol.PROGRAM_ADDRESS);
			run(connection)
			.then(writeAndGetResponse(
				[
					avrProtocol.SET_ADDRESS,
					addressBytes[0],
					addressBytes[1]
				],
				[avrProtocol.CR])
			)
			.then(log('HEX-UPLOADER: Address set!', true))
			.then(resolve)
			.catch(function(){
				var rejectMessage = {
					file: 'HexUploader',
					step: 'enterProgramMode',
					message: 'Could not enter program mode.',
					payload: arguments
				}
				console.error(rejectMessage)
				reject(rejectMessage)
			});
		}
		return new Promise(promise);
	}
	var writePagesRecursivelly = function(connection) {
		var promise = function(resolve, reject){
			var numPages = connection.hexData.length / avrProtocol.PAGE_SIZE;

			var page = 0;
			var write = function(){
				run(connection)
				.then(log('HEX-UPLOADER: Writing page ' + (page + 1) + '/' + numPages, true))
				.then(writePage(page))
				.then(setQuirkbotsUploadProgress((page + 1) /  numPages))
				.then(function() {
					page++;
					if(page == numPages){
						resolve(connection)
					}
					else write();
				})
				.catch(function(){
					var rejectMessage = {
						file: 'HexUploader',
						step: 'writePagesRecursivelly',
						message: 'Error writing one of the pages.',
						payload: arguments
					}
					console.error(rejectMessage)
					reject(rejectMessage)
				});
			}
			write();

		}
		return new Promise(promise);
	}
	var writePage = function(pageNo) {
		return function(connection){
			var promise = function(resolve, reject){
				var payload =  connection.hexData.slice(
					pageNo *  avrProtocol.PAGE_SIZE,
					(pageNo + 1) *  avrProtocol.PAGE_SIZE
				);

				var sizeBytes = storeAsTwoBytes(avrProtocol.PAGE_SIZE);

				run(connection)
				.then(
					writeAndGetResponse(
						[ avrProtocol.WRITE, sizeBytes[0], sizeBytes[1], avrProtocol.TYPE_FLASH ].concat(payload),
						[ avrProtocol.CR ]
					)
				)
				.then(resolve)
				.catch(function(){
					var rejectMessage = {
						file: 'HexUploader',
						step: 'writePage',
						message: 'Error writing page.',
						payload: arguments
					}
					console.error(rejectMessage)
					reject(rejectMessage)
				});

			}
			return new Promise(promise);
		}
	}
	// Utils -------------------------------------------------------------------
	var filterWrongSoftware = function (error) {
		return new Promise(function(resolve, reject){
			if(error.step == 'upload' && error.payload && error.payload.length){
				if(error.payload[0].step == 'checkSoftware'){
					reject(error);
					return;
				}
			}
			resolve();
		});
	}
	var compareArrays = function(a,b){
		if(a.length != b.length) return false;

		for (var i = 0; i < a.length; i++) {
			if(a[i] != b[i])
				return false;
		};

		return true;
	}
	var binToHex = function(bin) {
		var bufferView = new Uint8Array(bin);
		var hexes = [];
		for (var i = 0; i < bufferView.length; ++i) {
			hexes.push(bufferView[i]);
		}
		return hexes;
	}

	var hexToBin = function(hex) {
		var buffer = new ArrayBuffer(hex.length);
		var bufferView = new Uint8Array(buffer);
		for (var i = 0; i < hex.length; i++) {
			bufferView[i] = hex[i];
		}
		return buffer;
	}
	var storeAsTwoBytes = function(n) {
		var lo = (n & 0x00FF);
		var hi = (n & 0xFF00) >> 8;
		return [hi, lo];
	}
	var pad = function(data, pageSize) {
		while (data.length % pageSize != 0) {
			data.push(0);
		}
		return data;
	}
	// -------------------------------------------------------------------------

}

if(typeof define !== 'undefined'){
	define([], function(){
		return HexUploader;
	});
}
else if (typeof exports !== 'undefined'){
	exports.HexUploader = HexUploader;
}
else window.HexUploader = HexUploader;

})();
