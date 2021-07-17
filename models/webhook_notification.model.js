"use strict";

let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let WebhookNotificationSchema = new Schema({
	status: {
		type: String,
		trim: true,
		required: "Please fill in status"
	},
    ipAddr: {
        type: String,
        trim: true,
    },
    registeredWebhookId: {
        type: String,
        trim: true,
        required: "Please fill in registered_webhook_id"
    },
    userId: {
        type: String,
        trim: true,
        required: "Please fill in user_id"
    },
    retryCount: {
        type: Number,
        required: "Please fill in retry_count"
    },
}, {
	timestamps: true
});

module.exports = mongoose.model("WebhookNotification", WebhookNotificationSchema);
