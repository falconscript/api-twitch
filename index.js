// load externals

const TwitchAPI = require("./lib/TwitchAPI");

module.exports = {
  TwitchAPI: TwitchAPI.TwitchAPI,
  TwitchRequest: TwitchAPI.TwitchRequest,
};
