const data = require('./server_settings.json');

var player_limit = data.settings.player_limit;
var socket_port = data.settings.socket_port;
var server_port = data.settings.server_port;
var domain = data.settings.server_domain;

const WebSocketServer = require('wss').Server;
const wss = new WebSocketServer({
    port : socket_port
});

console.log("Running on port " + socket_port);

var hostconnected = 0;
var buzzer_enabled = 0;
var conndisabled = 1;

var players = {};
var pidtoNamesMap = {};
var numPlayers = 0;

var sidToPidMap = {};

var buzzOrder = [];
var used_safety = [];
var used_gamble = [];

var resetting = 0;
var timer = 0;

function shuffle(array) {
	let currentIndex = array.length,  randomIndex;
  
	// While there remain elements to shuffle.
	while (currentIndex > 0) {
  
	  // Pick a remaining element.
	  randomIndex = Math.floor(Math.random() * currentIndex);
	  currentIndex--;
  
	  // And swap it with the current element.
	  [array[currentIndex], array[randomIndex]] = [
		array[randomIndex], array[currentIndex]];
	}
  
	return array;
  }

function buzzEveryone(){
	var randomorder = [];
	for (var key in pidtoNamesMap){
		if (!buzzOrder.includes(pidtoNamesMap[key])){
			randomorder.push(pidtoNamesMap[key])
		}
	}
	randomorder = shuffle(randomorder)
	for (i in randomorder){
		buzzOrder.push(randomorder[i])
	}

}

wss.on('close', function() {
	console.log('disconnected');
});

wss.kick = function() {
	var i;
	for (i = 0; i < this.clients.length; i++) {
		this.clients[i].close();
	}
}


