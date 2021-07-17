"use strict";

// const { MoleculerError } = require("moleculer").Errors;
const path = require("path");
const express = require("express");
const morgan = require("morgan");
const _ = require("lodash");
const moment = require("moment");
const slugify = require("slugify");
const Hashids = require("hashids/cjs");
const hashids = new Hashids("secret hash", 6);

function encodeObjectID(id) {
    return hashids.encodeHex(id);
}

function decodeObjectID(id) {
    return hashids.decodeHex(id);
}

module.exports = {
    name: "www",

    settings: {
        port: process.env.PORT || 3000,
        pageSize: 5
    },

    //TODO: Implement admin privileges
    methods: {
        initRoutes(app) {
            app.get("/health", this.health);
            app.post("/signup", this.signup);
            app.post("/login", this.login);
            app.post("/webhook/register", this.registerWebhook);
            app.post("/webhook/create", this.createWebhook);
            app.get("/webhook/list", this.listWebhook);
            app.patch("/webhook/update", this.updateWebhook);
            app.post("/webhook/ip", this.triggerWebhook);
        },

        async health(_, res) {
            res.json({
                "status": true,
                "error": null,
                "payload": {
                    "message": "perfectly up and running",
                },
            });
        },

        async signup(req, res) {
            try {
                const user = await this.broker.call("users.create", {
                    "user": {
                        "name": req.body.name,
                        "email": req.body.email,
                    },
                });

                await this.broker.call("auth.signup", {
                    "auth": {
                        "userId": user._id,
                        "email": req.body.email,
                        "password": req.body.password,
                    },
                });

                res.status(201).json({
                    "status": true,
                    "error": null,
                    "payload": {
                        "user": user,
                    },
                });
            } catch (err) {
                return this.handleErr(err);
            }
        },

        async login(req, res) {
            try {
                await this.broker.call("auth.login", {
                    "auth": {
                        "email": req.body.email,
                        "password": req.body.password,
                    }
                });
                res.status(200).json({
                    "status": true,
                    "error": null,
                    "payload": {
                        "message": "verified",
                    },
                });
            } catch (err) {
                return this.handleErr(err);
            }
        },

        async createWebhook(req, res) {
            try {
                const webhook = await this.broker.call("webhooks.create", {
                    "webhook": {
                        "desc": req.body.desc,
                        "slug": req.body.slug,
                    },
                });
                res.status(201).json({
                    "status": true,
                    "error": null,
                    "payload": {
                        "webhook": webhook,
                    },
                });
            } catch (err) {
                return this.handleErr(err);
            }
        },

        async registerWebhook(req, res) {
            try {
                const webhook = await this.broker.call("webhooks.register", {
                    "webhookReg": {
                        "url": req.body.targetUrl,
                        "webhookId": req.body.webhookId,
                        "userId": req.body.userId,
                    },
                });
                res.status(201).json({
                    "status": true,
                    "error": null,
                    "payload": {
                        "webhook": webhook,
                    },
                });
            } catch (err) {
                return this.handleErr(err);
            }
        },

        async listWebhook(_, res) {
            try {
                const webhooks = await this.broker.call("webhooks.list");
                res.status(200).json({
                    "status": true,
                    "error": null,
                    "payload": {
                        "webhooks": webhooks,
                    },
                });
            } catch (err) {
                return this.handleErr(err);
            }
        },

        async updateWebhook(req, res) {
            try {
                const webhook = await this.broker.call("webhooks.update", {
                    "webhookReg": {
                        "_id": req.body.id,
                        "url": req.body.newTargetUrl,
                    },
                });
                res.status(204).json({
                    "status": true,
                    "error": null,
                    "payload": {
                        "webhook": webhook,
                    },
                });
            } catch (err) {
                return this.handleErr(err);
            }
        },

        async triggerWebhook(req, resp) {
            try {
                await this.broker.call("webhooks.trigger", {
                    "ipAddr": req.body.ipAddress,
                });
                resp.status(200).json({
                    "status": true,
                    "error": null,
                    "payload": {
                        "message": "process initiated",
                    },
                });
            } catch (err) {
                return this.handleErr(err);
            }
        },

        handleErr(res) {
            return err => {
                this.logger.error("Request error!", err);

                res.status(err.code || 500).json({
                    "status": false,
                    "error": err.message,
                    "payload": {
                    },
                });
            };
        }
    },

    created() {
        const app = express();
        const baseFolder = path.join(__dirname, "..");

        app.locals._ = _;
        app.locals.truncateContent = val => _.truncate(val, { length: 200 });
        app.locals.moment = moment;
        app.locals.slugify = slugify;
        app.locals.encodeObjectID = encodeObjectID;
        //app.locals.decodeObjectID = decodeObjectID;

        const bodyParser = require('body-parser');
        app.use(bodyParser.urlencoded());
        app.use(bodyParser.json());


        app.set("etag", true);
        app.enable("trust proxy");

        app.use(express["static"](path.join(baseFolder, "public")));

        // Init morgan
        let stream = require("stream");
        let lmStream = new stream.Stream();

        lmStream.writable = true;
        lmStream.write = data => this.logger.info(data);

        app.use(morgan("dev", {
            stream: lmStream
        }));

        if (process.env.NODE_ENV == "production") {
            app.locals.cache = "memory";
            app.set("view cache", true);
        } else {
            // Disable views cache
            app.set("view cache", false);
        }

        this.initRoutes(app);

        this.app = app;
    },

    started() {
        this.app.listen(Number(this.settings.port), err => {
            if (err)
                return this.broker.fatal(err);

            this.logger.info(`WWW server started on port ${this.settings.port}`);
        });

    },

    stopped() {
        if (this.app.listening) {
            this.app.close(err => {
                if (err)
                    return this.logger.error("WWW server close error!", err);

                this.logger.info("WWW server stopped!");
            });
        }
    },
};
