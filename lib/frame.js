/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
(function(require){
	"use strict";
	
	const settings = require("./settings");
	const {preIntercept: intercept} = require("./intercept");
	const {ask} = require("./askForPermission");
	const {sha256String: hashing} = require("./hash");
	const {check: originalCheck, checkStack: originalCheckStack} = require("./check");
	const {getWrapped} = require("./modifiedAPIFunctions");
	const extension = require("./extension");
	const iframeProtection = require("./iframeProtection");
	
	const logging = require("./logging");
	const {error, warning, message, notice, verbose, setPrefix: setLogPrefix} = logging;
	setLogPrefix("frame script");
	
	// Variable to "unload" the script
	var enabled = true;
	
	message("starting", location.href);
	
	function check(message){
		if (enabled){
			return originalCheck(message);
		}
		else {
			return {type: [], mode: "allow"};
		}
	}
	function checkStack(stack){
		if (enabled){
			return originalCheckStack(stack);
		}
		else {
			return true;
		}
	}
	function askWrapper(data){
		return ask(data, {
			_: extension.getTranslation,
			prefs
		});
	}
	
	let extensionSecret;
	function computeExtensionSecret(){
		function hashString(string){
			return hashing(new Uint16Array(
				string.split("").map(function(c){
					return c.charCodeAt(0);
				})
			));
		}
		const now = new Date();
		const lastTenMinutes = Math.floor(now.getMinutes() / 10) * 10;
		const nextRun = new Date(
			now.getFullYear(), now.getMonth(), now.getDate(),
			now.getHours(), lastTenMinutes + 10, 0, 0
		);
		window.setTimeout(
			computeExtensionSecret,
			nextRun .getTime() - now.getTime()
		);
		
		let string =
			extension.extensionID +
			`${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${lastTenMinutes}`;
		extensionSecret = [hashString("input" + string), hashString(string + "output")];
	}
	computeExtensionSecret();
	
	message("open port to background script");
	var port = browser.runtime.connect();
	if (window === window.top){
		message("Is top level window -> tab had navigation -> clear page action");
		port.postMessage({"canvasBlocker-clear-page-action": true});
	}
	var tabId;
	port.onMessage.addListener(function(data){
		message("Got data from port", data);
		if (data.hasOwnProperty("tabId")){
			notice("my tab id is", data.tabId);
			tabId = data.tabId;
		}
		if (data.hasOwnProperty("cookieStoreId")){
			notice("my tab cookie store id is", data.cookieStoreId);
			const {persistent: persistentRnd} = require("./randomSupplies");
			persistentRnd.setCookieStoreId(data.cookieStoreId);
		}
		const persistentRndName = "persistent" + (extension.inIncognitoContext? "Incognito": "") + "Rnd";
		if (data.hasOwnProperty(persistentRndName)){
			const persistentRndValue = data[persistentRndName];
			notice("got persistent random data", persistentRndValue);
			const {persistent: persistentRnd} = require("./randomSupplies");
			Object.keys(persistentRndValue).forEach(function(domain){
				verbose("random data for", domain, persistentRndValue[domain]);
				persistentRnd.setDomainRnd(domain, persistentRndValue[domain]);
			});
		}
	});
	let disconnected = false;
	port.onDisconnect.addListener(function(){
		disconnected = true;
	});
	var notifications = [];
	var notificationCounter = {};
	var sentAPIs = {};
	function notify(data){
		if (!settings.ignoredAPIs[data.api]){
			if (settings.storeNotificationData){
				notifications.push(data);
			}
			if (!notificationCounter[data.messageId]){
				notificationCounter[data.messageId] = {
					count: 0,
					api: data.api
				};
			}
			notificationCounter[data.messageId].count += 1;
			if (!sentAPIs[data.api]){
				sentAPIs[data.api] = true;
				if (disconnected){
					warning("Had to reconnect port to background script.");
					port = browser.runtime.connect();
					disconnected = false;
				}
				port.postMessage({"canvasBlocker-notify": data});
			}
		}
	}
	
	function prefs(...args){
		return settings.get(...args);
	}
	
	
	var interceptedWindows = new WeakMap();
	function interceptWindow(window){
		try {
			var href = window.location.href;
			var wrappedTry = getWrapped(window);
		}
		catch (e){
			// we are unable to read the location due to SOP
			// therefore we also can not intercept anything.
			warning("NOT intercepting window due to SOP", window);
			return false;
		}
		const wrappedWindow = wrappedTry;
		
		if (!enabled || interceptedWindows.get(wrappedWindow)){
			return false;
		}
		if (wrappedWindow.matchMedia(extensionSecret[0]) === extensionSecret[1]){
			interceptedWindows.set(wrappedWindow, true);
			return false;
		}
		
		message("intercepting window", window);
		intercept(
			{subject: window},
			{check, checkStack, ask: askWrapper, notify, prefs}
		);
		message("prepare to intercept (i)frames.");
		
		function interceptAllFrames(){
			const currentLength = window.length;
			for (let i = currentLength; i--;){
				if (!interceptedWindows.get(wrappedWindow[i])){
					interceptWindow(window[i]);
				}
			}
		}
		iframeProtection.protect(window, wrappedWindow, interceptWindow, interceptAllFrames);
		
		const matchMediaDescriptor = Object.getOwnPropertyDescriptor(wrappedWindow, "matchMedia");
		const originalMatchMedia = matchMediaDescriptor.value;
		matchMediaDescriptor.value = exportFunction(function matchMedia(query){
			if (query === extensionSecret[0]){
				return extensionSecret[1];
			}
			else {
				return arguments.length > 1?
					originalMatchMedia.apply(this, wrappedWindow.Array.from(arguments)):
					originalMatchMedia.call(this, query);
			}
		}, window);
		Object.defineProperty(wrappedWindow, "matchMedia", matchMediaDescriptor);
		
		interceptedWindows.set(wrappedWindow, true);
		return true;
	}
	
	message("register listener for messages from background script");
	extension.message.on(function(data){
		if (data["canvasBlocker-unload"]){
			enabled = false;
		}
		if (
			data.hasOwnProperty("canvasBlocker-sendNotifications") &&
			data["canvasBlocker-sendNotifications"] === tabId
		){
			notice("sending notifications:", notifications);
			extension.message.send({
				sender: tabId,
				url: window.location.href,
				"canvasBlocker-notificationCounter": notificationCounter,
				"canvasBlocker-notifications": notifications
			});
			notice("notifications sent");
		}
	});
	
	interceptWindow(window);
}(require));