wss.on('connection', function(ws,req) {
	var id = createID();
	// New client connected
	ws.on('message', function(message) {
		// Received a message from a client
		var msg = JSON.parse(message);

		switch (msg.label) {

		case 'host connection':
			if (hostconnected) {
				json_obj = JSON.stringify({
					'label' : 'connection issue host',
					'id'	: msg.id
				});
				wss.clients.forEach(client => client.send(json_obj));
			} else {
				sidToPidMap[id] = -1;
				console.log("Host id: " + id)
				hostconnected = 1;
				conndisabled = 0;
				json_obj = JSON.stringify({
					'label' : 'accepted connection host',
					'id'	: msg.id
				}); 
				wss.clients.forEach(client => client.send(json_obj));
			}
			break;

		case 'client connection':
			if (conndisabled || numPlayers >= player_limit) {
				json_obj = JSON.stringify({
					'label' : 'connection issue',
					'id'	: msg.id
				});
				wss.clients.forEach(client => client.send(json_obj));
			} else {
				
				
				numPlayers += 1;
				pid = getAvailablePID();
				console.log("Player Connected: " + pid)
				players[pid] = msg.id;
				pidtoNamesMap[pid] = msg.pname; 
				sidToPidMap[id] = pid;
				
				json_obj = JSON.stringify({
					'label' : 'accepted connection client',
					'pid' 	: pid,
					'pname' : msg.pname,
					'id'	: msg.id,
					'button_status' : buzzer_enabled,
					
				});
				wss.clients.forEach(client => client.send(json_obj));
			}
			break;

		case 'toggle connections':
			if (conndisabled) {
				conndisabled = 0;
			} else {
				conndisabled = 1;
			}
			break;

		case 'enable buzz':
			buzzer_enabled = 1;
			buzzOrder = [];
			json_obj = JSON.stringify({
				'label' : 'enable buzzer',
			});
			wss.clients.forEach(client => client.send(json_obj));
			break;

		case 'buzzed_in':
			if (buzzer_enabled) {
				var pid = msg.pid;
				if (buzzOrder.indexOf(pidtoNamesMap[pid]) == -1) {
					buzzOrder.push(pidtoNamesMap[pid]);
					json_obj = JSON.stringify({
						'label' : 'buzz order',
						'order' : buzzOrder,
						'safety': used_safety,
						'gamble': used_gamble
					});
					wss.clients.forEach(client => client.send(json_obj));
				}
			}
			break;

		case 'buzz everyone':
			buzzEveryone();
			json_obj = JSON.stringify({
				'label' : 'buzz order',
				'order' : buzzOrder,
				'safety': used_safety,
				'gamble': used_gamble
			});
			wss.clients.forEach(client => client.send(json_obj));
			break;
			
		case 'disable buzz':
			buzzer_enabled = 0;
			buzzOrder = [];
			used_safety = [];
			used_gamble = [];
			json_obj = JSON.stringify({
				'label' : 'disable buzzer'
			})
			wss.clients.forEach(client => client.send(json_obj));
			break;
		
		case 'ping':
			json_obj = JSON.stringify({
				'label' : 'pong'
			})
			wss.clients.forEach(client => client.send(json_obj));
			break;

		case 'set time':	
			if (msg.timer != null){
				timer = parseInt(msg.timer);
				if (isNaN(timer)){
					timer = 0;
				}
			}
			var time_left;
			if (timer == 0){
				time_left = 0;
			}else{
				time_left = timer - 1;
			}
			json_obj = JSON.stringify({
				'label' : 'updateTimer',
				'time_left': time_left
			});
			wss.clients.forEach(client => client.send(json_obj));
			break;

		case 'used_safety':
			if (used_safety.indexOf(pidtoNamesMap[msg.pid]) == -1) {
				used_safety.push(pidtoNamesMap[msg.pid]);
			}
			break;

		case 'used_gamble':
			if (used_gamble.indexOf(pidtoNamesMap[msg.pid]) == -1) {
				used_gamble.push(pidtoNamesMap[msg.pid]);
			}
			break;

		case 'used_hint':
			json_obj = JSON.stringify({
				'label' : 'used_hint',
				'name' : pidtoNamesMap[msg.pid]
			});
			wss.clients.forEach(client => client.send(json_obj));

			break;
		
		case 'get_other_players':
			json_obj = JSON.stringify({
				'label' : 'other_players',
				'players' : Object.values(pidtoNamesMap)
			});
			wss.clients.forEach(client => client.send(json_obj));
			break;

		case 'block_player':
			json_obj = JSON.stringify({
				'label' : 'player_blocked',
				'blocked_player' : Object.keys(pidtoNamesMap).find(key => pidtoNamesMap[key] === msg.name)
			});
			wss.clients.forEach(client => client.send(json_obj));
			
			break;
		default:
			// Nothing
		}
	});
	ws.on('close', function() {
		if (!resetting) {
			var pid = sidToPidMap[id];
			var pname = pidtoNamesMap[pid];
			if (pid == -1) {
				//host disconnected
				console.log("Host disconnected! Resetting server.");
				resetting = 1;
				wss.kick();
				hostconnected = 0;
				firstBuzz = 0;
				conndisabled = 1;
				buzzer_enabled = 0;
				players = {};
				numPlayers = 0;
				sidToPidMap = {};
				resetting = 0;
			} else {
				//client disconnected
				if (pid) {
					console.log("Player " + pid + " diconnected.");
					numPlayers -= 1;
					players[pid] = null;
					sidToPidMap[id] = null;
					json_obj = JSON.stringify({
						'label' : 'remove client',
						'pid'	: pid,
						'pname' : pname
					});
					wss.clients.forEach(client => client.send(json_obj));
				}
			}
		}
	});
});

var getAvailablePID = function() {

    for (var i = 1; i <= player_limit; i++) {
		if (!players[i]) {
			return i;
		}
	}
	return -1;
}

function createID(){
    var time = new Date().getTime();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
        time += performance.now();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        let random = (time + Math.random() * 16) % 16 | 0;
        time = Math.floor(time / 16);
        return (c === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
    });
}

var express = require('express');
var serveStatic = require('serve-static');
var app = express();

app.use((req, res, next) => {
	res.setHeader('Connection', 'keep-alive');
	next();
  });
app.use(serveStatic(__dirname));
app.listen(server_port);
console.log("express server running on port " + server_port);
console.log("connect with " + domain + ":"+ server_port + "/host.html or /player_name.html");