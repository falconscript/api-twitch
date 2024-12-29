"use strict";

const advancedrequest = require('advancedrequest');

/**
 * TwitchRequest
 *
 * v5 twitch https requests
 */
class TwitchRequest extends advancedrequest.AdvancedRequest {
  constructor (args) {
    super(args);

    // Add tokens only for twitch api
    if (this.opts.url.indexOf('api.twitch.tv') != -1) {
      this.addHeader('Accept: application/vnd.twitchtv.v5+json');
      this.addHeader('Client-ID: ' + TwitchRequest.twitchClientId);
    }
  }

  postProcess () {
    if (!this.data) {
      return this.fail(60, "Blank response! Are we offline? Retrying in a minute.");
    } else if (this.responseStatusCode == 404) {
      console.log(`[-] 404 from ${this.name}. url=${this.opts.url} Passing back 404 object`);
      return this.onFinish(404);
    } else if (this.responseStatusCode == 400 && ["getDataForChannels", "getVodChatLogsRequest"].indexOf(this.name)) {
      console.log(`[-] 400 from ${this.name} url=${this.opts.url} - Continuing as 404`);
      return this.onFinish(404);
    }

    let json;
    try {
      json = JSON.parse(this.data);
      this.data = json;

      if (json.error) {
        return this.fail(15, "TwitchAPI error! Err: " + json.error);
      }
    } catch (e) {
      // not json-parseable - such as the m3u8_urls_raw_file - allow fall through
    }

    return this.onFinish(this.data);
  }
};

module.exports = TwitchRequest;