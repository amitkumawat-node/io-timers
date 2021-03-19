import * as Redis from 'ioredis';
import { EventEmitter } from 'events';
const debug = require('debug')('io-timers');

enum REQUEST_TYPES{
    START_TIMER= 1,
    STOP_TIMER= 2,
    RESET_TIMER= 3,
    REMAINING_TIMER= 4
};
interface timerValue {
    type: Number,
    timeout: Number,
    opts: any
};

interface IoTimerOption {
    key: string,
    pubClient: string,
    subClient: string
};

function createRedisClient(uri, opts){
    if (uri) {
        return new Redis(uri, opts);
    } else {
        return new Redis(opts);
    }
}

class IoTimers {
    private timerRequests: Map<string, timerValue> = new Map();
    public readonly pubClient: any;
    public readonly subClient: any;
    private prefix: string;
    public readonly timers: EventEmitter = new EventEmitter();
    private readonly startIoTimerChannel: string;
    private readonly stopIoTimerChannel: string;
    private readonly keyExpiredChannel: string;

    constructor(uri: string, opts: Partial<IoTimerOption> = {}) {
        this.pubClient = opts.pubClient || createRedisClient(uri, opts);
        this.subClient = opts.subClient || createRedisClient(uri, opts);
        this.prefix = opts.key || "io-timers";
        const onError = (err: Error) => {
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

    private onMessage(channel: string, _msg: string) {
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

    private handleKeyExpire(_msg: string) {
        let _keyArr = _msg.split(`${this.prefix}#`);
        if (_keyArr.length > 1 && this.timerRequests.has(_keyArr[1])) {
            let _val = this.timerRequests.get(_keyArr[1]);
            this.timerRequests.delete(_keyArr[1]);
            this.timers.emit("timeout", _keyArr[1], _val.opts || null);
        }
        return debug("Timer %s Finished", _msg);
    }

    private handleStopTimer(_timerId: string) {
        if (this.timerRequests.has(_timerId)) {
            this.timerRequests.delete(_timerId);
        }
        return debug("Timer %s Stopped", _timerId);
    }

    private keyName(_timerId: string) {
        return `${this.prefix}#${_timerId}`;
    }

    public async startTimer(_timerId: string, _timeout: number, opts: any) {
        this.timerRequests.set(_timerId, {
            type: REQUEST_TYPES.START_TIMER,
            timeout: _timeout,
            opts: opts
        });
        this.pubClient.setex(this.keyName(_timerId), _timeout, 1);
    }

    public async stopTimer(_timerId: string) {
        if (this.timerRequests.has(_timerId)) {
            this.timerRequests.delete(_timerId);
        } else {
            this.pubClient.publish(this.stopIoTimerChannel, _timerId);
        }
        return this.pubClient.del(this.keyName(_timerId));
    }

    public async remainingTimer(_timerId: string) {
        try {
            let ttl = await this.pubClient.ttl(this.keyName(_timerId));
            if (ttl == -2) return null;
            return ttl;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = (uri?: any, opts: Partial<IoTimerOption> = {}) => {
    if(uri && typeof uri === "object"){
        opts = uri;
        uri = null;
    }
    return new IoTimers(uri, opts);
};