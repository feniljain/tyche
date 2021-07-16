"use strict";

let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let WebhookSchema = new Schema({
	desc: {
		type: String,
		trim: true
	},
	slug: {
		type: String,
		trim: true,
		unique: true,
		required: "Please fill in slug"
	}
}, {
	timestamps: true
});

module.exports = mongoose.model("Webhook", WebhookSchema);
