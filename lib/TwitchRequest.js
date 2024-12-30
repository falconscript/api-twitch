"use strict";

const advancedrequest = require('advancedrequest');

/**
 * TwitchRequest
 *
 * twitch https requests
 */
class TwitchRequest extends advancedrequest.AdvancedRequest {
  constructor (args) {
    super(args);

    // Add tokens only for twitch api
    if (this.opts.url.indexOf('api.twitch.tv') != -1) {
      //this.addHeader('Accept: application/vnd.twitchtv.v5+json'); //outdated
      this.addHeader(`Client-ID: ${TwitchRequest.twitchClientId}`);
    }

    this.REQUESTS_THAT_DONT_NEED_TOKEN = {
      "https://id.twitch.tv/oauth2/token": true,
    };

    // ADD token header if this request URL doesn't show up in the exclusion blacklist above
    if (this.opts.url && !this.REQUESTS_THAT_DONT_NEED_TOKEN[this.opts.url]) {
      if (TwitchRequest.tokenJson && TwitchRequest.tokenJson.access_token) {
        this.addHeader(`Authorization: Bearer ${TwitchRequest.tokenJson.access_token}`);
      } else {
        console.log("[!] TwitchRequest.constructor - WARNING - NO VALID OAUTH TOKEN."); // SHOULD NOT GET HERE
      }
    }
  }

  postProcess () {
    //console.log(`[D] REQ ${this.name} DATA:`, this.data);
    if (!this.data) {
      return this.fail(60, "Blank response! Are we offline? Retrying in a minute.");
    } else if (this.responseStatusCode == 404) {
      console.log(`[-] 404 from ${this.name}. url=${this.opts.url} Passing back 404 object`);
      return this.onFinish(404);
    // NOTE: the 400 issue was for kraken v5 API. might not be relevant for Helix.
    } else if (false && this.responseStatusCode == 400 && ["getInfoForUsersById", "getVodChatLogsRequest"].indexOf(this.name) != -1) {
      console.log(`[-] 400 from ${this.name} url=${this.opts.url} - Continuing as 404`);

      return this.onFinish(404);
    }

    let json;
    try { // can be a json object already by time it gets here
      json = typeof(this.data) === "string" ? JSON.parse(this.data) : this.data;
      this.data = json;

      if (json.error) {
        return this.fail(15, `TwitchAPI error! Err: ${json.error} msg:${json.message ? (' ' + json.message) : ''})`);
      } else if (json.errors) {
        // BIG PROBLEM? API is telling us something went wrong with what we sent, or what they have
        console.log(
          `[!] ${this.constructor && this.constructor.name || "REQUEST"}`,
          ` ERROR RECEIVED FOR REQUEST: name:${this.name}, URL:${this.opts.url}, RECEIVED JSON:`, json
        );
        // Not calling this.fail or exiting... but putting to screen, probably will fail up the chain
      }
    } catch (e) {
      // got something not json-parseable - such as the m3u8_urls_raw_file - allow fall through
      // But if was GQL API request, we print message at least...
      if (this.opts.url.indexOf(`https://api.twitch.tv`) === 0) {
        console.log(
          `[!] ${this.constructor && this.constructor.name || "REQUEST"}`,
          ` ERROR Parsing JSON FOR REQUEST: name:${this.name}, URL:${this.opts.url}, e=${e}, RECV DATA:`, this.data
        );
      }
    }

    return this.onFinish(this.data);
  }
};

// Assign class static variables
Object.assign(TwitchRequest, {
});

module.exports = TwitchRequest;