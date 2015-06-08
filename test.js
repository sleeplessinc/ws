
log = function(s) { console.log(s) }


clients = {}

broadcast = function(m, except_client) {
	log("broadcast: "+o2j(m)+" to "+o2j(clients))
	for(var k in clients) {
		log("   k "+k)
		var client = clients[k];
		if(client != except_client) {
			log("bcasting to "+client.client_id)
			client.send(m);
		}
	}
}

cb_msgs = function(m, client) {
	log("cb_msgs "+o2j(m)+" "+client.client_id)
	m.reply("you said: "+m.msg);
}

cb_ctrl = function(m, client) {
	log("cb_ctrl "+m+" "+client.client_id)
	if(m == "disconnect") {
		delete clients[client.client_id]
	}
}


httpd = require('http').createServer(function(req, res) {
	log(req.method+" "+req.url);
	res.writeHead(200)

	html = require("fs").readFileSync("./test.html")
	js = require("fs").readFileSync("./sleepless-ws.js")
	js += require("fs").readFileSync("./node_modules/sleepless/sleepless.js")


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

	clients[client.client_id] = client;

	client.send({msg:"welcome"}, function(r) {
		broadcast({msg:r.nick+" has arrived"})
	})

})

httpd.listen(12345, function() {
	log("listening "+12345)
});

