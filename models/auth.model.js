"use strict";

let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let AuthSchema = new Schema({
	password: {
		type: String,
		required: "Please fill in a password"
	},
	userId: {
		type: String,
        unique: true,
		trim: true,
		"required": "Please fill in an user ID"
	},
});

module.exports = mongoose.model("Auth", AuthSchema);
