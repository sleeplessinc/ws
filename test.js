
httpd = require('http').createServer(function(req, res) {
	res.writeHead(200)
	res.end(require("fs").readFileSync("./test.html"));
});

require("./sleepless-ws.js").listen(httpd, function(new_client) {

	new_client.accept(function(m) {
		m.reply("you said: "+m.msg);
	}) 

})

