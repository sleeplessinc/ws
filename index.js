
// Copyright 2017  Sleepless Software Inc.  All Rights Reserved


ws = {
	dbg: function(){},
	seq: 0,
};


if((typeof process) === 'undefined') {
	// browser (client)

	ws.open = function(path) {

		var url = (document.location.protocol == "https:" ? "wss" : "ws")+"://"+document.location.host+"/"+path
		var waiting = {}
		var queue_out = []
		var retries = 1;

		var establish = function() {
			ws.dbg("establish");
			con.socket = new WebSocket(url)
            con.socket.onopen = function() {
                retries = 1;
                drain()
            }
			con.socket.onclose = function() {
				con.socket = null
				//waiting = {}					// discard any waiting msgs 
				if(retries < 10) {
					ws.dbg("retry "+retries);
					setTimeout(establish, retries * 1000)		// attempt to reestablish contact in 2 seconds
					retries += 1;
				}
				else {
					ws.dbg("giving up");
				}
			}
			con.socket.onmessage = function(evt) {
				var j = evt.data		// raw message is a utf8 string
				ws.dbg("  <--in--< "+j)
				var m = j2o(j)			// convert JSON to object
				if(typeof m !== "object") {
					con.onerror("incoming msg garbled: "+j);
				}
				else
				if(m.error) {
					con.onerror(m)
				}
				else
				if(m.response) {
					// response to a client initiated msg
					var mid = m.msg_id
					var mm = waiting[mid]
					if(mm) {
						delete waiting[mid]		// remove from waiting area
						if(mm.cb) {
							mm.cb(m)		// route response to associated call back
						}
						else {
							ws.dbg("reply ignored: "+mid)
						}
					}
					else {
						ws.dbg("unexpected reply: "+mid)
					}
				}
				else {
					// server initiated msg (not a reply to my own msg)
					// set up a reply function.
					m.reply = function(data) {
						con.send({ msg_id: m.msg_id, response: data })
					}
					// pass msg on for processing
					con.onmessage(m);
				}
			},
			con.socket.onerror = function(a) {
				con.onerror.apply(this, arguments)
			}
		}

		var drain = function() {
			ws.dbg("drain");
			if(con.socket) {
				while(queue_out.length > 0) {
					var m = queue_out.shift()
					var j = o2j(m);
					ws.dbg(">--out-->  "+j)
					con.socket.send(j);
					if(m.cb) {
						// presence of cb() means sender wants a reply
						waiting[m.msg_id] = m;
					}
				}
			}
			else {
				establish()
			}
		}

		var send = function(m, cb) {
			var mid = m.msg_id;
			if(mid === undefined) {
				mid = "C"+(ws.seq += 1);
				m.msg_id = mid
			}
			m.cb = cb || null;
			m.ts = time();
			queue_out.push(m)
			drain()
		}

		var con = {
			socket: null,
			send: send,
			onerror: function(){},
			onmessage: function(){},
		}

		return con
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

			var ssend = function( str, cb ) {
				send( { message: str }, function(r) {
					cb(r.response);
				});
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
						
						m.sreply = function( str ) {
							m.reply( { response: str } );
						};

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
				socket: socket,
				client_id: client_id,
				send: send,
				ssend: ssend,
				accept: accept,
				req: req
			};

			// back reference
			socket.client = client;

			// connect_cb() should either accept or close client.socket
			connect_cb(client);

		});

		return wsd;
	}

	module.exports = ws;

	if(require.main === module) {
		require('./test.js')
	}
}

