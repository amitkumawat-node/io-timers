const Redis = require('ioredis');
const events = require('events');
const debug = require("debug")("io-timers");

module.exports = exports = createIoTImer;

var RequestType = {
    START_TIMER: 1,
    STOP_TIMER: 2,
    RESET_TIMER: 3,
    REMAINING_TIMER: 4
};

function createRedisClient(uri, opts) {
    if (uri) {
        return new Redis(uri, opts);
    } else {
        return new Redis(opts);
    }
}

function createIoTImer(uri, opts = {}) {
    if (uri && typeof uri === "object") {
        opts = uri;
        uri = null;
    }

    return new IoTimer(uri, opts);
}

class IoTimer {
    constructor(uri, opts = {}) {
        this.requests = new Map();
        this.pubClient = opts.pubClient || createRedisClient(uri, opts);
        this.subClient = opts.subClient || createRedisClient(uri, opts);
        this.prefix = opts.prefix || "io-timers";
        const onError = (err) => {
            if (err) {
                this.timers.emit("error", err);
            }
        };

        this.startIoTimerChannel = `${this.prefix}#start`;
        this.stopIoTimerChannel = `${this.prefix}#stop`;

        this.keyExpiredChannel = "__keyevent@0__:expired";
        // this.subClient.config("SET", "notify-keyspace-event", "Ex");
        this.subClient.subscribe([this.startIoTimerChannel, this.stopIoTimerChannel], onError);
        this.subClient.subscribe(this.keyExpiredChannel, onError);
        this.subClient.on("message", this.onMessage.bind(this));
        this.timers = new events.EventEmitter();
        this.pubClient.on("error", onError);
        this.subClient.on("error", onError);

    }
    keyName(_timerId) {
        return `${this.prefix}#${_timerId}`;
    }

    async startTimer(_timerId, _timeout, opts) {
        this.requests.set(_timerId, {
            type: RequestType.START_TIMER,
            timeout: _timeout,
            opts: opts
        });
        this.pubClient.setex(this.keyName(_timerId), _timeout, 1);
    }

    async stopTimer(_timerId) {
        if (this.requests.has(_timerId)) {
            this.requests.delete(_timerId);
        } else {
            this.pubClient.publish(this.stopIoTimerChannel, _timerId);
        }
        return this.pubClient.del(this.keyName(_timerId));
    }

    async remainingTimer(_timerId) {
        try {
            let ttl = await this.pubClient.ttl(this.keyName(_timerId));
            if (ttl == -2) return null;
            return ttl;
        } catch (error) {
            throw error;
        }
    }
    handleKeyExpire(_msg) {
        let _keyArr = _msg.split(`${this.prefix}#`);
        if (_keyArr.length > 1 && this.requests.has(_keyArr[1])) {
            let _val = this.requests.get(_keyArr[1]);
            this.requests.delete(_keyArr[1]);
            this.timers.emit("timeout", _keyArr[1], _val.opts || null);
        }
        return debug("Timer %s Finished", _msg);
    }

    handleStopTimer(_timerId) {
        if (this.requests.has(_timerId)) {
            this.requests.delete(_timerId);
        }
        return debug("Timer %s Stopped", _timerId);
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
}