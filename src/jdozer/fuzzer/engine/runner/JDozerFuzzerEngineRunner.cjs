
const redis = require("redis");
const { randomUUID } = require("crypto");
const { Logger, LogLevel } = require('@nestjs/common');

class jDozerFuzzerEngineRunner {

    #log = new Logger(jDozerFuzzerEngineRunner.name, {
        level: ['error', 'warn', 'log']
    });
    #redis;

    constructor() {
        this.#log.log('Engine started...');
        this.#redisConnect();
    }

    async prepareCases(context, event) {
        this.#log.log(`[prepareCases] Starting...`);

        try {

            let fuzzerRaw = await this.#redis.get('JDF:'.concat(context.vars.testId));

            if (!fuzzerRaw) {
                let err = `Fuzzer id: ${context.vars.testId} not found!`;
                this.#log.error(err);
                throw new Error(err);
            }

            let fuzzer = JSON.parse(fuzzerRaw);

            for (let op of fuzzer.operationIds) {
                await this.#loadDmmCases(fuzzer.id, op);
            }
            return;

        } catch (e) {
            this.#log.error(`[prepareCases] Error in prepareCases: ${e.message}`, e);
            throw e;
        }
    }

    async #getCase(fuzzerId, operationId) {
        try {
            let casesKeys = await this.#getDmmCases(fuzzerId, operationId);
            if (!casesKeys) {
                this.#log.warn(`[#getCase] No DMM cases for operation ${operationId} and fuzzer ${fuzzerId}`);
                return undefined;
            }
            let selectedCaseKeyAndReduce = await this.#getCasesKeys(casesKeys);
            await this.#updateDmmCases(selectedCaseKeyAndReduce, operationId, fuzzerId);

            let dmmCase = {};
            for (let key in selectedCaseKeyAndReduce) {
                if (selectedCaseKeyAndReduce[key].selectedCaseKey != undefined) {
                    dmmCase[key] = selectedCaseKeyAndReduce[key].selectedCaseKey;
                }
            }
            return dmmCase;

        } catch (e) {
            this.#log.error(`[#getCase] Error in getCase: ${e.message}`, e);
            throw e;
        }
    }

    async #updateDmmCases(selectedCaseKeyAndReduce, operationId, fuzzerId) {
        try {
            let keys = Object.keys(selectedCaseKeyAndReduce);
            let dmmCasesKeys = {};
            for (let key of keys) {
                if (selectedCaseKeyAndReduce[key].rest != undefined) {
                    dmmCasesKeys[key] = selectedCaseKeyAndReduce[key].rest;
                    if (dmmCasesKeys[key].length === 0) {
                        let reloaded = await this.#getDmmKeysByType(fuzzerId, operationId, key);
                        dmmCasesKeys[key] = (reloaded.length === 0) ? undefined : reloaded;
                    }
                }
            }
            await this.#redis.set('JDF:'.concat(fuzzerId).concat(':ENG:CASES:').concat(operationId), JSON.stringify(dmmCasesKeys));
            return;
        } catch (e) {
            this.#log.error(`[#updateDmmCases] Error in updateDmmCases: ${e.message}`, e);
            throw e;
        }
    }

    async #getCasesKeys(casesKeys) {
        try {
            let keys = Object.keys(casesKeys);
            let selectedCaseKeyAndReduce = {};
            for (let key of keys) {
                if (casesKeys[key] != undefined) {
                    selectedCaseKeyAndReduce[key] = await this.#getDmmKeyAndReduce(casesKeys[key]);
                }
            }
            return selectedCaseKeyAndReduce;
        } catch (e) {
            this.#log.error(`[#getCasesKeys] Error in getCasesKeys: ${e.message}`, e);
            throw e;
        }
    }

    async #getDmmCases(fuzzerId, operationId) {
        try {
            let qry = 'JDF:'.concat(fuzzerId).concat(':ENG:CASES:').concat(operationId);
            let cases = JSON.parse(await this.#redis.get(qry));
            return (Object.keys(cases).length > 0) ? cases : undefined;
        } catch (e) {
            this.#log.error(`[#getDmmCases] Error in getDmmCases: ${e.message}`, e);
            throw e;
        }
    }

    async #getDmmKeyAndReduce(arr) {
        try {
            if (arr != undefined && arr.length > 0) {
                let c = await this.#redis.get(arr[0]);
                let r = arr.slice(1);
                let keyAndReduce = { selectedCaseKey: c, rest: r };
                return keyAndReduce;
            }
            return {};
        } catch (e) {
            this.#log.error(`[#getDmmKeyAndReduce] Error in getDmmKeyAndReduce: ${e.message}`, e);
            throw e;
        }
    }

    async #loadDmmCases(fuzzerId, operationId) {
        try {

            let attrs = ['headers', 'payload', 'query', 'path'];
            let dmm = {};

            let keys;
            for (let a of attrs) {
                keys = await this.#getDmmKeysByType(fuzzerId, operationId, a);
                if (keys.length > 0)
                    dmm[a] = keys;
            }

            this.#log.verbose(`#loadDmmCases from [${operationId}] - keys: ${Object.keys(dmm)}`);
            await this.#redis.set('JDF:'.concat(fuzzerId).concat(':ENG:CASES:').concat(operationId), JSON.stringify(dmm));

        } catch (e) {
            this.#log.error(`[#loadDmmCases] Error in loadDmmCases: ${e.message}`, e);
            throw e;
        }
    }

    async #getDmmKeysByType(fuzzerId, operationId, type) {
        try {
            let fnd = 'JDF:'.concat(fuzzerId).concat(':DMM:').concat(operationId).concat(':').concat(type).concat(':*');
            return await this.#redis.keys(fnd);
        } catch (e) {
            this.#log.error(`[#getDmmKeysByType] Error in getDmmKeysByType for type ${type}: ${e.message}`, e);
            throw e;
        }
    }

    async beforeRequest(req, context, event, o) {

        try {

            let op = context.scenario.name.toString();
            let request = {
                caseId: req.uuid,
                fuzzerId: context.vars.testId,
                operationId: op,
                url: req.url,
                params: {}
            };

            let dmmCases = await this.#getCase(context.vars.testId, op);
            if (!dmmCases) {
                this.#log.warn(`[beforeRequest] No DMM cases for operation ${op} and fuzzer ${context.vars.testId}`);
                return;
            }

            let params = {};
            params.payload = dmmCases.payload;
            params.headers = dmmCases.headers;
            params.query = dmmCases.query;
            params.path = dmmCases.path;

            if (params.payload) {
                let payload = JSON.parse(params.payload);
                req.body = Buffer.from(payload.data, 'base64').toString('utf8');
                request.payload = payload.data;
                request.params.payloadId = payload.id;
                params.payload_valid = payload.valid;
            } else { params.payload = {} }

            if (params.headers) {
                let headers = JSON.parse(params.headers);
                req.headers = Buffer.from(headers.data, 'base64').toString('utf8');
                request.params.headersId = headers.id;
                params.headers_valid = headers.valid;
            } else { params.headers = {} }

            if (params.query) {
                let query = JSON.parse(params.query);
                req.query = Buffer.from(query.data, 'base64').toString('utf8');
                request.params.queryId = query.id;
                params.query_valid = query.valid;
            } else { params.query = {} }

            if (params.path) {
                let path = JSON.parse(params.path);
                let dataRaw = Buffer.from(path.data, 'base64').toString('utf8');
                let data = JSON.parse(dataRaw);
                let keys = Object.keys(data);

                for (let key of keys) {
                    req.url = req.url.replace(`{${key}}`, data[key]);
                };

                if (keys.length === 0 && params.path.property) {
                    req.url = req.url.replace(`{${path.property}}`, '');
                }

                request.params.pathId = path.id;
                params.path_valid = path.valid;

            } else { params.path = {} }

            const reqKey = 'JDF:'.concat(context.vars.testId).concat(':ENG:').concat(request.operationId).concat(':').concat(request.caseId).concat(':REQ');

            await this.#redis.set(reqKey, JSON.stringify(request)).then(async () => {
                await this.runtimeEvent({
                    caseId: request.caseId,
                    fuzzerId: request.fuzzerId,
                    operationId: request.operationId,
                    scenarioName: context.scenario.name.toString()
                }, 'before-request')
            }).catch(e => this.#log.error(`[beforeRequest] Error while attempting to save the request data: ${e.message}`, e));

        } catch (e) {
            this.#log.error(`[beforeRequest] Error while attempting to save the request data: ${e.message}`, e);
        }
    }

    async afterResponse(req, res, context, event) {

        try {
            let response = {
                operationId: context.scenario.name.toString(),
                caseId: req.uuid,
                uuidRes: res.uuid,
                uuidReq: req.uuid,
                payload: Buffer.from(res.body).toString('base64'),
                headers: res.headers,
                ip: res.ip,
                complete: res.complete,
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                servername: res.servername,
                url: res.url,
                aborted: res.aborted,
                timings: {
                    start: res.timings.start,
                    socket: res.timings.socket,
                    lookup: res.timings.lookup,
                    connect: res.timings.connect,
                    secureConnect: res.timings.secureConnect,
                    secureConnect: res.timings.secureConnect,
                    upload: res.timings.upload,
                    response: res.timings.response,
                    end: res.timings.end,
                    phases: {
                        wait: res.timings.phases.wait,
                        dns: res.timings.phases.dns,
                        tcp: res.timings.phases.tcp,
                        tls: res.timings.phases.tls,
                        request: res.timings.phases.request,
                        firstByte: res.timings.phases.firstByte,
                        download: res.timings.phases.download,
                        total: res.timings.phases.total
                    }
                },
                time: new Date().getTime()
            };

            const reqKey = `JDF:${context.vars.testId}:ENG:${context.scenario.name}:${req.uuid}:REQ`;
            const request = await this.#redis.get(reqKey);

            if (!request) {
                this.#log.error(`[afterResponse] Request not found for key: ${reqKey}`);
                return;
            }

            const resKey = reqKey.replace(':REQ', ':RES');
            await this.#redis.set(resKey, JSON.stringify(response));

            const requestBefore = JSON.parse(request);
            let requestAggregate = Object.assign(requestBefore, req);
            requestAggregate.agent = undefined;
            await this.#redis.set(reqKey, JSON.stringify(requestAggregate)).then(async () => {
                await this.runtimeEvent({
                    fuzzerId: context.vars.testId,
                    operationId: requestAggregate.operationId,
                    caseId: requestAggregate.caseId,
                    scenarioName: context.scenario.name.toString()
                }, 'after-response').catch(e => this.#log.error(`[afterResponse] Error while attempting to send runtime event after response: ${e.message}`, e));
            }).catch(e => this.#log.error(`[afterResponse] Error while attempting to save the request data: ${e.message}`, e));
        } catch (e) {
            this.#log.error(`[afterResponse] Error while attempting to save the response data: ${e.message}`, e);
        }

    }

    async attackCompleted(context) {

        const message = {
            headers: {
                id: randomUUID(),
                timestamp: new Date().getMilliseconds(),
                traceId: context.vars.testId,
                entityId: context.vars.testId,
                entityType: this.ENTITY_TYPE_FUZZER_ENGINE,
                eventType: 'attack-completed',
                version: '1.0'
            },
            payload: {
                fuzzerId: context.vars.testId
            }
        };

        await this.publishEvent(this.CHANNEL_FUZZER_ENGINE, message);
        this.#log.log(`[attackCompleted] Attack completed! - Trace ID: ${context.vars.testId}`);

        return;

    }

    async #redisConnect() {
        if (!this.#redis) {
            this.#log.log(`Attempting to connect to Redis: ${process.env.FUZZER_REDIS_HOST}:${process.env.FUZZER_REDIS_PORT}`);
            this.#redis = redis.createClient({
                url: `redis://${process.env.FUZZER_REDIS_HOST}:${process.env.FUZZER_REDIS_PORT}`
            });
            this.#redis.on("error", (err) => this.#log.error("Redis connect error: ", err));
            this.#redis.connect()
                .then(() => this.#log.log(`Redis connected successfully! - PID: ${process.pid}`))
                .catch(this.#log.error);
        } else {
            this.#log.log("Redis already connected!");
        }
    }

    async publishEvent(channel, message) {

        if (!this.#redis) {
            this.#log.error('[publishEvent] Redis no connected!');
            return;
        }

        try {
            await this.#redis.publish(channel, JSON.stringify(message));
        } catch (error) {
            this.#log.error('[publishEvent] Event exception:', error);
        }
    }

    CHANNEL_FUZZER_ENGINE = 'jdozer:fuzzer:engine';
    ENTITY_TYPE_FUZZER_ENGINE = 'fuzzer-engine';

    async runtimeEvent(payload, eventType) {
        return this.publishEvent(this.CHANNEL_FUZZER_ENGINE, {
            headers: {
                timestamp: Date.now(),
                version: '1.0',
                entityId: payload.fuzzerId,
                entityType: this.ENTITY_TYPE_FUZZER_ENGINE,
                eventType: eventType
            },
            payload: payload
        });
    }

    /**
     * @deprecated
     * @param {*} payload 
     * @param {*} eventType 
     * @returns 
     */
    async runtimeEvents(payload, eventType) {
        return this.publishEvent(`jdozer:fuzzer:engine`, {
            headers: {
                id: randomUUID(),
                fuzzerId: payload.fuzzerId,
                eventType: eventType,
                entityType: 'engine',
                timestamp: Date.now(),
                version: '1.0.0'
            },
            payload: payload
        });
    }

    async afterScenario(context, ee, next) {
        if (context.requestFailed) {
            this.#log.error(`afterScenario: Request failed for operation ${context.scenario.name}`, context);
        }
    }

    async onError(context, ee, next) {
        this.#log.error(`onError: Error for operation ${context.scenario.name}`, context);
    }

};

const engineRunner = new jDozerFuzzerEngineRunner();

module.exports = {

    async before(context, event) {
        await engineRunner.prepareCases(context, event);
    },

    async beforeRequest(req, context, event) {
        await engineRunner.beforeRequest(req, context, event);
    },

    async afterResponse(req, res, context, event) {
        await engineRunner.afterResponse(req, res, context, event);
    },

    async attackCompleted(context) {
        await engineRunner.attackCompleted(context);
    },

    async afterScenario(context, ee, next) {
        await engineRunner.afterScenario(context, ee, next);
    },

    async onError(context, ee, next) {
        await engineRunner.onError(context, ee, next);
    },
    engineRunner
};
