"use strict";

const advancedrequest = require('advancedrequest');
const { randomUUID } = require('crypto');
const deviceID = randomUUID();

let fullTreePrint = (myObject) => util.inspect(myObject, {showHidden: false, depth: null, colors: true});


/**
 * TwitchRequest_GQL
 *
 * Twitch GQL https requests class
 */
class TwitchRequest_GQL extends advancedrequest.AdvancedRequest {
  constructor (args) {
    super(args);

    // Add tokens only for Twitch GQL API calls
    if (this.opts.url.indexOf(`https://gql.twitch.tv/gql`) === 0) {
      // Apply GQL client_id. Always exists, defined at bottom of file
      this.addHeader(`Client-Id: ${TwitchRequest_GQL.TWITCH_GQL_CLIENT_ID}`);

      // ADD token header if one exists
      if (TwitchRequest_GQL.TWITCH_GQL_OAUTH_TOKEN) {
        this.addHeader(`Authorization: OAuth ${TwitchRequest_GQL.TWITCH_GQL_OAUTH_TOKEN}`);
      }
    }
    

    // Add Integrity token if one is attached to class as static variable
    if (TwitchRequest_GQL.INTEGRITY_TOKEN) {
      this.addHeader(`Client-Integrity: ${TwitchRequest_GQL.INTEGRITY_TOKEN}`)
    }

    // Add extra headers if specified
    if (args.MIMIC_REAL_DEVICE) {
      this.addDeviceMimickingHeaders();
    }
  }

  // optional, don't really think it does much good
  addDeviceMimickingHeaders () {
    this.addHeader('Content-Type: application/json');
    this.addHeader(`X-Device-Id: ${deviceID}`);
    this.addHeader(`user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`);
    this.addHeader(`dnt: 1`);
    this.addHeader(`referer: `);
  }

  postProcess () {
    //console.log(`[D] REQ ${this.name} DATA:`, this.data);
    if (!this.data) {
      return this.fail(60, "Blank response! Are we offline? Retrying in a minute.");
    } else if (this.responseStatusCode == 404) {
      console.log(`[-] 404 from ${this.name}. url=${this.opts.url} Passing back 404 object`);
      return this.onFinish(404);
    // NOTE: the 400 issue was for kraken v5 API. might not be relevant for GQL.
    } else if (false && this.responseStatusCode == 400 && ["getInfoForUsersById", "getVodChatLogsRequest"].indexOf(this.name) != -1) {
      console.log(`[-] 400 from ${this.name} url=${this.opts.url} - Continuing as 404`);

      return this.onFinish(404);
    }

    let json;
    try { // can be a json object already by time it gets here
      json = typeof(this.data) === "string" ? JSON.parse(this.data) : this.data;
      this.data = json;

      if (json.error) {
        return this.fail(15, `TwitchAPIGQL error! Err: ${json.error} msg:${json.message ? (' ' + json.message) : ''})`);
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
      if (this.opts.url.indexOf(`https://gql.twitch.tv/gql`) === 0) {
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
// https://github.com/SuperSonicHub1/twitch-graphql-api?tab=readme-ov-file
// run this RegEx pattern through their HTML if changes: /"Client-ID":"(.*)","Content-Type"/
Object.assign(TwitchRequest_GQL, {
  TWITCH_GQL_CLIENT_ID: "kimne78kx3ncx6brgo4mv6wki5h1ko",
});

module.exports = TwitchRequest_GQL;