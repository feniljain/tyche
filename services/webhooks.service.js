"use strict";

const fetch = require('node-fetch');
const constants = require('../constants.js');
const DbService = require("moleculer-db");
const async_pkg = require('async');
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const Webhook = require("../models/webhook.model");
const WebhookReg = require("../models/registered_webhook.model.js");
const WebhookNotif = require("../models/webhook_notification.model.js");
const CacheCleaner = require("../mixins/cache.cleaner.mixin");
const { MoleculerClientError } = require("moleculer").Errors;
const QueueMixin = require("moleculer-rabbitmq");

const queueMixin = QueueMixin({
    connection: "amqp://localhost",
    asyncActions: true, // Enable auto generate .async version for actions
});

module.exports = {
    name: "webhooks",
    mixins: [DbService, CacheCleaner(["users", "webhooks"])],
    adapter: new MongooseAdapter(process.env.MONGO_URI || "mongodb://localhost/tyche", { useNewUrlParser: true, useUnifiedTopology: true }),
    model: [Webhook, WebhookReg, WebhookNotif],

    settings: {
        fields: ["webhookId", "desc", "slug", "url", "userId", "isActive", "status", "retryCount", "webhookNotifId"],

        entityValidator: {
            webhookId: { type: "string", optional: true },
            desc: { type: "string", optional: true },
            slug: { type: "email", optional: true },
            url: { type: "string", optional: true },
            userId: { type: "string", optional: true },
            isActive: { type: "string", optional: true },
            status: { type: "string", optional: true },
            retryCount: { type: "string", optional: true },
            webhookNotifId: { type: "string", optional: true },
        },
    },

    actions: {
        create: {
            params: {
                webhook: { type: "object" }
            },
            async handler(ctx) {
                const webhook = new Webhook({
                    desc: ctx.params.webhook.desc,
                    slug: ctx.params.webhook.slug,
                });

                return webhook.save();
            }
        },

        register: {
            params: {
                webhookReg: { type: "object" }
            },
            async handler(ctx) {

                const userExist = await this.userExists(ctx, ctx.params.webhookReg.userId);
                if (!userExist) {
                return Promise.reject(
                    new MoleculerClientError(
                        "User ID does not exist",
                        422,
                        "User ID does not exist",
                        [{ field: "userId", message: "User Id does not exist" }])
                );
                }

                if (!await this.webhookTypeExists(ctx.params.webhookReg.webhookId)) {
                    return Promise.reject(
                        new MoleculerClientError(
                            "Webhook ID does not exist",
                            422,
                            "Webhook ID does not exist",
                            [{ field: "webhookId", message: "Webhook Id does not exist" }])
                    );
                }

                const webhookReg = new WebhookReg({
                    url: ctx.params.webhookReg.url,
                    webhookId: ctx.params.webhookReg.webhookId,
                    userId: ctx.params.webhookReg.userId,
                    isActive: true,
                });

                return webhookReg.save();
            }
        },

        update: {
            params: {
                webhookReg: { type: "object" }
            },
            async handler(ctx) {

                if (ctx.params.webhookReg._id == "" || ctx.params.webhookReg._id == undefined) {
                    return this.createClientError("Webhook Reg ID", 422, "_id")
                }

                const options = { "upsert": false, "new": true };

                return WebhookReg.findOneAndUpdate(ctx.params.webhookReg._id, { url: ctx.params.webhookReg.url }, options);
            }
        },

        list: {
            cache: true,
            async handler(_) {
                return WebhookReg.find();
            }
        },

        trigger: {
            cache: false,
            params: {
                ipAddr: { type: "string" }
            },
            async handler(ctx) {
                try {
                    let webhookregs = await WebhookReg.find();

                    var requests = [];
                    const that = this;
                    var ts = Math.round((new Date()).getTime() / 1000);
                    for (let i = 0; i < webhookregs.length; i++) {
                        requests.push(function(callback) {
                            fetch(webhookregs[i].url, {
                                method: 'post',
                                body: JSON.stringify({
                                    "ipAddress": ctx.params.ipAddr,
                                    "timestamp": ts,
                                }),
                                headers: { 'Content-Type': 'application/json' },
                            })
                                .then(async (res) => {
                                    callback(null, {
                                        "webhook": webhookregs[i],
                                        "statusCode": res.status,
                                    });

                                    if (res.status != 200) {
                                        that.addWebhookNotification(webhookregs[i], constants.RETRY, ctx);
                                        return;
                                    }
                                    that.addWebhookNotification(webhookregs[i], constants.COMPLETED, ctx);
                                }).catch(err => {
                                    console.log("Fetch error: ", err);
                                });
                        });
                    }

                    let cf = Math.floor(requests.length / constants.CONCURRENCY_FACTOR);
                    if (cf < 1) {
                        cf = constants.CONCURRENCY_FACTOR;
                    }

                    return async_pkg.parallelLimit(requests, cf, function(err, results) {
                        if (err) {
                            console.log("Async error: ", err);
                            return err;
                        }

                        return results;
                    });
                } catch (err) {
                    console.log("Trigger Error: ", err);
                    return err
                }
            }
        },

        retryConsumer: {
            queue: {
                amqp: {
                    queueAssert: {
                        exclusive: false,
                        durable: true,
                    },
                    prefetch: 0,
                },
                retryExchangeAssert: {
                    durable: true,
                    autoDelete: false,
                    alternateExchange: null,
                },
                // retry: true,
                retry: {
                    max_retry: 5,
                    delay: (retry_count) => {
                        return retry_count * 1000;
                    },
                },
            },
            params: {
                webhookNotifId: { type: "string" },
                retryCount: { type: "number" },
            },
            async handler(ctx) {
                this.logger.info(`[CONSUMER] PID: ${process.pid} Received job with webhook_id=${ctx.params.webhookNotifId}`);
                return new Promise(async (resolve, _) => {
                    try {
                        const webhook_notif = await WebhookNotif.findOne({ _id: ctx.params.webhookNotifId });
                        console.log(webhook_notif);

                        if (webhook_notif.retryCount >= 5 || ctx.params.retryCount >= 5) {
                            console.log(webhook_notif._id, " is doomed");
                            return resolve(await this.updateWebhookNotif(webhook_notif, constants.FAILED, webhook_notif.retryCount));
                        }

                        const webhookReg = await WebhookReg.findOne({ _id: webhook_notif.registeredWebhookId })
                        const success = await this.makeReq(webhookReg, webhook_notif.ipAddr);
                        console.log(success);

                        if (success) {
                            return resolve(await this.updateWebhookNotif(ctx.params.webhookNotifId, constants.COMPLETED, webhook_notif.retryCount));
                        } else {
                            const updatedWebhookNotif = await this.updateWebhookNotif(ctx.params.webhookNotifId, constants.RETRY, webhook_notif.retryCount + 1);
                            // console.log(updatedWebhookNotif);
                            await ctx.broker.call("webhooks.retryConsumer", {
                                "webhookNotifId": webhook_notif._id.toString(),
                                "retryCount": ctx.params.retryCount + 1,
                            });
                        }
                    } catch (err) {
                        console.log("queue error: ", err);
                    }
                });
            },
        },
    },

    methods: {
        async updateWebhookNotif(webhookNotifId, status, retryCount) {
            return WebhookNotif.updateOne({_id: webhookNotifId}, {
                status: status,
                retryCount: retryCount,
            });
        },

        async makeReq(webhookReg, ipAddr) {
            var ts = Math.round((new Date()).getTime() / 1000);
            let b = false;
            fetch(webhookReg.url, {
                method: 'post',
                body: JSON.stringify({
                    "ipAddress": ipAddr,
                    "timestamp": ts,
                }),
                headers: { 'Content-Type': 'application/json' },
            })
                .then((res) => {
                    if (res.status != 200) {
                        return;
                    }
                    b = true;
                }).catch(err => {
                    console.log("Fetch error: ", err);
                });

            return b;
        },

        async userExists(ctx, userId) {
            try {
                console.log(userId);
                const user = await ctx.broker.call("users.get", {
                    "user": {
                        "_id": userId.toString(),
                    },
                });
                console.log(user);
                if (user) {
                    return true;
                }

                return false;
            } catch (err) {
                console.log('error:', err);
                // return false;
            }
        },

        async webhookTypeExists(webhookId) {
            const found = await Webhook.findOne({
                _id: webhookId,
            });

            if (found) {
                return true;
            }

            return false;
        },

        createClientError(msgHead, status, fieldName) {
            return Promise.reject(
                new MoleculerClientError(
                    msgHead + " does not exist",
                    status,
                    msgHead + " does not exist",
                    [{ field: fieldName, message: msgHead + " does not exist" }])
            );

        },

        async addWebhookNotification(webhook, status, ctx) {
            try {
                let webhookNotif = new WebhookNotif({
                    status: status,
                    ipAddr: ctx.params.ipAddr,
                    registeredWebhookId: webhook._id,
                    userId: webhook.userId,
                    retryCount: 0,
                });
                const webhookNotifObj = await webhookNotif.save();

                if (status == constants.RETRY) {
                    await ctx.broker.call("webhooks.retryConsumer", {
                        "webhookNotifId": webhookNotifObj._id.toString(),
                        "retryCount": 0,
                    });
                }
                return webhookNotifObj;
            } catch (err) {
                console.log("addWebhookNotification error: ", err);
            }
        },
    },
};
