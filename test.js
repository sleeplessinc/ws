
log = function(s) { console.log(s) }


clients = {}

broadcast = function(m, except_client) {
	for(var k in clients) {
		var client = clients[k];
		if(client != except_client) {
			client.send(m);
		}
	}
}

cb_msgs = function(m, client) {
	log("cb_msgs "+m+" "+client.client_id)
	m.reply("you said: "+m.msg);
}

cb_ctrl = function(m, client) {
	log("cb_ctrl "+m+" "+client.client_id)
	if(m == "connect") {
		clients[client.client_id] = client;
	}
	else
	if(m == "disconnect") {
		delete clients[client.client_id]
	}
}


html = require("fs").readFileSync("./test.html")
js = require("fs").readFileSync("./sleepless-ws.js")

httpd = require('http').createServer(function(req, res) {
	log(req.method+" "+req.url);
	res.writeHead(200)
	res.end( html + "<script>\n" + js + "</script>" )
});


ws = require("./sleepless-ws.js")
ws.dbg = function(s) { log(s) }
ws.listen(httpd, function(client) {
	client.accept(function(m) {
		cb_msgs(m, client)
	}, function(m) {
		cb_ctrl(m, client)
	})
	client.send("welcome stranger")

})

httpd.listen(12345, function() {
	log("listening "+12345)
});

