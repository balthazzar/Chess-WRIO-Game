"use strict";

var Titter = new(require('./app.js'))(),
	nconf = require('./wrio_nconf.js'),
	express = require('express'),
	app = express(),
	db = require('./utils/db.js'),
	secure = require("./utils/secure.js"),
	DOMAIN = nconf.get('server:workdomain'),

	session = require('express-session'),
	bodyParser = require('body-parser'),
	cookieParser = require('cookie-parser'),
	cookie_secret = nconf.get("server:cookiesecret"),
	chessController = new(require('./persistent/controller.js'))();

app.use(function(request, response, next) {
	response.setHeader('Access-Control-Allow-Origin', 'http://wrioos.com');
	response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
	response.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
	response.setHeader('Access-Control-Allow-Credentials', true);
	next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: true
}));

var mongoUrl = 'mongodb://' + nconf.get('mongo:user') + ':' + nconf.get('mongo:password') + '@' + nconf.get('mongo:host') + '/' + nconf.get('mongo:dbname');
db.mongo({
		url: mongoUrl
	})
	.then(function(res) {
		console.log("Connected correctly to database");
		var db = res.db || {};
		var server = require('http')
			.createServer(app)
			.listen(nconf.get("server:port"), function(req, res) {
				console.log('app listening on port ' + nconf.get('server:port') + '...');

				app.set('views', __dirname + '/views');
				app.set('view engine', 'ejs');
				var SessionStore = require('connect-mongo')(session);
				app.use(cookieParser(cookie_secret));
				var sessionStore = new SessionStore({
					db: db
				});
				app.use(session({
					secret: cookie_secret,
					saveUninitialized: true,
					store: sessionStore,
					resave: true,
					cookie: {
						secure: false,
						domain: DOMAIN,
						maxAge: 1000 * 60 * 60 * 24 * 30
					},
					key: 'sid'
				}));

				chessController.init({
					db: db
				});

				app.use(express.static(__dirname + '/'));

				app.get('/', function(request, response) {
					response.sendFile(__dirname +
						'/hub/index.htm');
				});

				app.get('/start', function(request, response) {
					response.sendFile(__dirname +
						'/views/start.htm');
				});

				app.get('/callback', function(request, response) {
					console.log("Our callback called");
					response.render('callback', {});
				});

				app.get('/logoff', function(request, response) {
					response.clearCookie('sid', 0, {
						'path': '/',
						'domain': DOMAIN
					});
					response.status(200)
						.send("Ok");
				});

				app.use('/api/', (require('./persistent/route.js'))({
					db: db,
					chessController: chessController
				}));

				app.get('/data', function(req, res) {
					var uuid = req.query.uuid;
					chessController.getViewData({
							uuid: uuid,
							session: req.sessionID
						})
						.then(function(data) {
							res.status(200)
								.json(data);
						})
						.catch(function(err) {
							console.log("route error: ", err || "err")
							res.status(400)
								.send(err || "err");
						});
				});

				console.log("Application Started!");

				Titter.init({
					db: db
				}, function(err) {
					if (err) {
						console.log(err);
					} else {
						setInterval(function() {
							Titter.searchAndReply();
						}, 1 * 10 * 1000);
					}
				})
			});
	})
	.catch(function(err) {
		console.log('Error connect to database:' + err.code + ': ' + err.message);
	});
