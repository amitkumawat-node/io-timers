"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Redis = require("ioredis");
const events_1 = require("events");
const debug = require('debug')('io-timers');
var REQUEST_TYPES;
(function (REQUEST_TYPES) {
    REQUEST_TYPES[REQUEST_TYPES["START_TIMER"] = 1] = "START_TIMER";
    REQUEST_TYPES[REQUEST_TYPES["STOP_TIMER"] = 2] = "STOP_TIMER";
    REQUEST_TYPES[REQUEST_TYPES["RESET_TIMER"] = 3] = "RESET_TIMER";
    REQUEST_TYPES[REQUEST_TYPES["REMAINING_TIMER"] = 4] = "REMAINING_TIMER";
})(REQUEST_TYPES || (REQUEST_TYPES = {}));
;
;
;
function createRedisClient(uri, opts) {
    if (uri) {
        return new Redis(uri, opts);
    }
    else {
        return new Redis(opts);
    }
}
class IoTimers {
    constructor(uri, opts = {}) {
        this.timerRequests = new Map();
        this.timers = new events_1.EventEmitter();
        this.pubClient = opts.pubClient || createRedisClient(uri, opts);
        this.subClient = opts.subClient || createRedisClient(uri, opts);
        this.prefix = opts.key || "io-timers";
        const onError = (err) => {
            if (err) {
                this.timers.emit("error", err);
            }
        };
        this.startIoTimerChannel = `${this.prefix}#start`;
        this.stopIoTimerChannel = `${this.prefix}#stop`;
        this.keyExpiredChannel = "__keyevent@0__:expired";
        this.subClient.subscribe([this.startIoTimerChannel, this.stopIoTimerChannel], onError);
        this.subClient.subscribe(this.keyExpiredChannel, onError);
        this.subClient.on("message", this.onMessage.bind(this));
        this.pubClient.on("error", onError);
        this.subClient.on("error", onError);
    }
    onMessage(channel, _msg) {
        switch (channel) {
            case this.keyExpiredChannel:
                this.handleKeyExpire(_msg);
                break;
            case this.stopIoTimerChannel:
                this.handleStopTimer(_msg);
                break;
        }
        return debug('New Message Received : %s At : %s', _msg, channel);
    }
    handleKeyExpire(_msg) {
        let _keyArr = _msg.split(`${this.prefix}#`);
        if (_keyArr.length > 1 && this.timerRequests.has(_keyArr[1])) {
            let _val = this.timerRequests.get(_keyArr[1]);
            this.timerRequests.delete(_keyArr[1]);
            this.timers.emit("timeout", _keyArr[1], _val.opts || null);
        }
        return debug("Timer %s Finished", _msg);
    }
    handleStopTimer(_timerId) {
        if (this.timerRequests.has(_timerId)) {
            this.timerRequests.delete(_timerId);
        }
        return debug("Timer %s Stopped", _timerId);
    }
    keyName(_timerId) {
        return `${this.prefix}#${_timerId}`;
    }
    async startTimer(_timerId, _timeout, opts) {
        this.timerRequests.set(_timerId, {
            type: REQUEST_TYPES.START_TIMER,
            timeout: _timeout,
            opts: opts
        });
        this.pubClient.setex(this.keyName(_timerId), _timeout, 1);
    }
    async stopTimer(_timerId) {
        if (this.timerRequests.has(_timerId)) {
            this.timerRequests.delete(_timerId);
        }
        else {
            this.pubClient.publish(this.stopIoTimerChannel, _timerId);
        }
        return this.pubClient.del(this.keyName(_timerId));
    }
    async remainingTimer(_timerId) {
        try {
            let ttl = await this.pubClient.ttl(this.keyName(_timerId));
            if (ttl == -2)
                return null;
            return ttl;
        }
        catch (error) {
            throw error;
        }
    }
}
module.exports = (uri, opts = {}) => {
    if (uri && typeof uri === "object") {
        opts = uri;
        uri = null;
    }
    return new IoTimers(uri, opts);
};
