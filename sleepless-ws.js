
// Copyright 2015  Sleepless Software Inc.  All Rights Reserved


ws = {
	dbg: function(){},
	seq: 0,
};


if((typeof process) === 'undefined') {
	// browser (client)

	ws.connect = function(cb_msg, cb_ctrl) {

		var url = "ws://"+document.location.host
		var socket = new WebSocket(url)
		socket.onopen = function() {
			// connection to server established
			ws.dbg("connected to "+url)

			// a place for holding msgs that need a response
			var msgsWaiting = {};


			// called when socket closes
			socket.onclose = function() {
				ws.dbg("disconnected from "+url)
				for(var k in msgsWaiting) {
					var msg = msgsWaiting[k];
					delete msgsWaiting[k];
				}
				cb_ctrl("disconnect");
			}


			// messages from server arrive here
			socket.onmessage = function(evt) {

				var j = evt.data		// raw message is a utf8 string
				ws.dbg("  <--in--< "+j)
				var m = j2o(j)			// convert JSON to object
				if(typeof m !== "object") {
					ws.dbg("garbled msg: "+j);
					return;
				}

				if(m.msg) {
					// this is a server initiated msg (not a reply to my own msg)

					// set up a reply function.
					m.reply = function(data) {
						send({ msg_id: m.msg_id, response: data })
					}

					// pass msg on for processing
					cb_msg(m);
				}
				else
				if(m.response) {
					// this msg is a response to a client initiated msg

					var msg_id = m.msg_id
					var msg = msgsWaiting[msg_id]
					if(!msg) {
						ws.dbg("mysterious reply: "+msg_id)
						return
					}
					delete msgsWaiting[msg_id]

					// route response to associated call back
					var cb = msg.cb;
					if(!cb) {
						ws.dbg("reply ignored: "+msg_id)
						return
					}

					// pass msg reply on for processing
					cb(m.response)
				}
			}


			// outgoing messages go through here
			var send = function(m, cb) {

				var msg_id = m.msg_id;

				// ensure that every outgoing message has a msg_id
				if(msg_id === undefined) {
					msg_id = "C"+(ws.seq += 1);
					m.msg_id = msg_id
				}

				// presence of cb() means sender wants a reply
				if(cb) {
					m.cb = cb;
					m.ts = time();
					msgsWaiting[msg_id] = m;
				}

				// JSON encode outgoing msg and send it off
				var j = o2j(m);
				ws.dbg(">--out--> "+j);
				socket.send(j);
			}

			var sock = {
				send: send,
			}

			cb_ctrl("connect", sock);
		}
	}

}
else  {
	// node (server)

	require("sleepless")

	ws.listen = function(httpd, connect_cb) {
		var websocket = require("websocket")
		var wsd = new websocket.server({
			httpServer: httpd,
			autoAcceptConnections: false
		})

		wsd.on("request", function(req) {
			// new incoming websocket connection

			var socket = req.accept(null, req.origin);

			var client_id = "C_"+(ws.seq += 1)

			var msgsWaiting = {};

			var send = function(m, cb) {
				// ensure that every outgoing message has a msg_id
				if(m.msg_id === undefined) {
					m.msg_id = "S"+(ws.seq += 1)
				}

				if(cb) {
					m.ts = time();			// used for timing out msgs that have been waiting for too long
					msgsWaiting[m.msg_id] = m;
				}

				var j = o2j(m);
				ws.dbg("  <-- ("+client_id+") --< "+j);
				socket.sendUTF(j);
				m.cb = cb;
			};


			var accept = function(cb_msg, cb_ctrl) {

				socket.on("message", function(x) {

					var j = x.utf8Data;
					ws.dbg(">-- "+client_id+" --> "+j);
					var m = j2o(j);
					if(typeof m !== "object") {
						ws.dbg("garbled msg: "+j);
						return;
					}

					if(m.msg) {
						// this message initiated directly from client

						// set up a reply function.
						m.reply = function(data) {
							send({ msg_id: m.msg_id, response: data, });
						}

						// set up an error-reply function.
						m.error = function(err) {
							send({ msg_id: m.msg_id, error: err, response: null, })
						}

						// pass msg on for processing
						cb_msg(m)
					}
					else
					if(m.response) {
						// this is a response to a message the server sent out

						var msg_id = m.msg_id
						var msg = msgsWaiting[msg_id]
						if(!msg) {
							ws.dbg("mysterious reply: "+msg_id)
							return
						}
						delete msgsWaiting[msg_id]

						// route response to associated call back
						var cb = msg.cb;
						if(!cb) {
							ws.dbg("reply ignored: "+msg_id)
							return
						}

						// pass msg reply on for processing
						cb(m.response)
					}
				})

				socket.on("close", function() {
					cb_ctrl("disconnect")
				});

			}

			var client = {
				client_id: client_id,
				send: send,
				accept: accept,
			};

			// back reference
			socket.client = client;

			connect_cb(client);

		});

		return wsd;
	}

	module.exports = ws;

	if(require.main === module) {
		require('./test.js')
	}
}

