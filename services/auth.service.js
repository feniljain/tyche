"use strict";

const _ = require("lodash");
const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const Auth = require("../models/auth.model");
const CacheCleaner = require("../mixins/cache.cleaner.mixin");
const Fakerator = require("fakerator");
const fake = new Fakerator();

module.exports = {
    name: "auth",
    //TODO: Use CacheCleaner
    // mixins: [DbService, CacheCleaner(["users", "posts"])],
    mixins: [DbService],
    adapter: new MongooseAdapter(process.env.MONGO_URI || "mongodb://localhost/tyche", { useNewUrlParser: true, useUnifiedTopology: true }),
    model: Auth,

    settings: {
        fields: ["userId", "password"],

        entityValidator: {
            userId: { type: "string" },
            password: { type: "string" },
        },
    },

    actions: {
        signup: {
            params: {
                auth: { type: "object" }
            },
            async handler(ctx) {
                // let entity = ctx.params.auth;
                // await this.validateEntity(entity);

                //TODO: Add password hash functionality
                const auth = new Auth({
                    userId: ctx.params.auth.userId,
                    password: ctx.params.auth.password,
                });
                auth.save(function(_err, res) {
                    console.log(res._id);
                });
                return Promise.resolve({ "status": "Ok" });
            },
        },
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
