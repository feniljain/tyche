"use strict";

let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let WebhookNotificationSchema = new Schema({
	status: {
		type: String,
		trim: true,
		required: "Please fill in status"
	},
    webhookId: {
        type: String,
        trim: true,
        unique: true,
        required: "Please fill in webhook_id"
    },
    userId: {
        type: String,
        trim: true,
        unique: true,
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
