"use strict";

const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const User = require("../models/user.model");
const CacheCleaner = require("../mixins/cache.cleaner.mixin");

module.exports = {
    name: "users",
    mixins: [DbService, CacheCleaner(["users", "webhooks"])],
    adapter: new MongooseAdapter(process.env.MONGO_URI || "mongodb://localhost/tyche", { useNewUrlParser: true, useUnifiedTopology: true }),
    model: User,

    settings: {
        fields: ["name", "userId", "email"],

        // entityValidator: {
        //     userId: { type: "string", optional:true },
        //     name: { type: "string", optional:true },
        //     email: { type: "string", optional:true },
        // },
    },

    actions: {
        create: {
            params: {
                user: { type: "object" }
            },
            async handler(ctx) {
                const user = new User({
                    email: ctx.params.user.email,
                    name: ctx.params.user.name,
                    isAdmin: false,
                });
                return user.save();
            },
        },
    },

    methods: {
        createClientError(msgHead, status, fieldName) {
            return Promise.reject(
                new MoleculerClientError(
                    msgHead + " does not exist",
                    status,
                    msgHead + " does not exist",
                    [{ field: fieldName, message: msgHead + " does not exist" }])
            );

        }
    }
}
