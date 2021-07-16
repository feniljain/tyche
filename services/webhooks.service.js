"use strict";

const fetch = require('node-fetch');
const COMPLETED = require('../constants.js');
const RETRY = require('../constants.js');
const CONCURRENCY_FACTOR = require('../constants.js');
const DbService = require("moleculer-db");
const parallelLimit = require('async');
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const Webhook = require("../models/webhook.model");
const WebhookReg = require("../models/registered_webhook.model.js");
const WebhookNotif = require("../models/webhook_notification.model.js");
const CacheCleaner = require("../mixins/cache.cleaner.mixin");
const { MoleculerClientError } = require("moleculer").Errors;

module.exports = {
    name: "webhooks",
    //TODO: Use CacheCleaner
    mixins: [DbService],
    // mixins: [DbService, CacheCleaner(["users"])],
    adapter: new MongooseAdapter(process.env.MONGO_URI || "mongodb://localhost/tyche", { useNewUrlParser: true, useUnifiedTopology: true }),
    model: [Webhook, WebhookReg, WebhookNotif],

    settings: {
        fields: ["webhookId", "desc", "slug", "url", "userId", "isActive", "status", "retryCount"],

        entityValidator: {
            webhookId: { type: "string", optional: true },
            desc: { type: "string", optional: true },
            slug: { type: "email", optional: true },
            url: { type: "string", optional: true },
            userId: { type: "string", optional: true },
            isActive: { type: "string", optional: true },
            status: { type: "string", optional: true },
            retryCount: { type: "string", optional: true },
        },
    },

    actions: {
        create: {
            params: {
                webhook: { type: "object" }
            },
            async handler(ctx) {
                //TODO: Uncomment validation
                // let entity = ctx.params.user;
                // await this.validateEntity(entity);

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
                //TODO: Uncomment validation
                // let entity = ctx.params.webhookReg;
                // await this.validateEntity(entity);

                if (!this.userExists(ctx.params.webhookReg.userId)) {
                    return Promise.reject(
                        new MoleculerClientError(
                            "User ID does not exist",
                            422,
                            "User ID does not exist",
                            [{ field: "userId", message: "User Id does not exist" }])
                    );
                }

                if (!this.webhookTypeExists(ctx.params.webhookReg.webhookId)) {
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
            async handler(_) {
                try {
                    let webhookregs = await WebhookReg.find();

                    console.log("HERE1");

                    var requests = [];
                    for (i = 0; i < webhookregs.length; i++) {
                        console.log("HERE-i");
                        requests.push(function(callback) {
                            fetch(webhookregs[i].url, {
                                method: 'post',
                                body: JSON.stringify({
                                    "ipAddress": ctx.params.ipAddr,
                                }),
                                headers: { 'Content-Type': 'application/json' },
                            })
                                .then(res => {
                                    callback(null, {
                                        "webhook": webhook,
                                        "statusCode": res.StatusCode,
                                    });

                                    if (res.statusCode != 200) {
                                        this.addWebhookNotification(webhookregs[i], RETRY);
                                        return;
                                    }
                                    this.addWebhookNotification(webhookregs[i], COMPLETED);
                                })
                        });
                    }

                    console.log(requests);

                    async.parallelLimit(requests, Math.floor(requests.length/CONCURRENCY_FACTOR), function(err, results) {
                        if (err) {
                            return err;
                        }

                        console.log(JSON.stringify(results));
                        return results;
                    });
                } catch (err) {
                    return err
                }
            }
        },
    },

    methods: {
        async userExists(userId) {
            try {
                const user = await ctx.broker.call("users.get", {
                    "userId": userId,
                });
                if (user) {
                    return true;
                }

                return false;
            } catch (err) {
                return false;
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

        addWebhookNotification(webhook, status) {
            if (status == RETRY) {
                console.log(webhook, status);
                return;
            }

            const webhookNotif = new WebhookNotif({
                status: status,
                webhookId: webhook.webhookId,
                userId: webhook.userId,
                retryCount: 0,
            });
            return webhookNotif.save();
        },
    },
};
