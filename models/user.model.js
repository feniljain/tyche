"use strict";

let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let UserSchema = new Schema({
	name: {
		type: String,
		trim: true,
		"default": ""
	},
	email: {
		type: String,
		trim: true,
		unique: true,
		index: true,
		lowercase: true,
		required: "Please fill in an email"
	},
}, {
	timestamps: true
});

module.exports = mongoose.model("User", UserSchema);
