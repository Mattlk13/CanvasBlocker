(function(){
	"use strict";
	
	function getParameters(context){
		const parameters = [];
		for (let name in context){
			if (name.toUpperCase() === name){
				const value = context.getParameter(context[name]);
				if (value !== null){
					parameters.push({name: name, value: value});
				}
			}
		}
		const debugExtension = context.getExtension("WEBGL_debug_renderer_info");
		
		for (let name in debugExtension){
			if (name.toUpperCase() === name){
				const value = context.getParameter(debugExtension[name]);
				if (value !== null){
					parameters.push({name: name, value: value});
				}
			}
		}
		const frontParameters = ["VENDOR", "RENDERER", "UNMASKED_VENDOR_WEBGL", "UNMASKED_RENDERER_WEBGL"];
		parameters.sort(function(a, b){
			const frontA = frontParameters.indexOf(a.name);
			const frontB = frontParameters.indexOf(b.name);
			if (frontA !== -1){
				if (frontB !== -1){
					return frontA - frontB;
				}
				else {
					return -1;
				}
			}
			else {
				if (frontB !== -1){
					return 1;
				}
				else {
					return a.name < b.name? -1: 1;
				}
			}
		});
		return parameters;
	}
	
	["webgl", "webgl2"].forEach(async function(context, index){
		const output = document.createElement("div");
		document.getElementById("output").appendChild(output);
		try {
			const canvas = document.createElement("canvas");
			canvas.width = 11;
			canvas.height = 13;
			const gl = canvas.getContext(context) || canvas.getContext("experimental-" + context);
			
			// paint it completely black
			gl.clearColor(index * 0.25, index * 0.25, index * 0.25, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
			
			const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
			gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			const values = {};
			let max = 0;
			for (let i = 0; i < pixels.length; i += 1){
				values[pixels[i]] = (values[pixels[i]] || 0) + 1;
				max = Math.max(max, values[pixels[i]]);
			}
			
			const parameters = getParameters(gl);
			if (context === "webgl2"){
				const parameterOutput = document.createElement("table");
				document.getElementById("parameters").appendChild(parameterOutput);
				parameters.forEach(function(parameter){
					const parameterRow = document.createElement("tr");
					parameterRow.innerHTML = "<td>" + parameter.name + "</td><td>" + parameter.value + "</td>";
					parameterOutput.appendChild(parameterRow);
				});
			}
			const hashBytes = await crypto.subtle.digest("SHA-256", new TextEncoder("utf-8")
				.encode(parameters.map(function(parameter){
					return parameter.name + ": " + parameter.value;
				}).join(",")));
			
			const chunks = [];
			(new Uint32Array(hashBytes)).forEach(function(num){
				chunks.push(num.toString(16));
			});
			const hash = chunks.map(function(chunk){
				return "0".repeat(8 - chunk.length) + chunk;
			}).join("");
			
			output.textContent = context + ": " +
				(max !== 3 * values[255]? "": "not ") + "supported " +
				"(parameter hash: " + hash + ")";
			output.title = JSON.stringify(values);
		}
		catch (error){
			output.textContent = context + ": ERROR";
			output.title = error;
		}
	});
}());