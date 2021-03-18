# io-timers
 
## How to use
 
```js
const IoTimers = require('io-timers');
const ioTimers = IoTimers({ host: 'localhost', port: 6379 });
```
 
## API
 
### IoTimers(uri[, opts])
 
`uri` is a string like `localhost:6379` where your redis server
is located. For a list of options see below.
 
### IoTimers(opts)
 
The following options are allowed:
 
- `key`: the name of the key to pub/sub events on as prefix (`io-timers`)
- `host`: host to connect to redis on (`localhost`)
- `port`: port to connect to redis on (`6379`)
- `pubClient`: optional, the redis client to publish events on
- `subClient`: optional, the redis client to subscribe to events on
 
If you decide to supply `pubClient` and `subClient`, make sure you use
[node_redis](https://github.com/mranney/node_redis) as a client or one
with an equivalent API.
 
### IoTimers#startTimer(timerId: String, timeout: Number, opts: Any)
 
Start Timer with give time duration[in Seconds]
timerId should be unique
```js
ioTimers.startTimer("abcTimerId", 10);
```
 
### IoTimers#remaingTimer(timerId: String)
 
Returns remaining time of particular timerId.
 
```js
let remaingTime = await ioTimers.remainingTimer("abcTimerId");
```
 
### IoTimers#stopTimer(timerId: String)
 
Stop timer
 
```js
ioTimers.stopTimer("abcTimerId");
```
 
### IoTimers#timers(id:String, room:String)
 
Add Listener if any timeout
 
```js
ioTimers.timers.on("timeout", function(timerId, opts){
    console.log(timerId, opts);
})
```
 
 
## Client error handling
 
Error Handling
 
```js
ioTimers.timers.on("error", function(err){
    //Handle Error
})
```
 
## License
 
ISC