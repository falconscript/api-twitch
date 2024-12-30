"use strict";

// load externals
const TwitchAPI = require("./lib/TwitchAPI");
const TwitchAPI_GQL = require("./lib/TwitchAPI_GQL");

module.exports = {
  TwitchAPI: TwitchAPI.TwitchAPI,
  TwitchRequest: TwitchAPI.TwitchRequest,
  TwitchAPI_GQL: TwitchAPI_GQL.TwitchAPI_GQL,
  TwitchRequest_GQL: TwitchAPI_GQL.TwitchRequest_GQL,
};
