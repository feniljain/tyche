"use strict";

let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let RegisteredWebhookSchema = new Schema({
    url: {
        type: String,
        trim: true,
        required: "Please fill in url"
    },
    webhookId: {
        type: String,
        trim: true,
        required: "Please fill in webhook_id"
    },
    userId: {
        type: String,
        trim: true,
        required: "Please fill in user_id"
    },
    isActive: {
        type: Boolean,
        "default": true,
    }
});

module.exports = mongoose.model("RegisteredWebhook", RegisteredWebhookSchema);
