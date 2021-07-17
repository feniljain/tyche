"use strict";

const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const Auth = require("../models/auth.model");
const CacheCleaner = require("../mixins/cache.cleaner.mixin");
const bcrypt = require('bcrypt');

module.exports = {
    name: "auth",
    mixins: [DbService, CacheCleaner(["users", "webhooks"])],
    adapter: new MongooseAdapter(process.env.MONGO_URI || "mongodb://localhost/tyche", { useNewUrlParser: true, useUnifiedTopology: true }),
    model: Auth,

    settings: {
        fields: ["userId", "password", "email"],

        entityValidator: {
            userId: { type: "string" },
            password: { type: "string" },
            email: { type: "string" },
        },
    },

    actions: {
        signup: {
            params: {
                auth: { type: "object" }
            },
            async handler(ctx) {
                const hashedPassword = bcrypt.hashSync(ctx.params.auth.password, 10);
                const auth = new Auth({
                    email: ctx.params.auth.email,
                    userId: ctx.params.auth.userId,
                    password: hashedPassword,
                });
                auth.save(function(_err, res) {
                    // console.log(res._id);
                });
                return Promise.resolve({ "status": "Ok" });
            },
        },

        login: {
            params: {
                auth: { type: "object" },
            },
            async handler(ctx) {
                try {
                    const auth = await Auth.findOne({
                        email: ctx.params.auth.email,
                    });
                    if (bcrypt.compareSync(ctx.params.auth.password, auth.password)) {
                        return Promise.resolve(auth);
                    } else {
                        return Promise.reject({ "err": "email id or password is incorrect" });
                    }
                } catch (err) {
                    return Promise.reject({ "err": "email id or password is incorrect" });
                }
            },
        }
    },

    methods: {
    },

    async afterConnected() {
        // const count = await this.adapter.count();
        // if (count == 0) {
        // 	return this.seedDB();
        // }
    }
}
